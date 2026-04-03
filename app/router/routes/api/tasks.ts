// 任务 API：POST /api/tasks 提交拉取信源，GET /api/tasks/:id 轮询

import type { Hono } from "hono";
import * as taskStore from "../../../tasks/index.js";
import * as scheduler from "../../../scheduler/index.js";
import { CACHE_DIR } from "../../../config/paths.js";
import { getItems } from "../../../feeder/index.js";
import { SOURCES_GROUP } from "../../../scraper/scheduler/index.js";
import { requireAdmin } from "../../../auth/middleware.js";

export function registerTasksRoutes(app: Hono): void {
  app.get("/api/tasks/:id", (c) => {
    const id = c.req.param("id") ?? "";
    const task = taskStore.getTask(id);
    if (!task) return c.json({ error: "任务不存在" }, 404);
    return c.json(task);
  });

  app.post("/api/tasks", requireAdmin(), async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { type?: string; ref?: string };
      const type = body.type ?? "";
      if (type === "source-pull") {
        const ref = typeof body.ref === "string" ? body.ref.trim() : "";
        if (!ref) return c.json({ error: "ref 不能为空" }, 400);
        const taskId = taskStore.createTask();
        scheduler.schedule(SOURCES_GROUP, taskId, async () => {
          taskStore.setTaskRunning(taskId);
          try {
            await getItems(ref, { cacheDir: CACHE_DIR, force: true });
            taskStore.setTaskDone(taskId, { ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            taskStore.setTaskError(taskId, msg);
            throw err;
          }
        }, { priority: true }).catch(() => {});
        return c.json({ taskId });
      }
      return c.json({ error: `未知任务类型: ${type}` }, 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
