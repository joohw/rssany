/**
 * Pipeline 配置：从 .rssany/config.json 的 pipeline 块读取
 *
 * 格式：{ "pipeline": { "steps": [{ "id": "qualityFilter" }, ...] } }
 * - steps 数组顺序即执行顺序；存在于数组中即启用
 */

import { readConfigFile, updateConfigFile } from "../config/configFile.js";

export interface PipelineStepConfig {
  id: string;
}

export interface PipelineConfig {
  steps: PipelineStepConfig[];
}

/** 可用步骤 id */
export const PIPELINE_STEP_IDS = ["qualityFilter", "tagger", "translator"] as const;

function parseSteps(rawSteps: unknown[]): PipelineStepConfig[] {
  const steps: PipelineStepConfig[] = [];
  const seen = new Set<string>();
  for (const s of rawSteps) {
    if (s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string") {
      const obj = s as { id: string; enabled?: unknown };
      const id = obj.id.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (obj.enabled === false || obj.enabled === 0) continue;
      steps.push({ id });
    }
  }
  return steps;
}

/** 读取 Pipeline 编排；兼容旧 enabled:false 配置并将其视为未编排。 */
export async function loadPipelineConfig(): Promise<PipelineConfig> {
  try {
    const parsed = await readConfigFile() as { pipeline?: { steps?: unknown[] } };
    const rawSteps = Array.isArray(parsed?.pipeline?.steps) ? parsed.pipeline.steps : [];
    return { steps: parseSteps(rawSteps) };
  } catch {
    // 文件不存在或解析失败
  }
  return { steps: [] };
}

/** 保存 pipeline 配置到 config.json（合并其他块，不覆盖） */
export async function savePipelineConfig(config: PipelineConfig): Promise<void> {
  await updateConfigFile((root) => {
    root.pipeline = { steps: config.steps };
  });
}
