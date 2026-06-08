// GET/PUT /api/proxy — config.json globalProxy / proxyList (admin)

import type { Hono } from "hono";
import { requireAdmin } from "../../../auth/middleware.js";
import { readProxySettingsFromConfig, saveProxySettingsToConfig } from "../../../config/globalProxy.js";

export function registerProxySettingsRoutes(app: Hono): void {
  app.get("/api/proxy", requireAdmin(), async (c) => {
    return c.json(await readProxySettingsFromConfig());
  });

  app.put("/api/proxy", requireAdmin(), async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        globalProxy?: unknown;
        proxyList?: unknown;
      };
      const globalProxy = typeof body.globalProxy === "string" ? body.globalProxy : "";
      const proxyList = Array.isArray(body.proxyList)
        ? body.proxyList.filter((v): v is string => typeof v === "string")
        : [];

      await saveProxySettingsToConfig({ globalProxy, proxyList });
      return c.json({ ok: true, ...(await readProxySettingsFromConfig()) });
    } catch (err) {
      return c.json(
        { ok: false, message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });
}
