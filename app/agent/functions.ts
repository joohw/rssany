// 纯函数实现：Agent 与 MCP 共用，包装后才是 tools

import nodemailer from "nodemailer";
import { getAllChannelConfigs, collectAllSourceRefs } from "../core/channel/index.js";
import { getItemById, queryItems } from "../db/index.js";
import { getAllSources } from "../scraper/subscription/index.js";
import type { SubscriptionSource } from "../scraper/subscription/types.js";
import { extractHtml } from "../scraper/sources/web/extractor/index.js";

export interface ChannelInfo {
  id: string;
  title: string;
  description: string;
  sourceRefsCount: number;
}

export interface FeedItemSummary {
  id: string;
  url: string;
  source_url: string;
  title: string | null;
  author: string[] | null;
  summary: string | null;
  image_url: string | null;
  pub_date: string | null;
  fetched_at: string;
}

export interface FeedItemDetail extends FeedItemSummary {
  content: string | null;
  pushed_at: string | null;
}

/** list_channels：列出所有 RSS 频道 */
export async function listChannels(): Promise<ChannelInfo[]> {
  const channels = await getAllChannelConfigs();
  return channels.map((ch) => ({
    id: ch.id,
    title: ch.title ?? ch.id,
    description: ch.description ?? "",
    sourceRefsCount: ch.sourceRefs?.length ?? 0,
  }));
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s || typeof s !== "string") return undefined;
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface SourceInfo {
  ref: string;
  label?: string;
  description?: string;
  channel_ids: string[];
}

export interface SearchSourcesArgs {
  /** 关键词，匹配 ref / label / description */
  q?: string;
  /** 仅返回属于该频道的信源 */
  channel_id?: string;
}

/** search_sources：按关键词或频道筛选信源（sources.json + channels 归属） */
export async function searchSources(args: SearchSourcesArgs): Promise<{ sources: SourceInfo[] }> {
  const { q, channel_id } = args;
  const [rawSources, channels] = await Promise.all([getAllSources(), getAllChannelConfigs()]);
  const refToChannels: Record<string, string[]> = {};
  for (const ch of channels) {
    for (const ref of ch.sourceRefs ?? []) {
      if (!ref) continue;
      if (!refToChannels[ref]) refToChannels[ref] = [];
      if (!refToChannels[ref].includes(ch.id)) refToChannels[ref].push(ch.id);
    }
  }
  let list: SubscriptionSource[] = rawSources;
  if (channel_id && channel_id !== "all") {
    const ch = channels.find((c) => c.id === channel_id);
    const refSet = new Set(ch?.sourceRefs ?? []);
    list = list.filter((s) => refSet.has(s.ref));
  }
  if (q && q.trim()) {
    const k = q.trim().toLowerCase();
    list = list.filter(
      (s) =>
        (s.ref && s.ref.toLowerCase().includes(k)) ||
        (s.label && s.label.toLowerCase().includes(k)) ||
        (s.description && s.description.toLowerCase().includes(k))
    );
  }
  const sources: SourceInfo[] = list.map((s) => ({
    ref: s.ref,
    label: s.label,
    description: s.description,
    channel_ids: refToChannels[s.ref] ?? [],
  }));
  return { sources };
}

export interface GetFeedsArgs {
  channel_id?: string;
  source_url?: string;
  q?: string;
  since?: string;
  until?: string;
  tags?: string[];
  author?: string;
  limit?: number;
  offset?: number;
}

/** get_feeds：统一获取 feed 列表（含全文搜索与多维度过滤），不含正文；需正文用 get_feed_detail */
export async function getFeeds(args: GetFeedsArgs): Promise<{
  items: FeedItemSummary[];
  total: number;
}> {
  const {
    channel_id,
    source_url,
    q,
    since,
    until,
    tags,
    author,
    limit = 50,
    offset = 0,
  } = args;
  const channels = await getAllChannelConfigs();
  let sourceUrls: string[] | undefined;
  let sourceUrl: string | undefined;
  if (source_url) {
    sourceUrl = source_url;
  } else if (channel_id && channel_id !== "all") {
    const ch = channels.find((c) => c.id === channel_id);
    sourceUrls = ch?.sourceRefs ?? [];
  } else {
    sourceUrls = collectAllSourceRefs(channels);
  }
  if (sourceUrls?.length === 0 && !sourceUrl) return { items: [], total: 0 };

  const { items, total } = await queryItems({
    sourceUrl,
    sourceUrls,
    q: q?.trim() || undefined,
    author: author && author.trim().length >= 2 ? author.trim() : undefined,
    tags: tags?.length ? tags : undefined,
    limit,
    offset,
    since: parseDate(since),
    until: parseDate(until),
  });
  const noDetail = items.map((it) => ({
    id: it.id,
    url: it.url,
    source_url: it.source_url,
    title: it.title,
    author: it.author,
    summary: it.summary,
    image_url: it.image_url ?? null,
    pub_date: it.pub_date,
    fetched_at: it.fetched_at,
  }));
  return { items: noDetail, total };
}

