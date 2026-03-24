// /api/admin/verify, /api/admin/integrity-check

import type { Hono } from "hono";
import { runIntegrityCheck } from "../../../db/index.js";
import { requireAdmin } from "../../../auth/middleware.js";

export function registerAdminApiRoutes(app: Hono): void {
  app.get("/api/admin/verify", requireAdmin(), async (c) => {
    return c.json({ ok: true });
  });

  /** Supabase 连接健康检查 */
  app.get("/api/admin/integrity-check", requireAdmin(), async (c) => {
    try {
      const result = await runIntegrityCheck();
      const ok = result === "ok";
      return c.json({ ok, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, result: `error: ${message}` }, 500);
    }
  });
}
