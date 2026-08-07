// POST /api/admin/browser/close — 强制关闭当前后端进程管理的共享 Chrome

import type { Hono } from "hono";
import {
  forceCloseSharedBrowsers,
  type ForceCloseSharedBrowsersResult,
} from "../../../scraper/sources/web/fetcher/browser.js";

type BrowserRouteDeps = {
  forceCloseSharedBrowsers: () => Promise<ForceCloseSharedBrowsersResult>;
};

const defaultDeps: BrowserRouteDeps = {
  forceCloseSharedBrowsers,
};

export function registerBrowserRoutes(
  app: Hono,
  deps: BrowserRouteDeps = defaultDeps,
): void {
  app.post("/api/admin/browser/close", async (c) => {
    try {
      const result = await deps.forceCloseSharedBrowsers();
      return c.json({ ok: result.failed === 0, ...result });
    } catch (err) {
      return c.json({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }, 500);
    }
  });
}
