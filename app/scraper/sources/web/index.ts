// 站点采集器包装：将 SiteCollector 包装为 Collector，注入 SiteCollectorContext 工具

import { fetchHtml as fetchHtmlFn, preCheckAuth } from "./fetcher/index.js";
import { extractHtml } from "./extractor/index.js";
import { parseHtml } from "./parser/index.js";
import { toAuthFlow, getSiteByUrl } from "./site.js";
import { AuthRequiredError } from "../../auth/index.js";
import type { SiteCollector, SiteCollectorContext } from "./site.js";
import type { Collector, CollectorContext } from "../types.js";
import type { FeedItem } from "../../../types/feedItem.js";
import { normalizeAuthor } from "../../../types/feedItem.js";


/** 从 CollectorContext + SiteCollector 构建注入了工具的 SiteCollectorContext */
export function buildSiteCollectorContext(site: SiteCollector, ctx: CollectorContext): SiteCollectorContext {
  const proxy = ctx.proxy ?? site.proxy;
  const authFlow = toAuthFlow(site);
  return {
    cacheDir: ctx.cacheDir,
    headless: ctx.headless,
    proxy,
    deps: ctx.deps,
    async fetchHtml(url, opts) {
      const res = await fetchHtmlFn(url, {
        cacheDir: ctx.cacheDir,
        useCache: false,
        authFlow,
        headless: ctx.headless,
        proxy,
        waitAfterLoadMs: opts?.waitMs,
        purify: opts?.purify,
        waitForSelector: opts?.waitForSelector,
        waitForSelectorTimeoutMs: opts?.waitForSelectorTimeoutMs,
        scrollBeforeSnapshot: opts?.scrollBeforeSnapshot,
        useHttpResponseBody: opts?.useHttpResponseBody,
      });
      return { html: res.body, finalUrl: res.finalUrl ?? url, status: res.status };
    },
    async extractItem(item, opts) {
      const res = await fetchHtmlFn(item.link, {
        cacheDir: ctx.cacheDir,
        useCache: false,
        authFlow,
        headless: ctx.headless,
        proxy,
      });
      if (res.status !== 200 && res.status !== 304) {
        throw new Error(`默认正文提取失败: HTTP ${res.status} ${res.statusText} for ${item.link}`);
      }
      const extracted = await extractHtml(res.body, {
        url: res.finalUrl ?? item.link,
        cacheDir: ctx.cacheDir ?? undefined,
        mode: "readability",
        useCache: true,
        cacheKey: opts?.cacheKey,
      });
      const pubDate =
        extracted.pubDate != null
          ? typeof extracted.pubDate === "string"
            ? new Date(extracted.pubDate)
            : extracted.pubDate
          : item.pubDate;
      return {
        ...item,
        author: normalizeAuthor(extracted.author ?? item.author),
        title: extracted.title ?? item.title,
        summary: extracted.summary ?? item.summary,
        content: extracted.content ?? item.content,
        pubDate,
      };
    },
  };
}


/** 将 SiteCollector 包装为统一 Collector 接口 */
export function createWebCollector(site: SiteCollector): Collector {
  const authFlow = toAuthFlow(site);
  return {
    id: site.id,
    name: site.name,
    pattern: site.listUrlPattern,
    priority: 50,
    refreshInterval: site.refreshInterval ?? undefined,
    proxy: site.proxy ?? undefined,
    preCheck: authFlow
      ? async (ctx: CollectorContext) => {
          if (!ctx.cacheDir) return;
          const passed = await preCheckAuth(authFlow, ctx.cacheDir, {
            proxy: ctx.proxy,
            headless: ctx.headless,
          });
          if (!passed) throw new AuthRequiredError(`站点 ${site.id} 需要登录，请先执行 ensureAuth`);
        }
      : undefined,
    async fetchItems(sourceId: string, ctx: CollectorContext): Promise<FeedItem[]> {
      return site.fetchItems(sourceId, buildSiteCollectorContext(site, ctx));
    },
  };
}


/** 通用网页采集器：兜底匹配所有 http/https URL，使用浏览器抓取 + LLM 解析 */
export const genericWebCollector: Collector = {
  id: "generic",
  pattern: /^https?:\/\//,
  priority: 200,
  async fetchItems(sourceId: string, ctx: CollectorContext): Promise<FeedItem[]> {
    const res = await fetchHtmlFn(sourceId, {
      cacheDir: ctx.cacheDir,
      useCache: true,
      headless: ctx.headless,
      proxy: ctx.proxy,
    });
    // 304 Not Modified：浏览器用缓存，page.content() 仍会返回完整 HTML，视为成功
    if (res.status !== 200 && res.status !== 304) {
      throw new Error(`抓取失败: HTTP ${res.status} ${res.statusText}`);
    }
    const parsed = await parseHtml(res.body, {
      url: res.finalUrl ?? sourceId,
    });
    return parsed.items;
  },
};


/** 保存已加载的 SiteCollector 对象（供 auth 路由、调试路由直接访问） */
const loadedSiteCollectors: SiteCollector[] = [];


/** 更新已加载站点列表（由 sources/index.ts 调用） */
export function setLoadedSiteCollectors(sites: SiteCollector[]): void {
  loadedSiteCollectors.length = 0;
  loadedSiteCollectors.push(...sites);
}


/** 根据 id 获取底层站点采集器（用于 auth 路由） */
export function getSiteCollector(id: string): SiteCollector | undefined {
  return loadedSiteCollectors.find((site) => site.id === id);
}


/** 获取所有已加载的站点采集器（用于采集器列表 API） */
export function getCollectorSites(): SiteCollector[] {
  return loadedSiteCollectors.filter((site) => site.id !== "generic");
}


/** 根据 URL 获取最具体匹配的站点采集器（用于调试路由） */
export function getBestSiteCollector(url: string): SiteCollector | undefined {
  return getSiteByUrl(url, loadedSiteCollectors);
}


export type { SiteCollector, SiteCollectorContext } from "./site.js";
export { toAuthFlow, computeSpecificity } from "./site.js";
export { loadSiteCollectors } from "../../../collectors/loader.js";
