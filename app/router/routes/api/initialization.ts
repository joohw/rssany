import type { Hono } from "hono";
import { isInitialized, setInitialized } from "../../../config/configFile.js";

export function registerInitializationRoutes(app: Hono): void {
  app.get("/api/initialization", async (c) => {
    return c.json({ initialized: await isInitialized() });
  });

  app.post("/api/initialization", async (c) => {
    await setInitialized(true);
    return c.json({ ok: true, initialized: true });
  });
}
