// /api/logs

import type { Hono } from "hono";
import { clearAllLogs, queryLogs } from "../../../db/index.js";

export function registerLogsRoutes(app: Hono): void {
  app.delete("/api/logs", async (c) => {
    const deleted = await clearAllLogs();
    return c.json({ ok: true, deleted });
  });

  app.get("/api/logs", async (c) => {
    const levelParam = c.req.query("level");
    const level = levelParam === "error" || levelParam === "warn" || levelParam === "info" || levelParam === "debug" ? levelParam : undefined;
    const categoryRaw = c.req.query("category");
    const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : undefined;
    const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const sinceParam = c.req.query("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const untilParam = c.req.query("until");
    const until = untilParam ? new Date(untilParam) : undefined;
    if (since && Number.isNaN(since.getTime())) return c.json({ error: "Invalid since date" }, 400);
    if (until && Number.isNaN(until.getTime())) return c.json({ error: "Invalid until date" }, 400);
    if (since && until && since >= until) return c.json({ error: "since must be earlier than until" }, 400);
    const result = await queryLogs({ level, category, limit, offset, since, until });
    return c.json(result);
  });
}