/** get_feed_detail：按 id 获取单条 feed 完整详情（含 content） */
export async function getFeedDetail(itemId: string): Promise<FeedItemDetail | null> {
  const item = await getItemById(itemId);
  if (!item) return null;
  return {
    id: item.id,
    url: item.url,
    source_url: item.source_url,
    title: item.title,
    author: item.author,
    summary: item.summary,
    image_url: item.image_url ?? null,
    content: item.content,
    pub_date: item.pub_date,
    fetched_at: item.fetched_at,
    pushed_at: item.pushed_at,
  };
}

export interface WebSearchArgs {
  query: string;
  count?: number;
}

/** web_search：通过 Tavily Search API 搜索网页，获取实时信息（需配置 TAVILY_API_KEY） */
export async function webSearch(args: WebSearchArgs): Promise<{
  results: { title: string; url: string; description: string }[];
  error?: string;
}> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return {
      results: [],
      error: "未配置 TAVILY_API_KEY，请在 .env 中设置。获取 API Key: https://tavily.com",
    };
  }
  const { query, count = 8 } = args;
  const q = String(query || "").trim();
  if (!q) return { results: [] };

  try {
    const maxResults = Math.min(20, Math.max(1, count));
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: q,
        max_results: maxResults,
        search_depth: "basic",
        topic: "general",
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        results: [],
        error: `Tavily API ${res.status}: ${errText.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const raw = data?.results ?? [];
    const results = raw
      .filter((r) => r?.url)
      .map((r) => ({
        title: String(r.title ?? "").trim() || "(无标题)",
        url: String(r.url ?? ""),
        description: String(r.content ?? "").trim(),
      }));
    return { results };
  } catch (e) {
    return {
      results: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface WebFetchArgs {
  url: string;
}

/** web_fetch：抓取指定 URL 的网页正文（Readability 提取），适用于静态页面。JS 渲染的 SPA 可能提取不全。 */
export async function webFetch(args: WebFetchArgs): Promise<{
  url: string;
  title?: string;
  author?: string;
  summary?: string;
  content?: string;
  error?: string;
}> {
  const rawUrl = String(args?.url ?? "").trim();
  if (!rawUrl) return { url: rawUrl, error: "url 不能为空" };
  let url: string;
  try {
    url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    new URL(url);
  } catch {
    return { url: rawUrl, error: "无效的 URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { url: res.url || url, error: `HTTP ${res.status}` };
    const html = await res.text();
    if (html.length > 2_000_000) return { url: res.url || url, error: "页面过大（>2MB），已跳过" };
    const extracted = await extractHtml(html, { url: res.url || url, mode: "readability", useCache: false });
    return {
      url: res.url || url,
      title: extracted.title,
      author: extracted.author,
      summary: extracted.summary,
      content: extracted.content?.slice(0, 50000) ?? extracted.content,
    };
  } catch (e) {
    clearTimeout(timeout);
    return {
      url,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
}

/** send_email：通过配置的 SMTP（nicefeed@163.com）发送邮件，供 Agent 使用 */
export async function sendEmail(args: SendEmailArgs): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}> {
  const user = process.env.NICEFEED_SMTP_USER?.trim();
  const pass = process.env.NICEFEED_SMTP_PASSWORD?.trim();
  if (!user || !pass) {
    return {
      ok: false,
      error: "未配置 NICEFEED_SMTP_USER 或 NICEFEED_SMTP_PASSWORD，请在 .env 中设置。",
    };
  }
  const to = String(args?.to ?? "").trim();
  const subject = String(args?.subject ?? "").trim();
  if (!to) return { ok: false, error: "收件人 to 不能为空" };
  if (!subject) return { ok: false, error: "主题 subject 不能为空" };
  const text = args?.text?.trim();
  const html = args?.html?.trim();
  if (!text && !html) return { ok: false, error: "请提供 text 或 html 正文" };

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.163.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from: user,
      to,
      subject,
      ...(text && { text }),
      ...(html && { html }),
      ...(args?.cc?.trim() && { cc: args.cc.trim() }),
      ...(args?.bcc?.trim() && { bcc: args.bcc.trim() }),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
