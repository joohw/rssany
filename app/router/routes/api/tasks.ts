// 任务 API：POST /api/tasks 提交拉取信源，GET /api/tasks/:id 轮询

import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import * as taskStore from "../../../tasks/index.js";
import * as scheduler from "../../../scheduler/index.js";
import { CACHE_DIR } from "../../../config/paths.js";
import { crawlSource } from "../../../feeder/index.js";
import { SOURCES_GROUP } from "../../../scraper/scheduler/index.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { markSourcePullPending } from "../../../core/sourcePullStatus.js";

export function registerTasksRoutes(app: Hono): void {
  app.get("/api/tasks/:id/events", (c) => {
    const id = c.req.param("id") ?? "";
    if (!taskStore.getTask(id)) return c.json({ error: "任务不存在" }, 404);
    return streamSSE(c, async (stream) => {
      const writeTask = (task: NonNullable<ReturnType<typeof taskStore.getTask>>) => {
        stream.writeSSE({ data: JSON.stringify(task) }).catch(() => {});
      };
      const off = taskStore.onTaskUpdated(id, writeTask);
      const current = taskStore.getTask(id);
      if (current) await stream.writeSSE({ data: JSON.stringify(current) });
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

  app.get("/api/tasks/:id", (c) => {
    const id = c.req.param("id") ?? "";
    const task = taskStore.getTask(id);
    if (!task) return c.json({ error: "任务不存在" }, 404);
    return c.json(task);
  });

  app.post("/api/tasks", requireAdmin(), async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        type?: string;
        ref?: string;
        headless?: boolean;
      };
      const type = body.type ?? "";
      if (type === "source-pull") {
        const ref = typeof body.ref === "string" ? body.ref.trim() : "";
        if (!ref) return c.json({ error: "ref 不能为空" }, 400);
        const taskId = taskStore.createTask();
        markSourcePullPending(ref);
        scheduler.schedule(SOURCES_GROUP, taskId, async () => {
          taskStore.setTaskRunning(taskId);
          try {
            await crawlSource(ref, {
              cacheDir: CACHE_DIR,
              force: true,
              headless: body.headless === true ? true : undefined,
            });
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
