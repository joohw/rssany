// /api/admin/verify, /api/admin/integrity-check

import type { Hono } from "hono";
import { runIntegrityCheck } from "../../../db/index.js";

export function registerAdminApiRoutes(app: Hono): void {
  app.get("/api/admin/verify", async (c) => {
    return c.json({ ok: true });
  });

  /** 运行 SQLite PRAGMA integrity_check，用于排查「database disk image is malformed」 */
  app.get("/api/admin/integrity-check", async (c) => {
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
