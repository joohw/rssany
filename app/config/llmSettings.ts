// LLM：读写 .rssany/config.json 的 llm 块；与 OPENAI_* 环境变量合并见 core/llmConfig.ts

import { readConfigFile, updateConfigFile } from "./configFile.js";
import { invalidateLLMConfigCache } from "../core/llmConfig.js";

export interface LlmFileConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function trimOrUndef(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

/** 读取 config.json 中的 llm 块（无则空） */
export async function readLlmFileConfig(): Promise<LlmFileConfig> {
  try {
    const j = await readConfigFile() as { llm?: unknown };
    const llm = j?.llm;
    if (!llm || typeof llm !== "object") return {};
    const o = llm as Record<string, unknown>;
    return {
      apiKey: typeof o.apiKey === "string" ? o.apiKey : undefined,
      baseUrl: trimOrUndef(o.baseUrl),
      model: trimOrUndef(o.model),
    };
  } catch {
    return {};
  }
}

export interface SaveLlmSettingsInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** 合并写入 config.json 的 llm 块，不覆盖其它顶层字段 */
export async function saveLlmSettings(input: SaveLlmSettingsInput): Promise<void> {
  const prev = await readLlmFileConfig();
  const next: Record<string, unknown> = {
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
  };

  const newKey = typeof input.apiKey === "string" && input.apiKey.length > 0 ? input.apiKey : undefined;
  if (newKey) {
    next.apiKey = newKey;
  } else if (prev.apiKey) {
    next.apiKey = prev.apiKey;
  }

  await updateConfigFile((root) => {
    root.llm = next;
  });
  invalidateLLMConfigCache();
}
