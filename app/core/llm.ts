// LLM 统一调用：封装 OpenAI chat completion，供 parser/extractor / pipeline 复用

import type { ChatCompletion } from "openai/resources/chat/completions";
import { getLLMConfig } from "./llmConfig.js";
import type { LLMConfig } from "./llmConfig.js";

/** 从非流式 chat completion 取出助手文本；content 为空时检查 refusal、finish_reason */
function extractAssistantText(completion: ChatCompletion): string {
  const choice = completion.choices[0];
  if (!choice) throw new Error("LLM 返回无 choices");
  const msg = choice.message;
  const raw = msg.content;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.length > 0) return t;
  }
  // DeepSeek deepseek-reasoner：推理在 reasoning_content，答复在 content；总输出受 max_tokens 限制，可能仅有 reasoning_content
  const extra = msg as unknown as Record<string, unknown>;
  const rc = extra.reasoning_content;
  if (typeof rc === "string" && rc.trim().length > 0) {
    return rc.trim();
  }
  const refusal = msg.refusal;
  if (typeof refusal === "string" && refusal.trim()) {
    throw new Error(`模型拒绝: ${refusal.trim()}`);
  }
  const fr = choice.finish_reason;
  if (fr === "tool_calls") {
    throw new Error("LLM 返回了工具调用而非文本，请换一个模型或关闭工具调用");
  }
  if (fr === "content_filter") {
    throw new Error("内容被内容策略过滤");
  }
  if (fr === "length") {
    throw new Error(
      "LLM 输出在 content / reasoning_content 均为空前已用尽",
    );
  }
  throw new Error(`LLM 返回空内容 (finish_reason=${String(fr)})`);
}

/** 合并调用方配置与环境变量配置 */
function mergeConfig(override?: Partial<LLMConfig> & { apiUrl?: string }): { apiKey: string; baseUrl: string; model: string } {
  const env = getLLMConfig();
  const apiKey = override?.apiKey ?? env.apiKey;
  const baseUrl = override?.apiUrl ?? override?.baseUrl ?? env.baseUrl;
  const model = override?.model ?? env.model;
  if (!apiKey) throw new Error("LLM API Key 未配置：请在管理后台「设置 → LLM」或环境变量 OPENAI_API_KEY 中设置");
  return { apiKey, baseUrl, model };
}

/** 调用 LLM 获取 JSON 响应，供 parser/extractor 复用 */
export async function chatJson(
  prompt: string,
  config?: Partial<LLMConfig> & { apiUrl?: string },
  options?: { maxTokens?: number; debugLabel?: string },
): Promise<Record<string, unknown>> {
  const { apiKey, baseUrl, model } = mergeConfig(config);
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey, baseURL: baseUrl });
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: options?.maxTokens ?? 8192,
    response_format: { type: "json_object" },
  });
  const content = extractAssistantText(completion);
  return JSON.parse(content) as Record<string, unknown>;
}

/** 调用 LLM 获取纯文本响应 */
export async function chatText(
  prompt: string,
  config?: Partial<LLMConfig> & { apiUrl?: string },
  options?: { maxTokens?: number; debugLabel?: string },
): Promise<string> {
  const { apiKey, baseUrl, model } = mergeConfig(config);
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey, baseURL: baseUrl });
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: options?.maxTokens ?? 8192,
  });
  return extractAssistantText(completion);
}

export { getLLMConfig } from "./llmConfig.js";
export type { LLMConfig } from "./llmConfig.js";
