import type { Hono } from "hono";
import {
  createItemsBackup,
  createSourcesBackup,
  importItemsBackup,
  importSourcesBackup,
} from "../../../backup/index.js";

function timestampForFilename(exportedAt: string): string {
  return exportedAt.replace(/[:.]/g, "-");
}

function parseMode(value: unknown): "merge" | "replace" | null {
  return value === "merge" || value === "replace" ? value : null;
}

export function registerBackupRoutes(app: Hono): void {
  app.get("/api/backup/sources", async (c) => {
    const backup = await createSourcesBackup();
    c.header("Content-Type", "application/json; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="rssany-sources-${timestampForFilename(backup.exportedAt)}.json"`);
    c.header("Cache-Control", "no-store");
    return c.body(JSON.stringify(backup, null, 2));
  });

  app.post("/api/backup/sources/import", async (c) => {
    try {
      const body = await c.req.json<{ mode?: unknown; backup?: unknown }>();
      const mode = parseMode(body?.mode);
      if (!mode) return c.json({ ok: false, message: "导入模式必须是 merge 或 replace" }, 400);
      return c.json({ ok: true, ...(await importSourcesBackup(body.backup, mode)) });
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.get("/api/backup/items", async (c) => {
    const backup = await createItemsBackup();
    c.header("Content-Type", "application/json; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="rssany-items-${timestampForFilename(backup.exportedAt)}.json"`);
    c.header("Cache-Control", "no-store");
    return c.body(JSON.stringify(backup, null, 2));
  });

  app.post("/api/backup/items/import", async (c) => {
    try {
      const body = await c.req.json<{ mode?: unknown; backup?: unknown }>();
      const mode = parseMode(body?.mode);
      if (!mode) return c.json({ ok: false, message: "导入模式必须是 merge 或 replace" }, 400);
      return c.json({ ok: true, ...(await importItemsBackup(body.backup, mode)) });
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
}
