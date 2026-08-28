// /api/server-info

import { networkInterfaces } from "node:os";
import type { Hono } from "hono";
import { getUpdateSettings, setUpdateSettings } from "../../../config/updateSettings.js";
import { getUpdateStatus } from "../../../update/index.js";

const PORT = Number(process.env.PORT) || 18473;

export function registerServerRoutes(app: Hono): void {
  app.get("/api/server-info", (c) => {
    const lanIp = Object.values(networkInterfaces())
      .flat()
      .find((iface) => iface?.family === "IPv4" && !iface.internal)?.address;
    const lanUrl = lanIp ? `http://${lanIp}:${PORT}` : null;
    return c.json({ port: PORT, lanUrl });
  });

  app.get("/api/update-settings", async (c) => {
    return c.json(await getUpdateSettings());
  });

  app.put("/api/update-settings", async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.autoUpdate !== "boolean" || typeof body.autoRestart !== "boolean") {
      return c.json({ error: "autoUpdate 和 autoRestart 必须是布尔值" }, 400);
    }
    await setUpdateSettings({
      autoUpdate: body.autoUpdate,
      autoRestart: body.autoRestart,
    });
    return c.json({ ok: true, ...(await getUpdateSettings()) });
  });

  app.get("/api/update-status", async (c) => {
    return c.json(await getUpdateStatus());
  });
}
