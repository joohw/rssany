// App 入口：Hono 服务，与 feeder 解耦；可替换为 Express 等

import "dotenv/config";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initSources as initSites } from "../scraper/sources/index.js";
import { initScheduler } from "../scraper/scheduler/index.js";
import { initUserDir, BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR, CACHE_DIR } from "../config/paths.js";
import { logger } from "../core/logger/index.js";
import { registerApiRoutes } from "./routes/api/index.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerRssRoutes } from "./routes/rss.js";
import { registerWebUiRoutes } from "./webui.js";

const PORT = Number(process.env.PORT) || 3751;
const IS_DEV = process.env.NODE_ENV === "development" || process.argv.includes("--watch");
const PLUGIN_WATCH_EXTS = [".rssany.js", ".rssany.ts"];

function createApp(): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
    }),
  );

  registerApiRoutes(app);
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerRssRoutes(app);
  registerWebUiRoutes(app);

  return app;
}

function watchPlugins(): void {
  let reloadTimer: NodeJS.Timeout | null = null;
  const debouncedReload = async () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        await initSites();
      } catch (err) {
        logger.error("plugin", "插件重新加载失败", { err: err instanceof Error ? err.message : String(err) });
      }
    }, 300);
  };
  for (const dir of [BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR]) {
    const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename || !PLUGIN_WATCH_EXTS.some((ext) => filename.endsWith(ext))) return;
      if (eventType === "rename" || eventType === "change") debouncedReload();
    });
    watcher.on("error", (err) => {
      logger.warn("plugin", "插件目录监听错误", { dir, err: err.message });
    });
  }
}

async function main(): Promise<void> {
  await initUserDir();
  await initSites();
  await initScheduler(CACHE_DIR);
  const app = createApp();
  const server = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });
  server.setMaxListeners(32);
  console.log(`服务已启动 http://127.0.0.1:${PORT}/（API + 静态前端，需先 pnpm run webui:build）`);
  const lanIp = Object.values(networkInterfaces()).flat().find((iface) => iface?.family === "IPv4" && !iface.internal)?.address;
  if (lanIp) console.log(`局域网访问 http://${lanIp}:${PORT}/`);
  if (IS_DEV) {
    watchPlugins();
  }
}
main();
