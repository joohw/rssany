// 信源调度：根据 sources.json 中的信源 refresh 定时触发 getItems，使用通用调度器

import { watch } from "node:fs";
import { getAllSources } from "../subscription/index.js";
import { resolveRef } from "../subscription/types.js";
import { getItems } from "../../feeder/index.js";
import { SOURCES_CONFIG_PATH } from "../../config/paths.js";
import type { RefreshInterval } from "../../utils/refreshInterval.js";
import { refreshIntervalToCron } from "../../utils/refreshInterval.js";
import * as scheduler from "../../scheduler/index.js";

const DEFAULT_REFRESH: RefreshInterval = "1day";
const SOURCES_CONCURRENCY = 5;

function createPullTask(ref: string, cacheDir: string, cronExpr: string): scheduler.ScheduledTask {
  return async () => {
    try {
      await getItems(ref, {
        cacheDir,
        cron: cronExpr,
      });
    } catch (err) {
      throw err;
    }
  };
}

export const SOURCES_GROUP = "sources";

async function rescheduleSources(cacheDir: string, runNow: boolean): Promise<void> {
  scheduler.unscheduleGroup(SOURCES_GROUP);
  let sources: Awaited<ReturnType<typeof getAllSources>>;
  try {
    sources = await getAllSources();
  } catch {
    sources = [];
  }

  for (const src of sources) {
    const ref = resolveRef(src);
    if (!ref) continue;
    const cronExpr: string = src.cron
      ? src.cron
      : refreshIntervalToCron(src.refresh ?? DEFAULT_REFRESH);
    if (!scheduler.validateCron(cronExpr)) continue;
    scheduler.schedule(SOURCES_GROUP, ref, createPullTask(ref, cacheDir, cronExpr), {
      cron: cronExpr,
      retries: 2,
      retryDelayMs: 5000,
      concurrency: SOURCES_CONCURRENCY,
      runNow,
    });
  }
}

export async function initScheduler(cacheDir: string): Promise<void> {
  await rescheduleSources(cacheDir, true);
  let debounceTimer: NodeJS.Timeout | null = null;
  try {
    const watcher = watch(SOURCES_CONFIG_PATH, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        rescheduleSources(cacheDir, false).catch(() => {});
      }, 500);
    });
    watcher.on("error", () => {});
  } catch {
    /* sources.json 尚不存在 */
  }
}
