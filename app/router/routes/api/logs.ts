// /api/logs

import type { Hono } from "hono";
import { queryLogs } from "../../../db/index.js";
import { requireAdmin } from "../../../auth/middleware.js";

export function registerLogsRoutes(app: Hono): void {
  app.get("/api/logs", requireAdmin(), async (c) => {
    const levelParam = c.req.query("level");
    const level = levelParam === "error" || levelParam === "warn" || levelParam === "info" || levelParam === "debug" ? levelParam : undefined;
    const categoryRaw = c.req.query("category");
    const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : undefined;
    const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const sinceParam = c.req.query("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const result = await queryLogs({ level, category, limit, offset, since });
    return c.json(result);
  });
}
