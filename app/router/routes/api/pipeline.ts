// Pipeline 编排与用户 Pipeline 管理 API。

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Hono } from "hono";
import { loadPipelineConfig, savePipelineConfig } from "../../../pipeline/config.js";
import { listPipelineSummaries, reloadUserPipelines } from "../../../pipeline/index.js";
import {
  deleteManagedPipeline,
  PipelineManagementError,
  readManagedPipeline,
  validatePipelineContent,
  writeManagedPipeline,
} from "../../../pipeline/management.js";

type StepInput = { id: string; enabled?: boolean };

function parseSteps(rawSteps: unknown[]): Array<{ id: string }> {
  const seen = new Set<string>();
  const steps: Array<{ id: string }> = [];
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== "object") continue;
    const value = raw as StepInput;
    if (typeof value.id !== "string" || value.enabled === false) continue;
    const id = value.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    steps.push({ id });
  }
  return steps;
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address.startsWith("::ffff:127.");
}

function isLocalBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** 上传可执行代码只允许来自本机 socket，Host/X-Forwarded-For 不作为信任依据。 */
function requireLocalRequest(c: Context): Response | null {
  try {
    if (isLoopbackAddress(getConnInfo(c).remote.address) && isLocalBrowserOrigin(c.req.header("origin"))) return null;
  } catch {
    // app.request 等无 Node socket 的调用默认拒绝；测试须显式注入 loopback incoming。
  }
  return c.json({ error: "用户 Pipeline 管理仅允许从本机页面或本机命令行访问" }, 403);
}

function managementError(c: Context, error: unknown) {
  if (error instanceof PipelineManagementError) return c.json({ error: error.message }, error.status);
  return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
}

export function registerPipelineRoutes(app: Hono): void {
  app.get("/api/pipeline", async (c) => {
    await reloadUserPipelines();
    const available = await listPipelineSummaries();
    const availableIds = new Set(available.map((pipeline) => pipeline.id));
    const config = await loadPipelineConfig();
    return c.json({
      steps: config.steps.filter((step) => availableIds.has(step.id)),
      available,
      availableIds: available.map((pipeline) => pipeline.id),
    });
  });

  app.put("/api/pipeline", async (c) => {
    try {
      const body = await c.req.json<{ steps?: unknown[] }>();
      const steps = parseSteps(Array.isArray(body?.steps) ? body.steps : []);
      const available = await listPipelineSummaries();
      const availableIds = new Set(available.map((pipeline) => pipeline.id));
      const unknown = steps.find((step) => !availableIds.has(step.id));
      if (unknown) return c.json({ error: `未知 Pipeline: ${unknown.id}` }, 400);
      await savePipelineConfig({ steps });
      return c.json({ ok: true, steps });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.get("/api/pipelines", async (c) => {
    await reloadUserPipelines();
    return c.json(await listPipelineSummaries());
  });

  app.post("/api/pipelines/validate", async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<{ id?: string; content?: string }>();
      if (typeof body.id !== "string" || typeof body.content !== "string") return c.json({ error: "需要 id 和 content 字符串" }, 400);
      return c.json(await validatePipelineContent(body.id, body.content));
    } catch (error) {
      return managementError(c, error);
    }
  });

  app.post("/api/pipelines", async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<{ id?: string; content?: string }>();
      if (typeof body.id !== "string" || typeof body.content !== "string") return c.json({ error: "需要 id 和 content 字符串" }, 400);
      return c.json({ ok: true, ...await writeManagedPipeline(body.id, body.content, { mustNotExist: true }) });
    } catch (error) {
      return managementError(c, error);
    }
  });

  app.get("/api/pipelines/:id", async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      return c.json(await readManagedPipeline(decodeURIComponent(c.req.param("id") ?? "")));
    } catch (error) {
      return managementError(c, error);
    }
  });

  app.put("/api/pipelines/:id", async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<{ content?: string }>();
      if (typeof body.content !== "string") return c.json({ error: "需要 content 字符串" }, 400);
      return c.json({ ok: true, ...await writeManagedPipeline(decodeURIComponent(c.req.param("id") ?? ""), body.content) });
    } catch (error) {
      return managementError(c, error);
    }
  });

  app.delete("/api/pipelines/:id", async (c) => {
    const denied = requireLocalRequest(c);
    if (denied) return denied;
    try {
      return c.json(await deleteManagedPipeline(decodeURIComponent(c.req.param("id") ?? "")));
    } catch (error) {
      return managementError(c, error);
    }
  });
}
