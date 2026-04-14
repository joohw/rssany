// /api/sources/stats、/api/sources/raw、/api/sources/plugin-match（admin）

import type { Hono } from "hono";
import { getSourceStats } from "../../../db/index.js";
import { getSource } from "../../../scraper/sources/index.js";
import { getPluginSites } from "../../../scraper/sources/web/index.js";
import { getSourcesRaw, saveSourcesFile, getEffectiveProxyForListUrl } from "../../../scraper/subscription/index.js";
import { launchBrowser, applyProxyAuthToPage, resolveProxy } from "../../../scraper/sources/web/fetcher/index.js";
import { CACHE_DIR } from "../../../config/paths.js";
import type { SourceType } from "../../../scraper/subscription/types.js";
import type { RefreshInterval } from "../../../utils/refreshInterval.js";
import { VALID_INTERVALS } from "../../../utils/refreshInterval.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { canonicalHttpSourceRef } from "../../../utils/httpSourceRef.js";

export function registerSourcesRoutes(app: Hono): void {
  app.get("/api/sources/stats", requireAdmin(), async (c) => {
    const stats = await getSourceStats();
    return c.json(stats);
  });

  app.post("/api/sources/plugin-match", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{ refs?: string[] }>();
      const refs = Array.isArray(body?.refs) ? body.refs : [];
      const pluginIds = new Set(getPluginSites().map((s) => s.id));
      const result: Record<string, string | null> = {};
      for (const ref of refs) {
        const source = getSource(ref);
        result[ref] = pluginIds.has(source.id) ? source.id : null;
      }
      return c.json(result);
    } catch {
      return c.json({});
    }
  });

  /**
   * 在有头 Chrome 中打开 URL：与抓取共用 CACHE_DIR/browser_data、代理优先级与 /auth/open 一致。
   * 浏览器在本机服务端弹出，非用户默认浏览器。
   */
  app.post("/api/sources/open-browser", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{ url?: string }>();
      const raw = typeof body?.url === "string" ? body.url.trim() : "";
      if (!raw) return c.json({ ok: false, message: "缺少 url" }, 400);
      const lower = raw.toLowerCase();
      if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
        return c.json({ ok: false, message: "仅支持 http(s) URL" }, 400);
      }
      const url = raw;
      const source = getSource(url);
      const merged = await getEffectiveProxyForListUrl(url, source);
      const proxy = resolveProxy({ proxy: merged });
      void launchBrowser({ headless: false, cacheDir: CACHE_DIR, proxy })
        .then(async (browser) => {
          try {
            const page = await browser.newPage();
            await applyProxyAuthToPage(page, { proxy: merged });
            const realUserAgent =
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
            await page.setUserAgent(realUserAgent);
            await page.setViewport({ width: 1366, height: 960 });
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
            page.once("close", () => {
              void browser.close().catch(() => {});
            });
          } catch {
            await browser.close().catch(() => {});
          }
        })
        .catch(() => {});
      return c.json({ ok: true, message: "已在爬虫浏览器中打开" });
    } catch {
      return c.json({ ok: false, message: "请求体无效" }, 400);
    }
  });

  app.get("/api/sources/raw", requireAdmin(), async (c) => {
    try {
      const raw = await getSourcesRaw();
      return c.text(raw, 200, { "Content-Type": "application/json; charset=utf-8" });
    } catch {
      return c.text(JSON.stringify({ sources: [] }, null, 2), 200, { "Content-Type": "application/json; charset=utf-8" });
    }
  });

  app.put("/api/sources/raw", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{ sources?: unknown[] }>();
      const list = Array.isArray(body?.sources) ? body.sources : [];
      const sources: { ref: string; type?: SourceType; label?: string; description?: string; refresh?: RefreshInterval; proxy?: string; weight?: number }[] = list
        .filter((s): s is Record<string, unknown> => s != null && typeof s === "object" && typeof (s as { ref?: unknown }).ref === "string")
        .map((s) => {
          const t = (s as { type?: string }).type;
          const type: SourceType | undefined =
            t === "web" || t === "rss" || t === "email" ? t : undefined;
          const r = (s as { refresh?: string }).refresh;
          const refresh: RefreshInterval | undefined =
            r && VALID_INTERVALS.includes(r as RefreshInterval) ? (r as RefreshInterval) : undefined;
          const w = (s as { weight?: unknown }).weight;
          const weight: number | undefined = typeof w === "number" ? w : undefined;
          return {
            ref: canonicalHttpSourceRef(String((s as { ref: string }).ref)),
            type,
            label: (s as { label?: string }).label,
            description: (s as { description?: string }).description,
            refresh,
            proxy: (s as { proxy?: string }).proxy,
            weight,
          };
        });
      await saveSourcesFile(sources);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
