// API 路由汇总：server、rss、items、feed、sources、scheduler、plugins、logs、admin、tags、tasks

import type { Hono } from "hono";
import { registerServerRoutes } from "./server.js";
import { registerRssApiRoutes } from "./rss.js";
import { registerSchedulerRoutes } from "./scheduler.js";
import { registerPluginsRoutes } from "./plugins.js";
import { registerPipelineRoutes } from "./pipeline.js";
import { registerFeedRoutes } from "./feed.js";
import { registerItemsRoutes } from "./items.js";
import { registerLogsRoutes } from "./logs.js";
import { registerAdminApiRoutes } from "./admin.js";
import { registerSourcesRoutes } from "./sources.js";
import { registerTopicsRoutes } from "./topics.js";
import { registerDeliverRoutes } from "./deliver.js";
import { registerLlmRoutes } from "./llm.js";
import { registerProxySettingsRoutes } from "./proxy.js";
import { registerTasksRoutes } from "./tasks.js";
import { registerFeedFaviconRoutes } from "./feed-favicon.js";
import { registerCoverImgRoutes } from "./cover-img.js";

export function registerApiRoutes(app: Hono): void {
  registerServerRoutes(app);
  registerFeedFaviconRoutes(app);
  registerCoverImgRoutes(app);
  registerRssApiRoutes(app);
  registerSchedulerRoutes(app);
  registerPluginsRoutes(app);
  registerPipelineRoutes(app);
  registerFeedRoutes(app);
  registerItemsRoutes(app);
  registerLogsRoutes(app);
  registerAdminApiRoutes(app);
  registerSourcesRoutes(app);
  registerTopicsRoutes(app);
  registerDeliverRoutes(app);
  registerLlmRoutes(app);
  registerProxySettingsRoutes(app);
  registerTasksRoutes(app);
}
