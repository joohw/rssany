import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { registerBrowserRoutes } from "../app/router/routes/api/browser.ts";

describe("browser admin API", () => {
  it("closes browsers managed by the current backend", async () => {
    const forceCloseSharedBrowsers = vi.fn(async () => ({
      found: 2,
      closed: 1,
      terminated: 1,
      failed: 0,
    }));
    const app = new Hono();
    registerBrowserRoutes(app, { forceCloseSharedBrowsers });

    const response = await app.request("/api/admin/browser/close", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      found: 2,
      closed: 1,
      terminated: 1,
      failed: 0,
    });
    expect(forceCloseSharedBrowsers).toHaveBeenCalledOnce();
  });

  it("returns 500 when browser shutdown fails unexpectedly", async () => {
    const app = new Hono();
    registerBrowserRoutes(app, {
      forceCloseSharedBrowsers: async () => {
        throw new Error("close failed");
      },
    });

    const response = await app.request("/api/admin/browser/close", {
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      message: "close failed",
    });
  });
});
