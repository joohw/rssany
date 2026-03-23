// /api/email-reports：每用户邮件报告订阅的 CRUD

import type { Hono } from "hono";
import { requireAuth } from "../../../auth/middleware.js";
import {
  getUserEmailReports,
  getEmailReportById,
  createEmailReport,
  updateEmailReport,
  deleteEmailReport,
} from "../../../db/userEmailReports.js";

export function registerEmailReportsRoutes(app: Hono): void {
  app.get("/api/email-reports", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const reports = await getUserEmailReports(userId);
    return c.json(reports);
  });

  app.post("/api/email-reports", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    try {
      const body = await c.req.json<{
        title?: string;
        channelIds?: string[] | null;
        schedule?: string;
        mode?: "digest" | "research";
        extraPrompt?: string | null;
      }>();
      if (!body.title?.trim()) return c.json({ error: "title 不能为空" }, 400);
      const report = await createEmailReport({
        userId,
        title: body.title.trim(),
        channelIds: Array.isArray(body.channelIds) ? body.channelIds : null,
        schedule: body.schedule ?? "0 8 * * *",
        mode: body.mode === "research" ? "research" : "digest",
        extraPrompt: body.extraPrompt ?? null,
      });
      return c.json(report, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "创建失败" }, 400);
    }
  });

  app.get("/api/email-reports/:id", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "无效 id" }, 400);
    const report = await getEmailReportById(id, userId);
    if (!report) return c.json({ error: "不存在" }, 404);
    return c.json(report);
  });

  app.put("/api/email-reports/:id", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "无效 id" }, 400);
    try {
      const body = await c.req.json<{
        title?: string;
        channelIds?: string[] | null;
        schedule?: string;
        enabled?: boolean;
        mode?: "digest" | "research";
        extraPrompt?: string | null;
      }>();
      const updated = await updateEmailReport(id, userId, body);
      if (!updated) return c.json({ error: "不存在" }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "更新失败" }, 400);
    }
  });

  app.delete("/api/email-reports/:id", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "无效 id" }, 400);
    const deleted = await deleteEmailReport(id, userId);
    if (!deleted) return c.json({ error: "不存在" }, 404);
    return c.json({ ok: true });
  });
}
