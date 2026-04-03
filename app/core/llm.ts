// LLM 统一调用：封装 OpenAI chat completion，供 parser/extractor / pipeline 复用

import OpenAI from "openai";
import { getLLMConfig } from "./llmConfig.js";
import type { LLMConfig } from "./llmConfig.js";

/** 合并调用方配置与环境变量配置 */
function mergeConfig(override?: Partial<LLMConfig> & { apiUrl?: string }): { apiKey: string; baseUrl: string; model: string } {
  const env = getLLMConfig();
  const apiKey = override?.apiKey ?? env.apiKey;
  const baseUrl = override?.apiUrl ?? override?.baseUrl ?? env.baseUrl;
  const model = override?.model ?? env.model;
  if (!apiKey) throw new Error("LLM API Key 未配置，请设置 OPENAI_API_KEY 或传入 apiKey");
  return { apiKey, baseUrl, model };
}

/** 调用 LLM 获取 JSON 响应，供 parser/extractor 复用 */
export async function chatJson(
  prompt: string,
  config?: Partial<LLMConfig> & { apiUrl?: string },
  options?: { maxTokens?: number; debugLabel?: string },
): Promise<Record<string, unknown>> {
  const { apiKey, baseUrl, model } = mergeConfig(config);
  const openai = new OpenAI({ apiKey, baseURL: baseUrl });
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: options?.maxTokens ?? 8192,
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("LLM 返回空内容");
  return JSON.parse(content) as Record<string, unknown>;
}

/** 调用 LLM 获取纯文本响应 */
export async function chatText(
  prompt: string,
  config?: Partial<LLMConfig> & { apiUrl?: string },
  options?: { maxTokens?: number; debugLabel?: string },
): Promise<string> {
  const { apiKey, baseUrl, model } = mergeConfig(config);
  const openai = new OpenAI({ apiKey, baseURL: baseUrl });
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: options?.maxTokens ?? 8192,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("LLM 返回空内容");
  return content;
}

export { getLLMConfig } from "./llmConfig.js";
export type { LLMConfig } from "./llmConfig.js";
