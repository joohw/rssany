// 话题/日报 Agent：话题 = 关键词，日报 = topic/日期，统一用同一套工具

import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { feedAgentTools } from "../agent/tools.js";

/** 日报/话题报告生成时的最大输出 token 数，避免被模型默认值（如 16k）截断导致内容过简 */
const DIGEST_MAX_TOKENS = Number(process.env.DIGEST_MAX_TOKENS) || 32768;


const DIGEST_SYSTEM_PROMPT = `你是一位资深行业信息编辑，负责生成行业简报或话题追踪报告。你的工作准则：只呈现真正重要的信息，用精炼但有深度的语言传递核心价值；每条核心动态需充分展开（事件、数据、影响），避免一句话概括，不堆砌套话。

你拥有以下工具来完成任务：
- list_channels: 列出所有频道
- search_sources: 按关键词或频道筛选信源
- get_feeds: 获取文章列表（支持 channel_id、source_url、全文 q、since/until、tags、author、分页）
- get_feed_detail: 按 id 获取单条文章完整正文

工作流程：先用 get_feeds 获取相关文章（可按 channel_id、tags、since/until 等过滤），识别最重要的 5-8 条后，用 get_feed_detail 读取完整正文，再基于真实内容生成报告。`;


function buildTaskPrompt(
  topic: string,
  periodDays: number,
  previousArticle?: string | null,
  opts?: { searchTags?: string[]; prompt?: string; preflightMatchCount?: number }
): string {
  const until = new Date();
  until.setDate(until.getDate() + 1);
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const hasTags = opts?.searchTags && opts.searchTags.length > 0;
  const tagsStr = hasTags ? opts!.searchTags!.join(",") : "";
  const promptHint = opts?.prompt?.trim() ? `\n\n**用户对该话题的说明**：${opts.prompt}` : "";
  const preflightHint = typeof opts?.preflightMatchCount === "number"
    ? hasTags
      ? opts.preflightMatchCount > 0
        ? `\n\n预检结果：按 tags=${tagsStr} 在最近 ${periodDays} 天内初步匹配到 ${opts.preflightMatchCount} 篇文章。你可以优先从这些相关文章入手，但不必受限于 tags。`
        : `\n\n预检结果：按 tags=${tagsStr} 在最近 ${periodDays} 天内未初步匹配到文章。请不要因此停止，改为扩大范围：先获取该时间窗内的全部文章，再按标题、摘要和正文自行筛选与话题最相关的内容。`
      : `\n\n预检结果：本话题未设置 tags，请直接从该时间范围内的全部文章中筛选。`
    : "";

  const prevSection = previousArticle
    ? `

## 参考：上一期报告（仅供参考）

以下是该话题上一期的报告内容，作背景参考。

\`\`\`
${previousArticle}
\`\`\`
`
    : "";

  const fetchStep = hasTags
    ? `1. 调用 get_feeds（tags="${tagsStr}", since="${sinceStr}", until="${untilStr}", limit=200）获取该话题下的近期文章`
    : `1. 调用 get_feeds（since="${sinceStr}", until="${untilStr}", limit=200）获取该时间范围内的全部文章`;
  return `请为话题「${topic}」撰写一份追踪报告，时间范围为最近 ${periodDays} 天（${sinceStr} 至 ${untilStr}）。${promptHint}${preflightHint}${prevSection}

执行步骤：
${fetchStep}
2. 如果 tags 检索结果过少或没有结果，改为调用 get_feeds（since="${sinceStr}", until="${untilStr}", limit=200）获取该时间范围内的全部文章，再自行筛选与主题相关的内容
3. 根据标题和摘要，判断哪些内容影响力大、值得深读（通常 5-8 条）
4. 对每条重要内容调用 get_feed_detail 获取完整正文（最多调用 8 次）
5. 基于完整正文输出结构化报告

报告输出格式（严格遵循）：

## 话题追踪：${topic}

### 核心动态

按重要性降序排列，每条包含：

#### {序号}. [标题](文章URL)

**相关度**：{0-10分} **关键词**：{2-4 个核心关键词，逗号分隔}

{正文段落一：发生了什么——具体事件、数据、技术细节，150字以上，避免一句话概括}

{正文段落二：影响意义——对行业/用户/竞争格局的影响，以及为什么值得关注，可适当展开}

**来源**：[来源名称](信源URL)

---

### 其他动态

按来源或时间分组列出其余文章，每条格式：
- [标题](文章URL)（[来源](信源URL)）一句话要点

---

注意：
- 所有 URL 完整保留，不得修改或省略
- 行文使用中文，专有名词保留原文
- 核心动态每条正文总字数不少于 200 字（建议 200–400 字），需有具体技术细节、数据或引用支撑，不得泛泛而谈或仅用一两句话概括；报告要有深度，宁可少几条也要写透每条
- 直接输出 Markdown，不要加任何前言、后记或说明性文字`;
}


function createDigestAgent(): Agent {
  const baseModel = getModel("openai", "gpt-4o-mini");
  const baseUrl = process.env.OPENAI_BASE_URL || baseModel.baseUrl;
  const modelId = process.env.OPENAI_MODEL || baseModel.id;
  const useCompletions = baseUrl !== "https://api.openai.com/v1";
  const model = {
    ...baseModel,
    baseUrl,
    id: modelId,
    name: modelId,
    ...(useCompletions && { api: "openai-completions" as const, provider: "openai" as const }),
  };
  return new Agent({
    initialState: {
      systemPrompt: DIGEST_SYSTEM_PROMPT,
      model,
      tools: feedAgentTools,
    },
    getApiKey: () => process.env.OPENAI_API_KEY,
    // 提高单轮输出上限，确保最终报告有足够篇幅与深度（否则易被默认 maxTokens 截断）
    streamFn: (m, ctx, opts) =>
      streamSimple(m, ctx, {
        ...opts,
        maxTokens: Math.min(DIGEST_MAX_TOKENS, (m as { maxTokens?: number }).maxTokens ?? 16384),
      }),
  });
}

/**
 * 用 Agent 生成指定 key 的报告正文（日报、话题均走同一套 buildTaskPrompt）
 */
export async function runDigestAgent(
  key: string,
  options: {
    periodDays?: number;
    previousArticle?: string | null;
    searchTags?: string[];
    prompt?: string;
    preflightMatchCount?: number;
  }
): Promise<string> {
  const agent = createDigestAgent();
  let output = "";

  const prompt = buildTaskPrompt(key, options.periodDays ?? 1, options.previousArticle, {
    searchTags: options.searchTags,
    prompt: options.prompt,
    preflightMatchCount: options.preflightMatchCount,
  });

  return new Promise<string>((resolve, reject) => {
    agent.subscribe((e) => {
      if (e.type === "turn_start") {
        // 每轮开始时重置，只保留最后一轮（最终报告）的输出
        output = "";
      } else if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
        output += e.assistantMessageEvent.delta;
      } else if (e.type === "agent_end") {
        // 过滤推理模型（如 DeepSeek-R1）输出的 <think>...</think> 思考过程
        const cleaned = output.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        resolve(cleaned);
      }
    });

    agent.prompt(prompt).catch(reject);
  });
}

/** @deprecated 使用 runDigestAgent */
export async function runTopicDigestAgent(
  topic: string,
  periodDays: number,
  previousArticle?: string | null
): Promise<string> {
  return runDigestAgent(topic, { periodDays, previousArticle });
}
