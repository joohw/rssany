// Admin 路由：解析调试、正文提取调试

import type { Hono } from "hono";
import { getSource } from "../../scraper/sources/index.js";
import { buildSourceContext } from "../../scraper/sources/context.js";
import { extractFromLink } from "../../scraper/sources/web/extractor/index.js";
import { CACHE_DIR } from "../../config/paths.js";
import { AuthRequiredError } from "../../scraper/auth/index.js";
import { parseUrlFromPath, readStaticHtml, escapeHtml } from "../utils.js";
import { requireAdmin } from "../../auth/middleware.js";
import { getEffectiveProxyForListUrl } from "../../scraper/subscription/index.js";

/** 与 fetcher `resolveProxy` 一致：调试 query 优先 → config sources / Source.proxy → 环境变量 */
function effectiveProxyUsed(override: string | undefined, mergedFromSource: string | undefined): string | undefined {
  const o = override?.trim();
  if (o) return o;
  const s = mergedFromSource?.trim();
  if (s) return s;
  return process.env.HTTP_PROXY?.trim() || process.env.HTTPS_PROXY?.trim();
}

function redactProxyForLog(p: string | undefined): string | null {
  if (!p) return null;
  try {
    const u = new URL(p);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return null;
  }
}

export function registerAdminRoutes(app: Hono): void {
  async function render401(listUrl: string): Promise<string> {
    const raw = await readStaticHtml("401", "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>401</title></head><body><h1>401 需要登录</h1></body></html>");
    return raw.replace(/\{\{listUrl\}\}/g, escapeHtml(listUrl));
  }

  /** Parse 与插件解耦：始终通过 getSource(url) 解析，无匹配插件时自动走 generic（浏览器抓取 + LLM 解析），与 /rss/* 行为一致 */
  app.get("/admin/parse/*", requireAdmin(), async (c) => {
    const url = parseUrlFromPath(c.req.path, "/admin/parse");
    if (!url) return c.text("无效 URL，格式: /admin/parse/https://... 或 /admin/parse/example.com/...", 400);
    try {
      // 调试默认有头浏览器；仅 headless=true|1 时使用无头
      const headlessParam = c.req.query("headless");
      const headless = headlessParam === "true" || headlessParam === "1";
      const proxyOverride = c.req.query("proxy")?.trim();
      const source = getSource(url);
      const fromSource = await getEffectiveProxyForListUrl(url, source);
      const ctx = buildSourceContext({
        cacheDir: CACHE_DIR,
        headless,
        proxy: proxyOverride || fromSource,
      });
      const items = await source.fetchItems(url, ctx);
      const mode = source.id === "generic" ? "generic" : "plugin";
      const effective = effectiveProxyUsed(proxyOverride, fromSource);
      return c.json({
        items,
        url,
        mode,
        pluginId: source.id,
        effectiveProxy: redactProxyForLog(effective),
      });
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        const html = await render401(url);
        return c.html(html, 401);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`解析失败: ${msg}`, 500);
    }
  });

  app.get("/admin/extractor/*", requireAdmin(), async (c) => {
    const url = parseUrlFromPath(c.req.path, "/admin/extractor");
    if (!url) return c.text("无效 URL，格式: /admin/extractor/https://... 或 /admin/extractor/example.com/...", 400);
    try {
      const headlessParam = c.req.query("headless");
      const headless = headlessParam === "true" || headlessParam === "1";
      const proxyOverride = c.req.query("proxy")?.trim();
      const source = getSource(url);
      const fromSource = await getEffectiveProxyForListUrl(url, source);
      const proxy = proxyOverride || fromSource;
      const result = await extractFromLink(url, {}, { timeoutMs: 60_000, headless, proxy });
      const effective = effectiveProxyUsed(proxyOverride, fromSource);
      return c.json({
        title: result.title ?? null,
        author: result.author ?? null,
        pubDate: result.pubDate ?? null,
        content: result.content ?? null,
        _extractor: "readability",
        effectiveProxy: redactProxyForLog(effective),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`提取失败: ${msg}`, 500);
    }
  });
}
