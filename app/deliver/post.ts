// 将条目 / 信源 POST 到下游 Gateway：路径相对基址固定为 /items、/sources、/test

import type { FeedItem } from "../types/feedItem.js";
import { pubDateToIsoOrNull } from "../types/feedItem.js";
import { logger } from "../core/logger/index.js";

export function feedItemsToPayload(items: FeedItem[]): unknown[] {
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
  /** 非空时设置 `Authorization: Bearer <token>`（与 agidaily Gateway 一致） */
  bearerToken?: string;
}

/** Gateway 基址（如 https://agidaily.cc/api/gateway）与路径 items | sources | test 拼接 */
export function joinGatewayPath(gatewayBase: string, segment: "items" | "sources" | "test"): string {
  const base = gatewayBase.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/${segment}`;
}

/** POST { sourceRef, items } 到 {gateway}/items */
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

/** POST 当前 config.json 中的 sources 片段到 {gateway}/sources */
export async function postDeliverSources(
  url: string,
  sourcesJson: string,
  options?: PostDeliverOptions,
): Promise<void> {
  if (!url.trim() || !sourcesJson.trim()) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  const t = options?.bearerToken?.trim();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(url.trim(), {
    method: "POST",
    headers,
    body: sourcesJson,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

export async function postDeliverSourcesSafe(
  url: string,
  sourcesJson: string,
  options?: PostDeliverOptions,
): Promise<void> {
  try {
    await postDeliverSources(url, sourcesJson, options);
  } catch (err) {
    logger.warn("deliver", "信源配置投递失败", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** POST 连通性测试体到 {gateway}/test（由路由组装的 JSON） */
export async function postDeliverGatewayTest(
  gateway: string,
  body: unknown,
  options?: PostDeliverOptions,
): Promise<void> {
  const url = joinGatewayPath(gateway, "test");
  if (!url) throw new Error("gateway 不能为空");
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  const t = options?.bearerToken?.trim();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}
