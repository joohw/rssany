/**
 * Pipeline 配置：从 .rssany/config.json 的 pipeline 块读取
 *
 * 格式：{ "pipeline": { "steps": [{ "id": "qualityFilter", "enabled": false }, ...] } }
 * - steps 数组顺序即执行顺序，enabled: false 的步骤跳过
 */

import { readConfigFile, updateConfigFile } from "../config/configFile.js";

export interface PipelineStepConfig {
  id: string;
  enabled: boolean;
}

export interface PipelineConfig {
  steps: PipelineStepConfig[];
}

/** 默认配置（入库前） */
export const DEFAULT_PIPELINE_STEPS: PipelineStepConfig[] = [
  { id: "qualityFilter", enabled: false },
  { id: "tagger", enabled: false },
  { id: "translator", enabled: false },
];

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
      const enabled = obj.enabled;
      steps.push({
        id,
        enabled: enabled !== false && enabled !== 0,
      });
    }
  }
  return steps;
}

/** 与默认步骤表对齐：保证 JSON 里出现的步骤 id 齐全、顺序与默认一致，已有项保留 enabled */
function mergeWithDefaultSteps(userSteps: PipelineStepConfig[]): PipelineStepConfig[] {
  const map = new Map(userSteps.map((s) => [s.id, s]));
  return DEFAULT_PIPELINE_STEPS.map((def) => {
    const u = map.get(def.id);
    return { id: def.id, enabled: u ? u.enabled : def.enabled };
  });
}

/** 读取 pipeline 配置，缺失时返回默认；已存在的 config 会与默认步骤合并，使新步骤（如 qualityFilter）始终出现在列表中 */
export async function loadPipelineConfig(): Promise<PipelineConfig> {
  try {
    const parsed = await readConfigFile() as { pipeline?: { steps?: unknown[] } };
    const rawSteps = Array.isArray(parsed?.pipeline?.steps) ? parsed.pipeline.steps : [];
    const steps = mergeWithDefaultSteps(parseSteps(rawSteps));
    if (steps.length > 0) return { steps };
  } catch {
    // 文件不存在或解析失败
  }
  return { steps: [...DEFAULT_PIPELINE_STEPS] };
}

/** 保存 pipeline 配置到 config.json（合并其他块，不覆盖） */
export async function savePipelineConfig(config: PipelineConfig): Promise<void> {
  await updateConfigFile((root) => {
    root.pipeline = { steps: config.steps };
  });
}
