import type { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import {
  createItemsBackup,
  createPipelinesBackup,
  createPluginsBackup,
  createSourcesBackup,
  importItemsBackup,
  importPipelinesBackup,
  importPluginsBackup,
  importSourcesBackup,
} from "../../../backup/index.js";

function timestampForFilename(exportedAt: string): string {
  return exportedAt.replace(/[:.]/g, "-");
}

function parseMode(value: unknown): "merge" | "replace" | null {
  return value === "merge" || value === "replace" ? value : null;
}

function requireLocalRequest(c: Context): Response | null {
  try {
    const address = getConnInfo(c).remote.address;
    const origin = c.req.header("origin");
    const loopback = address === "127.0.0.1" || address === "::1" || address?.startsWith("::ffff:127.");
    const localOrigin = !origin || ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname.toLowerCase());
    if (loopback && localOrigin) return null;
  } catch {
    // 无法确认本机 socket 时拒绝导入可执行代码。
  }
  return c.json({ ok: false, message: "插件与 Pipeline 恢复仅允许从本机页面访问" }, 403);
}

function registerScriptBackupRoutes(
  app: Hono,
  kind: "plugins" | "pipelines",
  create: () => Promise<{ exportedAt: string }>,
  restore: (backup: unknown, mode: "merge" | "replace") => Promise<Record<string, unknown>>,
): void {
  app.get(`/api/backup/${kind}`, async (c) => {
    const backup = await create();
    c.header("Content-Type", "application/json; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="rssany-${kind}-${timestampForFilename(backup.exportedAt)}.json"`);
    c.header("Cache-Control", "no-store");
    return c.body(JSON.stringify(backup, null, 2));
  });
  app.post(`/api/backup/${kind}/import`, async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<{ mode?: unknown; backup?: unknown }>();
      const mode = parseMode(body?.mode);
      if (!mode) return c.json({ ok: false, message: "导入模式必须是 merge 或 replace" }, 400);
      return c.json({ ok: true, ...await restore(body.backup, mode) });
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
}

export function registerBackupRoutes(app: Hono): void {
  registerScriptBackupRoutes(app, "plugins", createPluginsBackup, importPluginsBackup);
  registerScriptBackupRoutes(app, "pipelines", createPipelinesBackup, importPipelinesBackup);
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
