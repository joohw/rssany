// Feeder：根据 URL 生成 RSS，直接通过 Source 接口驱动，与具体信源解耦

import { cacheKey, cacheKeyFromCron } from "../core/cacher/index.js";
import { getSource } from "../scraper/sources/index.js";
import { getMatchedEnrichPlugin } from "../plugins/loader.js";
import { runPipeline } from "../pipeline/index.js";
import { buildEnrichContext } from "../scraper/sources/web/index.js";
import { AuthRequiredError } from "../scraper/auth/index.js";
import { buildRssXml } from "./rss.js";
import type { RssChannel, RssEntry } from "./types.js";
import type { FeedItem } from "../types/feedItem.js";
import { normalizeAuthor, getEffectiveItemFields, isPipelineDroppedItem } from "../types/feedItem.js";
import type { FeederConfig } from "./types.js";
import type { SourceContext } from "../scraper/sources/types.js";
import { upsertItems, updateItemContent, getSystemTags, deleteItem } from "../db/index.js";
import { emitFeedUpdated } from "../core/events/index.js";
import { enrichQueue } from "../scraper/enrich/index.js";
import { chatJson, chatText } from "../core/llm.js";
import type { PipelineContext } from "../pipeline/index.js";
import { logger } from "../core/logger/index.js";
import { getDeliverUrl } from "../config/deliver.js";
import { postDeliverItemsSafe } from "../deliver/post.js";


/** 根据 listUrl + items 构建 RssChannel（与 generateAndCache 一致，用于缓存命中时实时生成 XML）；lng 存在时设置 channel.language */
function buildChannelFromItems(listUrl: string, items: FeedItem[], lng?: string | null): RssChannel {
  const channel: RssChannel = {
    title: items[0]?.author?.length ? `${items[0].author[0]} 的订阅` : "RSS 订阅",
    link: listUrl,
    description: `来自 ${listUrl} 的订阅`,
  };
  if (lng) channel.language = lng;
  return channel;
}


/** 根据条目生成 RssEntry：有 lng 且存在译文则用译文，否则用原文；有正文用 content，否则用 summary */
function toRssEntry(item: FeedItem, lng?: string | null): RssEntry {
  const eff = getEffectiveItemFields(item, lng);
  const hasContent = eff.content != null && eff.content !== "";
  const desc = hasContent ? eff.content : eff.summary;
  return {
    title: eff.title,
    link: item.link,
    description: desc,
    guid: item.guid,
    published: item.pubDate?.toISOString?.() ?? undefined,
    imageUrl: item.imageUrl,
  };
}


/** 同一 URL 的首次生成任务去重（仅在初始 fetch+parse 阶段有效） */
const generatingKeys = new Map<string, Promise<{ items: FeedItem[] }>>();


/** Pipeline 上下文 */
const pipelineCtx: PipelineContext = {
  llm: { chatJson, chatText } as PipelineContext["llm"],
  db: { getSystemTags },
};

/** 单条 pipeline */
async function runPipelineOnItem(
  item: FeedItem,
  ctx: { sourceUrl: string; isEnriched?: boolean },
): Promise<FeedItem> {
  return runPipeline(item, { ...pipelineCtx, ...ctx });
}


/** 构建组合 enrich 函数：source.enrichItem 优先，无则用匹配的 enrich 插件补充 */
function buildEnrichFn(
  source: { enrichItem?: (item: FeedItem, ctx: SourceContext) => Promise<FeedItem> },
  listUrl: string,
  ctx: SourceContext,
): (item: FeedItem) => Promise<FeedItem> {
  const enrichCtx = buildEnrichContext(ctx);
  enrichCtx.sourceUrl = listUrl;
  return async (item: FeedItem) => {
    let result = item;
    if (source.enrichItem) {
      result = await source.enrichItem!(item, ctx);
    }
    const plugin = getMatchedEnrichPlugin(result, { sourceUrl: listUrl });
    if (plugin) {
      result = await plugin.enrichItem(result, enrichCtx);
    }
    return result;
  };
}


