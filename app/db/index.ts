// 数据库模块：Supabase（PostgreSQL）实现，替代原 better-sqlite3

import { readFile, writeFile } from "node:fs/promises";
import { supabase } from "./client.js";
import type { FeedItem } from "../types/feedItem.js";
import { normalizeAuthor } from "../types/feedItem.js";
import type { LogEntry } from "../core/logger/types.js";
import { TASKS_CONFIG_PATH, TAGS_CONFIG_PATH } from "../config/paths.js";

// Postgres 处理并发，此处为纯 pass-through，保留导出供现有调用方使用
export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

// Supabase 不需要 integrity check，返回固定字符串
export async function runIntegrityCheck(): Promise<string> {
  const { error } = await supabase.from("items").select("id").limit(1);
  return error ? `Supabase 连接异常: ${error.message}` : "ok";
}

// ─── 辅助 ──────────────────────────────────────────────────────────────────

const DATE_ONLY_TITLE_RE =
  /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s\d,，./-]*(?:st|nd|rd|th)?[\s\d,，./-]*$/i;

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function isDateOnlyTitle(title: string | null | undefined): boolean {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  return DATE_ONLY_TITLE_RE.test(normalized);
}

function toMs(input: string | null | undefined): number | null {
  if (!input) return null;
  const ms = Date.parse(input);
  return Number.isNaN(ms) ? null : ms;
}

export function parseAuthorFromDb(raw: string | null | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p)) return p.filter((s) => typeof s === "string").map((s) => String(s).trim()).filter(Boolean);
    return [String(p).trim()];
  } catch {
    return [raw.trim()];
  }
}

function toDbItem(row: Record<string, unknown>): DbItem {
  const author = parseAuthorFromDb(row.author as string) ?? null;
  const parseJsonArr = (v: unknown): string[] | null => {
    try { return v ? (JSON.parse(v as string) as string[]) : null; } catch { return null; }
  };
  const tags = parseJsonArr(row.tags);
  let translations: Record<string, { title?: string; summary?: string; content?: string }> | null = null;
  try {
    if (row.translations && typeof row.translations === "string") {
      const p = JSON.parse(row.translations) as unknown;
      if (p && typeof p === "object") translations = p as Record<string, { title?: string; summary?: string; content?: string }>;
    }
  } catch { /* ignore */ }
  // drop search_vector from DbItem
  const { search_vector: _, total_count: __, ...rest } = row as Record<string, unknown>;
  return { ...rest, author, tags, translations } as DbItem;
}

function throwIfError(error: { message: string } | null, ctx: string): void {
  if (error) throw new Error(`[db:${ctx}] ${error.message}`);
}

// ─── items CRUD ────────────────────────────────────────────────────────────

