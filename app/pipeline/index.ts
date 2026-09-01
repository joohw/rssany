/**
 * Pipeline：入库前固定处理链（翻译、打标签等）
 *
 * 与 collectors 同级别，作为条目处理流程而非采集器系统。
 * 步骤开关与排序由 .rssany/config.json 的 pipeline.steps 配置。
 */

import type { FeedItem } from "../types/feedItem.js";
import { isPipelineDroppedItem } from "../types/feedItem.js";
import { qualityFilterMatch, runQualityFilter } from "./qualityFilter.js";
import { taggerMatch, runTagger } from "./tagger.js";
import { translatorMatch, runTranslator } from "./translator.js";
import { loadPipelineConfig } from "./config.js";
import { logger } from "../core/logger/index.js";
import { loadUserPipelines } from "./loader.js";
import type { PipelineContext, PipelineDefinition, PipelineSummary } from "./types.js";

export type { PipelineContext, PipelineDefinition, PipelineSummary } from "./types.js";

const BUILTIN_PIPELINES: PipelineDefinition[] = [
  {
    id: "qualityFilter",
    name: "质量过滤",
    description: "使用 LLM 过滤低质量、无实质内容或垃圾条目",
    process: async (item, context) => qualityFilterMatch(item, context) ? runQualityFilter(item, context) : item,
  },
  {
    id: "tagger",
    name: "自动标签",
    description: "从系统标签库中为条目匹配标签",
    process: async (item, context) => taggerMatch(item, context) ? runTagger(item, context) : item,
  },
  {
    id: "translator",
    name: "翻译",
    description: "将非中文条目翻译为简体中文",
    process: async (item, context) => translatorMatch(item, context) ? runTranslator(item, context) : item,
  },
];

const builtinIds = new Set(BUILTIN_PIPELINES.map((pipeline) => pipeline.id));
let registry = new Map(BUILTIN_PIPELINES.map((pipeline) => [pipeline.id, pipeline]));
let userPipelinePaths = new Map<string, string>();
let initialized = false;

export function isBuiltinPipeline(id: string): boolean {
  return builtinIds.has(id);
}

export function getPipelineDefinition(id: string): PipelineDefinition | undefined {
  return registry.get(id);
}

export function getPipelineFilePath(id: string): string | undefined {
  return userPipelinePaths.get(id);
}

export async function reloadUserPipelines(): Promise<void> {
  const next = new Map(BUILTIN_PIPELINES.map((pipeline) => [pipeline.id, pipeline]));
  const nextPaths = new Map<string, string>();
  for (const { definition, filePath } of await loadUserPipelines()) {
    if (builtinIds.has(definition.id)) {
      logger.warn("pipeline", "用户 Pipeline 与内置 id 冲突，已跳过", { id: definition.id });
      continue;
    }
    if (nextPaths.has(definition.id)) logger.warn("pipeline", "用户 Pipeline id 重复，后加载文件生效", { id: definition.id });
    next.set(definition.id, definition);
    nextPaths.set(definition.id, filePath);
  }
  registry = next;
  userPipelinePaths = nextPaths;
  initialized = true;
}

async function ensurePipelinesLoaded(): Promise<void> {
  if (!initialized) await reloadUserPipelines();
}

export async function listPipelineSummaries(): Promise<PipelineSummary[]> {
  await ensurePipelinesLoaded();
  return Array.from(registry.values()).map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    scope: builtinIds.has(pipeline.id) ? "builtin" : "user",
    canDelete: !builtinIds.has(pipeline.id),
  }));
}

/** 根据配置解析出要执行的步骤（按配置顺序，仅启用且存在的） */
async function getResolvedSteps(stepIds?: string[]): Promise<PipelineDefinition[]> {
  await ensurePipelinesLoaded();
  const configuredIds = stepIds ?? (await loadPipelineConfig()).steps.map((step) => step.id);
  const out: PipelineDefinition[] = [];
  for (const id of configuredIds) {
    const step = registry.get(id);
    if (!step) {
      if (stepIds) throw new Error(`未知 Pipeline: ${id}`);
      logger.debug("pipeline", "未知步骤已跳过", { id });
      continue;
    }
    out.push(step);
  }
  return out;
}

/**
 * 对单条条目执行 pipeline
 */
export async function runPipeline(
  item: FeedItem,
  ctx: PipelineContext,
  stepIds?: string[],
): Promise<FeedItem | null> {
  const steps = await getResolvedSteps(stepIds);
  let current = item;
  for (const step of steps) {
    try {
      const processed = await step.process(current, ctx);
      if (!processed || isPipelineDroppedItem(processed)) return null;
      current = processed;
    } catch (err) {
      logger.warn("pipeline", "步骤执行失败", {
        stepId: step.id,
        item_url: item.link,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return current;
}

/**
 * 对多条条目执行 pipeline
 */
export async function runPipelineBatch(
  items: FeedItem[],
  ctx: PipelineContext
): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const processed = await runPipeline(items[i], ctx);
    if (processed) out.push(processed);
  }
  return out;
}