/** 执行生成流程：获取条目列表；若信源有 enrichItem 或匹配 enrich 插件则提交到 EnrichQueue */
async function generateAndCache(listUrl: string, key: string, config: FeederConfig): Promise<{ items: FeedItem[] }> {
  const { cacheDir = "cache", includeContent = true, headless } = config;
  const source = getSource(listUrl);
  const ctx = { cacheDir, headless, proxy: config.proxy ?? source.proxy };
  let items: FeedItem[];
  try {
    items = await source.fetchItems(listUrl, ctx);
  } catch (err) {
    generatingKeys.delete(key);
    const message = err instanceof Error ? err.message : String(err);
    logger.error("scraper", "抓取失败", { source_url: listUrl, err: message });
    throw err;
  }
  items.forEach((i) => {
    i.sourceRef = listUrl;
    i.author = normalizeAuthor(i.author);
  });
  generatingKeys.delete(key);
  logger.info("scraper", "抓取成功", { source_url: listUrl, count: items.length });

  const deliverUrl = await getDeliverUrl();

  let newCount = 0;
  let newIds = new Set<string>();
  const upsertResult = await upsertItems(items).catch((err) => {
    logger.warn("db", "upsertItems 失败", { source_url: listUrl, err: err instanceof Error ? err.message : String(err) });
    return { newCount: 0, newIds: new Set<string>() };
  });
  newCount = upsertResult.newCount;
  newIds = upsertResult.newIds;

  let pipelineDroppedNew = 0;
  const shouldRunPipelineRow = (guid: string) => newIds.has(guid);

  const hasEnrich =
    source.enrichItem != null || items.some((i) => getMatchedEnrichPlugin(i, { sourceUrl: listUrl }));
  if (!includeContent || items.length === 0 || !hasEnrich) {
    for (let i = 0; i < items.length; i++) {
      if (!shouldRunPipelineRow(items[i].guid)) continue;
      const processed = await runPipelineOnItem(items[i], { sourceUrl: listUrl, isEnriched: false });
      items[i] = processed;
      if (isPipelineDroppedItem(processed)) {
        await deleteItem(processed.guid).catch((err) =>
          logger.warn("db", "质量过滤后删除条目失败", { source_url: listUrl, err: err instanceof Error ? err.message : String(err) })
        );
        pipelineDroppedNew++;
      } else {
        updateItemContent(processed).catch((err) =>
          logger.warn("db", "updateItemContent 失败", { source_url: listUrl, err: err instanceof Error ? err.message : String(err) })
        );
      }
    }
    if (newCount > 0) {
      emitFeedUpdated({ sourceUrl: listUrl, newCount: newCount - pipelineDroppedNew });
    }
    const out = items.filter((i) => !isPipelineDroppedItem(i));
    if (deliverUrl && out.length > 0) {
      await postDeliverItemsSafe(deliverUrl, listUrl, out);
    }
    return { items: out };
  }
  const enrichFn = (item: FeedItem, _ctx: SourceContext) => buildEnrichFn(source, listUrl, ctx)(item);
  await enrichQueue.submit(
    items,
    enrichFn,
    ctx,
    {
      sourceUrl: listUrl,
      onItemDone: async (enrichedItem, index) => {
        enrichedItem.sourceRef = listUrl;
        const processed = shouldRunPipelineRow(enrichedItem.guid)
          ? await runPipelineOnItem(enrichedItem, { sourceUrl: listUrl, isEnriched: true })
          : enrichedItem;
        items[index] = processed;
        if (isPipelineDroppedItem(processed)) {
          await deleteItem(processed.guid).catch((err) =>
            logger.warn("db", "质量过滤后删除条目失败", { source_url: listUrl, err: err instanceof Error ? err.message : String(err) })
          );
          pipelineDroppedNew++;
        } else {
          updateItemContent(processed).catch((err) =>
            logger.warn("db", "updateItemContent 失败", { source_url: listUrl, err: err instanceof Error ? err.message : String(err) })
          );
        }
      },
      onAllDone: async () => {
        for (let i = items.length - 1; i >= 0; i--) {
          if (isPipelineDroppedItem(items[i])) items.splice(i, 1);
        }
        if (newCount > 0) {
          emitFeedUpdated({ sourceUrl: listUrl, newCount: newCount - pipelineDroppedNew });
        }
        if (deliverUrl && items.length > 0) {
          await postDeliverItemsSafe(deliverUrl, listUrl, items);
        }
      },
    },
  );
  return { items };
}


/** 根据 list URL 获取条目列表：按 cron 或 refresh 策略生成时间窗口 key 用于去重，每次均重新抓取 */
export async function getItems(listUrl: string, config: FeederConfig = {}): Promise<{ items: FeedItem[]; fromCache: boolean }> {
  const source = getSource(listUrl);
  const key = config.cron
    ? cacheKeyFromCron(listUrl, config.cron)
    : cacheKey(listUrl, config.refreshInterval ?? source.refreshInterval ?? "1day");
  if (source.preCheck != null) {
    try {
      await source.preCheck({ cacheDir: config.cacheDir ?? "cache", headless: config.headless, proxy: config.proxy ?? source.proxy });
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
      throw err;
    }
  }
  let task = config.force ? undefined : generatingKeys.get(key);
  if (!task) {
    task = generateAndCache(listUrl, key, config);
    if (!config.force) generatingKeys.set(key, task);
  }
  const { items } = await task;
  return { items, fromCache: false };
}


/** 将 FeedItem[] 转为 RSS 2.0 XML 字符串；可选 channelTitle/channelDesc 覆盖默认 */
export function feedItemsToRssXml(
  items: FeedItem[],
  listUrl: string,
  lng?: string | null,
  opts?: { channelTitle?: string; channelDesc?: string }
): string {
  const channel = buildChannelFromItems(listUrl, items, lng);
  if (opts?.channelTitle) channel.title = opts.channelTitle;
  if (opts?.channelDesc) channel.description = opts.channelDesc;
  return buildRssXml(channel, items.map((it) => toRssEntry(it, lng)));
}
