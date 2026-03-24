// /api/sources/stats、/api/sources/raw、/api/sources/plugin-match（admin）
// /api/user/sources（JWT 认证用户）

import type { Hono } from "hono";
import { getSourceStats } from "../../../db/index.js";
import { getSource } from "../../../scraper/sources/index.js";
import { getPluginSites } from "../../../scraper/sources/web/index.js";
import { getSourcesRaw, saveSourcesFile } from "../../../scraper/subscription/index.js";
import type { SourceType } from "../../../scraper/subscription/types.js";
import type { RefreshInterval } from "../../../utils/refreshInterval.js";
import { VALID_INTERVALS } from "../../../utils/refreshInterval.js";
import { requireAuth, requireAdmin } from "../../../auth/middleware.js";
import { getUserSources, setUserSources, addUserSource, removeUserSource } from "../../../db/userSources.js";

export function registerSourcesRoutes(app: Hono): void {
  app.get("/api/sources/stats", requireAdmin(), async (c) => {
    const stats = await getSourceStats();
    return c.json(stats);
  });

  /** 批量查询 ref 是否匹配 Site 插件，返回 { [ref]: pluginId | null } */
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
            ref: String((s as { ref: string }).ref),
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

  // ─── 用户级信源（JWT 认证）───────────────────────────────────────────────────

  /** 获取当前用户的信源列表 */
  app.get("/api/user/sources", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const sources = await getUserSources(userId);
    return c.json(sources);
  });

  /** 全量更新当前用户的信源列表 */
  app.put("/api/user/sources", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    try {
      const body = await c.req.json<{ sources?: unknown[] }>();
      const list = Array.isArray(body?.sources) ? body.sources : [];
      const sources = list
        .filter((s): s is Record<string, unknown> => s != null && typeof s === "object" && typeof (s as { ref?: unknown }).ref === "string")
        .map((s) => ({
          ref: String((s as { ref: string }).ref),
          label: (s as { label?: string }).label ?? null,
          refresh: (s as { refresh?: string }).refresh ?? null,
          proxy: (s as { proxy?: string }).proxy ?? null,
          cron: (s as { cron?: string }).cron ?? null,
          weight: typeof (s as { weight?: unknown }).weight === "number" ? (s as { weight: number }).weight : null,
        }));
      await setUserSources(userId, sources);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 添加单个信源 */
  app.post("/api/user/sources", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    try {
      const body = await c.req.json<{ ref?: string; label?: string; refresh?: string; proxy?: string }>();
      if (!body.ref) return c.json({ ok: false, message: "ref 不能为空" }, 400);
      await addUserSource(userId, { ref: body.ref, label: body.label, refresh: body.refresh, proxy: body.proxy });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 删除单个信源 */
  app.delete("/api/user/sources", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const ref = c.req.query("ref");
    if (!ref) return c.json({ ok: false, message: "ref 不能为空" }, 400);
    await removeUserSource(userId, ref);
    return c.json({ ok: true });
  });
}
