// Agent 能力：pi-agent + MCP 工具，供 Chat 页面使用

import "dotenv/config";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { buildFeedAgentTools } from "./tools.js";
import { USER_SANDBOX_PROFILE_PROMPT } from "./userSandboxProfile.js";

const SYSTEM_PROMPT = `You are an expert research assistant. You help users collect, organize, and answer research questions by querying RSS feeds, searching the web, and fetching page content.

Guidelines:
- Prefer RSS tools when the topic is in subscribed feeds: list_channels for channel metadata, then get_feeds to browse by channel/date/tags, or feeds_search when the user needs keyword search over title/summary/content; use get_feed_detail with item id for full article text.
- Use web_search when the user needs real-time or external information not in feeds.
- Use web_fetch when the user needs the full text of a specific URL (e.g. from search results or feed links).
- Use send_email when the user asks to send an email, forward content, or notify someone by email (to, subject, text or html required).
- For sandbox files (notes, drafts, long documents), use one tool: sandbox with action read | write | replace | list. Paths are relative to your user workspace under .rssany/sandbox/agent/<you> (not shared with other users). For long reads use offset/limit (lines); for replace use a unique old_string or replace_all=1.
- Combine sources when answering: cite which channel, feed item, or URL each claim comes from.
- Keep answers concise; structure with clear sections or bullets when there are multiple findings.
- If a tool returns an error (e.g. missing TAVILY_API_KEY), say so plainly and suggest what the user can do.

Documentation:
- Project architecture and data flow are described in the workspace AGENTS.md. Refer to it when users ask about channels, plugins, sources, or how RSS/enrich/pipeline work.${USER_SANDBOX_PROFILE_PROMPT}`;

/** 创建配置好工具的 Agent 实例；传入 userId 时沙箱文件工具写入该用户独立目录 */
export function createFeedAgent(opts?: { userId?: string }): Agent {
  const userId = opts?.userId;
  const baseModel = getModel("openai", "gpt-4o-mini");
  const baseUrl = process.env.OPENAI_BASE_URL || baseModel.baseUrl;
  const modelId = process.env.OPENAI_MODEL || baseModel.id;
  // DeepSeek 等第三方 API 仅支持 Chat Completions，需用 openai-completions 而非 openai-responses
  const useCompletions = baseUrl !== "https://api.openai.com/v1";
  const model = {
    ...baseModel,
    baseUrl,
    id: modelId,
    name: modelId,
    ...(useCompletions && { api: "openai-completions" as const, provider: "openai" as const }),
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: buildFeedAgentTools(userId),
    },
    getApiKey: () => process.env.OPENAI_API_KEY,
  });
  return agent;
}

export { buildFeedAgentTools } from "./tools.js";
export { ensureUserSandboxProfileFiles, USER_SANDBOX_PROFILE_PROMPT } from "./userSandboxProfile.js";