export async function upsertItems(
  items: FeedItem[],
  sourceUrlOverride?: string,
): Promise<{ newCount: number; newIds: Set<string> }> {
  if (items.length === 0) return { newCount: 0, newIds: new Set() };
  const sourceUrl = sourceUrlOverride ?? items[0].sourceRef;
  if (!sourceUrl) throw new Error("upsertItems: 需在每条 item 上设置 sourceRef，或传入 sourceUrlOverride");

  const now = new Date().toISOString();
  const rows = items.map((item) => {
    const nextTitle = normalizeText(item.title) || null;
    const nextSummary = normalizeText(item.summary) || null;
    const nextAuthorArr = normalizeAuthor(item.author);
    const nextAuthor = nextAuthorArr?.length ? JSON.stringify(nextAuthorArr) : null;
    const nextPubDate = item.pubDate instanceof Date ? item.pubDate.toISOString() : (item.pubDate ?? null);
    const nextTags = item.tags?.length ? JSON.stringify(item.tags) : null;
    const nextImageUrl = typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null;
    return {
      id: item.guid,
      url: item.link,
      source_url: sourceUrl,
      title: nextTitle,
      author: nextAuthor,
      summary: nextSummary,
      image_url: nextImageUrl,
      tags: nextTags,
      pub_date: nextPubDate,
      fetched_at: now,
    };
  });

  // 先查出哪些 id 已存在
  const ids = rows.map((r) => r.id);
  const { data: existing } = await supabase
    .from("items")
    .select("id, title, author, summary, image_url, pub_date, fetched_at")
    .in("id", ids);
  const existingMap = new Map<string, Record<string, unknown>>(
    (existing ?? []).map((r) => [r.id as string, r as Record<string, unknown>])
  );

  const toInsert: typeof rows = [];
  const toRepair: Array<{ id: string; [k: string]: unknown }> = [];

  for (const row of rows) {
    const ex = existingMap.get(row.id);
    if (!ex) {
      toInsert.push(row);
      continue;
    }
    // repair logic
    const shouldRepairTitle =
      !!row.title && !isDateOnlyTitle(row.title) &&
      (isDateOnlyTitle(ex.title as string) || !normalizeText(ex.title as string));
    const shouldRepairSummary =
      !!row.summary && normalizeText(ex.summary as string).length < row.summary.length;
    const shouldRepairImageUrl = !!row.image_url && !(ex.image_url as string)?.trim();
    const existingAuthorArr = parseAuthorFromDb(ex.author as string);
    const nextAuthorArr = row.author ? JSON.parse(row.author) as string[] : null;
    const shouldRepairAuthor = !!nextAuthorArr?.length && !existingAuthorArr?.length;
    const existingPubDateMs = toMs(ex.pub_date as string);
    const existingFetchedAtMs = toMs(ex.fetched_at as string);
    const nextPubDateMs = toMs(row.pub_date);
    const existingPubDateLooksFallback =
      existingPubDateMs != null && existingFetchedAtMs != null &&
      Math.abs(existingPubDateMs - existingFetchedAtMs) <= 5 * 60 * 1000;
    const shouldRepairPubDate =
      nextPubDateMs != null && (
        existingPubDateMs == null ||
        (existingPubDateLooksFallback && nextPubDateMs < existingPubDateMs - 24 * 60 * 60 * 1000)
      );
    if (!(shouldRepairTitle || shouldRepairSummary || shouldRepairImageUrl || shouldRepairAuthor || shouldRepairPubDate)) continue;
    toRepair.push({
      id: row.id,
      title: shouldRepairTitle ? row.title : (ex.title ?? null),
      author: shouldRepairAuthor ? row.author : (ex.author ?? null),
      summary: shouldRepairSummary ? row.summary : (ex.summary ?? null),
      image_url: shouldRepairImageUrl ? row.image_url : (ex.image_url ?? null),
      pub_date: shouldRepairPubDate ? row.pub_date : (ex.pub_date ?? null),
      fetched_at: now,
    });
  }

  const newIds = new Set<string>();
  if (toInsert.length > 0) {
    const { error } = await supabase.from("items").insert(toInsert);
    throwIfError(error, "upsertItems.insert");
    for (const r of toInsert) newIds.add(r.id);
  }
  for (const r of toRepair) {
    const { id, ...update } = r;
    await supabase.from("items").update(update).eq("id", id);
  }

  return { newCount: newIds.size, newIds };
}

export async function getExistingIds(guids: string[]): Promise<Set<string>> {
  if (guids.length === 0) return new Set();
  const { data } = await supabase.from("items").select("id").in("id", guids);
  return new Set((data ?? []).map((r) => r.id as string));
}

export async function updateItemContent(item: FeedItem): Promise<void> {
  const authorArr = normalizeAuthor(item.author);
  const author = authorArr?.length ? JSON.stringify(authorArr) : null;
  const pubDate = item.pubDate instanceof Date ? item.pubDate.toISOString() : (item.pubDate ?? null);
  const tags = item.tags?.length ? JSON.stringify(item.tags) : null;
  const translations =
    item.translations && Object.keys(item.translations).length > 0
      ? JSON.stringify(item.translations)
      : null;
  const imageUrl =
    typeof item.imageUrl === "string" && item.imageUrl.trim()
      ? item.imageUrl.trim()
      : null;

  // COALESCE logic: only set content/translations if not already present
  const { data: existing } = await supabase
    .from("items")
    .select("content, translations")
    .eq("id", item.guid)
    .single();

  const update: Record<string, unknown> = {
    tags,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(author ? { author } : {}),
    ...(pubDate ? { pub_date: pubDate } : {}),
    ...(item.content && !existing?.content ? { content: item.content } : {}),
    ...(translations && !existing?.translations ? { translations } : {}),
  };

  const { error } = await supabase.from("items").update(update).eq("id", item.guid);
  throwIfError(error, "updateItemContent");
}

