// /api/sources/stats、/api/sources/raw、/api/sources/plugin-match（admin）

import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getSourceStats } from "../../../db/index.js";
import { getSource } from "../../../scraper/sources/index.js";
import { getPluginSites } from "../../../scraper/sources/web/index.js";
import { getAllSources, getSourcesRaw, saveSourcesFile, getEffectiveProxyForListUrl } from "../../../scraper/subscription/index.js";
import { openBrowserPage, resolveProxy } from "../../../scraper/sources/web/fetcher/index.js";
import { CACHE_DIR } from "../../../config/paths.js";
import type { SourceType } from "../../../scraper/subscription/types.js";
import type { RefreshInterval } from "../../../utils/refreshInterval.js";
import { VALID_INTERVALS } from "../../../utils/refreshInterval.js";
import { canonicalHttpSourceRef } from "../../../utils/httpSourceRef.js";
import { getSourcePullStatus, onSourcePullStatus } from "../../../core/sourcePullStatus.js";
import { resolveRef } from "../../../scraper/subscription/types.js";

export function registerSourcesRoutes(app: Hono): void {
  const pullStatusSnapshot = async () => {
    const sources = await getAllSources().catch(() => []);
    return sources.map((source) => {
      const ref = resolveRef(source);
      return getSourcePullStatus(ref) ?? {
        ref: canonicalHttpSourceRef(ref),
        status: "idle" as const,
        pending: 0,
        running: 0,
        updatedAt: 0,
      };
    });
  };

  app.get("/api/sources/pull-status", async (c) => {
    return c.json({ sources: await pullStatusSnapshot() });
  });

  app.get("/api/sources/pull-status/events", (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: "snapshot", sources: await pullStatusSnapshot() }),
      });
      const off = onSourcePullStatus((source) => {
        stream.writeSSE({ data: JSON.stringify({ type: "status", source }) }).catch(() => {});
      });
      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }, 25000);
      stream.onAbort(() => {
        off();
        clearInterval(heartbeat);
      });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
  });

  app.get("/api/sources/stats", async (c) => {
    const stats = await getSourceStats();
    return c.json(stats);
  });

  app.get("/api/sources", async (c) => {
    const [sources, stats] = await Promise.all([getAllSources(), getSourceStats()]);
    const statsByRef = new Map(stats.map((row) => [canonicalHttpSourceRef(row.source_url), row]));
    return c.json({
      sources: sources.map((source) => {
        const ref = resolveRef(source);
        const stat = statsByRef.get(canonicalHttpSourceRef(ref));
        const pull = getSourcePullStatus(ref) ?? {
          ref: canonicalHttpSourceRef(ref),
          status: "idle" as const,
          pending: 0,
          running: 0,
          updatedAt: 0,
        };
        return {
          ...source,
          ref,
          stats: {
            count: stat?.count ?? 0,
            count7d: stat?.count_7d ?? 0,
            latestAt: stat?.latest_at ?? null,
          },
          pull,
        };
      }),
    });
  });

  app.post("/api/sources/plugin-match", async (c) => {
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
  app.post("/api/sources/open-browser", async (c) => {
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
      void openBrowserPage(url, CACHE_DIR, { proxy }).catch(() => {});
      return c.json({ ok: true, message: "已在爬虫浏览器中打开" });
    } catch {
      return c.json({ ok: false, message: "请求体无效" }, 400);
    }
  });

  app.get("/api/sources/raw", async (c) => {
    try {
      const raw = await getSourcesRaw();
      return c.text(raw, 200, { "Content-Type": "application/json; charset=utf-8" });
    } catch {
      return c.text(JSON.stringify({ sources: [] }, null, 2), 200, { "Content-Type": "application/json; charset=utf-8" });
    }
  });

  app.put("/api/sources/raw", async (c) => {
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
