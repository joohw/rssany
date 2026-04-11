// 将条目 POST 到下游：JSON 体为 { sourceRef, items }

import type { FeedItem } from "../types/feedItem.js";
import { pubDateToIsoOrNull } from "../types/feedItem.js";
import { logger } from "../core/logger/index.js";

function feedItemsToPayload(items: FeedItem[]): unknown[] {
  return items.map((i) => ({
    guid: i.guid,
    title: i.title,
    link: i.link,
    pubDate: pubDateToIsoOrNull(i.pubDate) ?? new Date().toISOString(),
    author: i.author,
    summary: i.summary,
    content: i.content,
    tags: i.tags,
    sourceRef: i.sourceRef,
    translations: i.translations,
  }));
}

export interface PostDeliverOptions {
  /** 非空时设置 `Authorization: Bearer <token>`（与 agidaily `POST /api/gateway/items` 一致） */
  bearerToken?: string;
}

/** POST { sourceRef, items } 到投递 URL；失败时打日志并抛出 */
export async function postDeliverItems(
  url: string,
  sourceRef: string,
  items: FeedItem[],
  options?: PostDeliverOptions,
): Promise<void> {
  if (!url.trim() || items.length === 0) return;
  const body = JSON.stringify({ sourceRef, items: feedItemsToPayload(items) });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = options?.bearerToken?.trim();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(url.trim(), {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

export async function postDeliverItemsSafe(
  url: string,
  sourceRef: string,
  items: FeedItem[],
  options?: PostDeliverOptions,
): Promise<void> {
  try {
    await postDeliverItems(url, sourceRef, items, options);
  } catch (err) {
    logger.warn("deliver", "投递失败", {
      sourceRef,
      count: items.length,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