export async function queryFeedItems(
  sourceUrls: string[],
  limit: number,
  offset: number,
  opts?: { since?: string; until?: string },
): Promise<{ items: DbItem[]; hasMore: boolean }> {
  if (sourceUrls.length === 0) return { items: [], hasMore: false };

  let query = supabase
    .from("items")
    .select("*")
    .in("source_url", sourceUrls)
    .order("pub_date", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .range(offset, offset + limit); // fetch limit+1 to detect hasMore

  if (opts?.since) {
    const since = opts.since.length === 10 ? `${opts.since}T00:00:00.000Z` : opts.since;
    query = query.gte("fetched_at", since);
  }
  if (opts?.until) {
    let until = opts.until;
    if (until.length === 10) {
      const d = new Date(until + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      until = d.toISOString();
    }
    query = query.lt("fetched_at", until);
  }

  const { data, error } = await query;
  throwIfError(error, "queryFeedItems");
  const rows = (data ?? []) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  return { items: (hasMore ? rows.slice(0, limit) : rows).map(toDbItem), hasMore };
}

export async function getItemById(id: string): Promise<DbItem | null> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  throwIfError(error, "getItemById");
  return data ? toDbItem(data as Record<string, unknown>) : null;
}

export async function queryItemsBySource(
  sourceUrl: string,
  limit = 50,
  since?: Date,
): Promise<DbItem[]> {
  let query = supabase
    .from("items")
    .select("*")
    .eq("source_url", sourceUrl)
    .order("pub_date", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (since) query = query.gte("fetched_at", since.toISOString());

  const { data, error } = await query;
  throwIfError(error, "queryItemsBySource");
  return (data ?? []).map((r) => toDbItem(r as Record<string, unknown>));
}

export async function queryItems(opts: {
  sourceUrl?: string;
  sourceUrls?: string[];
  author?: string;
  q?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}): Promise<{ items: DbItem[]; total: number }> {
  const { sourceUrl, sourceUrls, author, q, tags: tagsFilter, limit = 20, offset = 0, since, until } = opts;

  const { data, error } = await supabase.rpc("query_items", {
    p_source_url: sourceUrl ?? null,
    p_source_urls: sourceUrls?.length ? sourceUrls : null,
    p_author: author?.trim().length && author.trim().length >= 2 ? author.trim() : null,
    p_q: q ?? null,
    p_tags: tagsFilter?.length ? tagsFilter : null,
    p_since: since?.toISOString() ?? null,
    p_until: until?.toISOString() ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  throwIfError(error, "queryItems");
  const rows = (data ?? []) as (Record<string, unknown> & { total_count: string | number })[];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return { items: rows.map(toDbItem), total };
}

export async function removeTagFromAllItems(tag: string): Promise<number> {
  const trimmed = String(tag ?? "").trim();
  if (!trimmed) return 0;
  const { data, error } = await supabase.rpc("remove_tag_from_all_items", { p_tag: trimmed });
  throwIfError(error, "removeTagFromAllItems");
  return Number(data ?? 0);
}

export async function markPushed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("items")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", ids);
  throwIfError(error, "markPushed");
}

export async function deleteItem(id: string): Promise<boolean> {
  if (!id?.trim()) return false;
  const { error, count } = await supabase.from("items").delete({ count: "exact" }).eq("id", id.trim());
  throwIfError(error, "deleteItem");
  return (count ?? 0) > 0;
}

export async function deleteItemsBySourceUrl(sourceUrl: string): Promise<number> {
  if (!sourceUrl?.trim()) return 0;
  const { error, count } = await supabase.from("items").delete({ count: "exact" }).eq("source_url", sourceUrl.trim());
  throwIfError(error, "deleteItemsBySourceUrl");
  return count ?? 0;
}

export async function getPendingPushItems(limit = 100): Promise<DbItem[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .is("pushed_at", null)
    .not("content", "is", null)
    .order("fetched_at", { ascending: true })
    .limit(limit);
  throwIfError(error, "getPendingPushItems");
  return (data ?? []).map((r) => toDbItem(r as Record<string, unknown>));
}

export async function getItemsForDate(date: string): Promise<DbItem[]> {
  const start = new Date(`${date}T00:00:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999`).toISOString();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .gte("fetched_at", start)
    .lte("fetched_at", end)
    .order("fetched_at", { ascending: false })
    .limit(300);
  throwIfError(error, "getItemsForDate");
  return (data ?? []).map((r) => toDbItem(r as Record<string, unknown>));
}

export async function getSourceStats(): Promise<{ source_url: string; count: number; latest_at: string | null }[]> {
  const { data, error } = await supabase.rpc("get_source_stats");
  throwIfError(error, "getSourceStats");
  return (data ?? []).map((r: { source_url: string; count: string | number; latest_at: string | null }) => ({
    source_url: r.source_url,
    count: Number(r.count),
    latest_at: r.latest_at,
  }));
}

// ─── logs ──────────────────────────────────────────────────────────────────

export async function insertLog(entry: LogEntry): Promise<void> {
  await supabase.from("logs").insert({
    level: entry.level,
    category: entry.category,
    message: entry.message,
    payload: entry.payload != null ? JSON.stringify(entry.payload) : null,
    created_at: entry.created_at,
  });
}

export async function queryLogs(opts: {
  level?: LogEntry["level"];
  category?: LogEntry["category"];
  limit?: number;
  offset?: number;
  since?: Date;
}): Promise<{ items: DbLog[]; total: number }> {
  const { level, category, limit = 50, offset = 0, since } = opts;

  let query = supabase.from("logs").select("id, level, category, message, payload, created_at", { count: "exact" });
  if (level) query = query.eq("level", level);
  if (category) query = query.eq("category", category);
  if (since) query = query.gte("created_at", since.toISOString());

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  throwIfError(error, "queryLogs");
  return { items: (data ?? []) as DbLog[], total: count ?? 0 };
}

// ─── 标签统计（复用 items 数据）──────────────────────────────────────────────

function recencyFactor(pubDateMs: number | null, fetchedAtMs: number, nowMs: number): number {
  const ref = pubDateMs ?? fetchedAtMs;
  const daysAgo = (nowMs - ref) / (24 * 60 * 60 * 1000);
  return 1 / (1 + Math.max(0, daysAgo) / 7);
}

export async function getSystemTagStats(): Promise<TagStat[]> {
  const systemTags = await getSystemTags();
  if (systemTags.length === 0) return [];

  const { data } = await supabase
    .from("items")
    .select("tags, pub_date, fetched_at")
    .not("tags", "is", null)
    .neq("tags", "");

  const now = Date.now();
  const tagMap = new Map<string, { count: number; hotness: number }>();
  for (const name of systemTags) tagMap.set(name.toLowerCase(), { count: 0, hotness: 0 });

  for (const row of (data ?? [])) {
    let itemTags: string[];
    try { itemTags = JSON.parse(row.tags as string) as string[]; } catch { continue; }
    const pubMs = row.pub_date ? Date.parse(row.pub_date as string) : null;
    const fetchedMs = Date.parse(row.fetched_at as string);
    const factor = recencyFactor(pubMs, fetchedMs, now);
    for (const t of itemTags) {
      const key = String(t).trim().toLowerCase();
      const entry = tagMap.get(key);
      if (entry) { entry.count += 1; entry.hotness += factor; }
    }
  }

  return systemTags.map((name) => {
    const entry = tagMap.get(name.toLowerCase()) ?? { count: 0, hotness: 0 };
    return { name, count: entry.count, hotness: Math.round(entry.hotness * 100) / 100 };
  });
}

export async function getSuggestedTags(): Promise<TagStat[]> {
  const systemTags = await getSystemTags();
  const systemLower = new Set(systemTags.map((t) => t.toLowerCase().trim()));

  const { data } = await supabase
    .from("items")
    .select("tags, pub_date, fetched_at")
    .not("tags", "is", null)
    .neq("tags", "");

  const tagMap = new Map<string, { name: string; count: number; hotness: number }>();
  const now = Date.now();

  for (const row of (data ?? [])) {
    let tags: string[];
    try { tags = JSON.parse(row.tags as string) as string[]; } catch { continue; }
    const pubMs = row.pub_date ? Date.parse(row.pub_date as string) : null;
    const fetchedMs = Date.parse(row.fetched_at as string);
    const factor = recencyFactor(pubMs, fetchedMs, now);
    for (const t of tags) {
      const trimmed = String(t).trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (systemLower.has(key)) continue;
      const existing = tagMap.get(key);
      if (existing) { existing.count += 1; existing.hotness += factor; }
      else tagMap.set(key, { name: trimmed, count: 1, hotness: factor });
    }
  }

  return Array.from(tagMap.values())
    .filter((s) => s.hotness > 20)
    .sort((a, b) => b.hotness - a.hotness)
    .slice(0, 5)
    .map((s) => ({ name: s.name, count: s.count, hotness: Math.round(s.hotness * 100) / 100 }));
}

// ─── Agent 任务 & 系统标签（文件存储，不依赖 DB）──────────────────────────────

export interface AgentTask {
  title: string;
  prompt?: string;
  description?: string;
  refresh?: number;
}

export async function getAgentTasks(): Promise<AgentTask[]> {
  try {
    const raw = await readFile(TASKS_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { tasks?: unknown[] };
    if (!Array.isArray(parsed?.tasks)) return [];
    const rawTasks = parsed.tasks.filter(
      (t): t is Record<string, unknown> => t != null && typeof t === "object" && typeof (t as { title?: unknown }).title === "string"
    );
    const tasks: AgentTask[] = [];
    for (const t of rawTasks) {
      const title = String((t as { title: string }).title).trim();
      if (!title) continue;
      const prompt = typeof (t as { prompt?: unknown }).prompt === "string" ? (t as { prompt: string }).prompt : "";
      const description = typeof (t as { description?: unknown }).description === "string" ? (t as { description: string }).description : "";
      const r = (t as { refresh?: unknown }).refresh;
      const refresh = typeof r === "number" && !Number.isNaN(r) && r >= 1 ? Math.floor(r) : 1;
      tasks.push({ title, prompt, description, refresh });
    }
    return tasks;
  } catch { return []; }
}

export async function saveAgentTasks(tasks: AgentTask[]): Promise<void> {
  const list = tasks
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .map((t) => ({
      title: t.title.trim(),
      prompt: typeof t.prompt === "string" ? t.prompt : "",
      description: typeof t.description === "string" ? t.description : "",
      refresh: typeof t.refresh === "number" && t.refresh >= 1 ? Math.floor(t.refresh) : 1,
    }));
  await writeFile(TASKS_CONFIG_PATH, JSON.stringify({ tasks: list }, null, 2), "utf-8");
}

export async function getSystemTags(): Promise<string[]> {
  try {
    const raw = await readFile(TAGS_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { tags?: unknown[] };
    if (!Array.isArray(parsed?.tags)) return [];
    return parsed.tags
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
  } catch { return []; }
}

export async function saveSystemTagsToFile(tags: string[]): Promise<void> {
  const list = tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  await writeFile(TAGS_CONFIG_PATH, JSON.stringify({ tags: list }, null, 2), "utf-8");
}

export async function getTagPeriods(): Promise<Record<string, number>> {
  const tasks = await getAgentTasks();
  const out: Record<string, number> = {};
  for (const t of tasks) out[t.title] = Math.max(1, Math.floor(Number(t.refresh)) || 1);
  return out;
}

// ─── 类型 ──────────────────────────────────────────────────────────────────

export interface DbItem {
  id: string;
  url: string;
  source_url: string;
  title: string | null;
  author: string[] | null;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  tags: string[] | null;
  translations: Record<string, { title?: string; summary?: string; content?: string }> | null;
  pub_date: string | null;
  fetched_at: string;
  pushed_at: string | null;
}

export interface DbLog {
  id: number;
  level: string;
  category: string;
  message: string;
  payload: string | null;
  created_at: string;
}

export interface TagStat {
  name: string;
  count: number;
  hotness: number;
  period?: number;
}
