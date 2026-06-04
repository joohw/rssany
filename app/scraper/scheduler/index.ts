// 信源调度：根据 sources.json 中的信源 refresh 定时触发 getItems，使用通用调度器

import { watch } from "node:fs";
import { getAllSources, getSourcesRaw } from "../subscription/index.js";
import { resolveRef } from "../subscription/types.js";
import { crawlSource } from "../../feeder/index.js";
import { SOURCES_CONFIG_PATH } from "../../config/paths.js";
import { getDeliverConfig } from "../../config/deliver.js";
import { joinGatewayPath, postDeliverSourcesSafe } from "../../deliver/post.js";
import type { RefreshInterval } from "../../utils/refreshInterval.js";
import { refreshIntervalToCron } from "../../utils/refreshInterval.js";
import * as scheduler from "../../scheduler/index.js";

const DEFAULT_REFRESH: RefreshInterval = "1day";
const SOURCES_CONCURRENCY = 1;

function createPullTask(ref: string, cacheDir: string, cronExpr: string): scheduler.ScheduledTask {
  return async () => {
    await crawlSource(ref, {
      cacheDir,
      cron: cronExpr,
    });
  };
}

export const SOURCES_GROUP = "sources";

/** sources.json 变更且 config.deliver.gateway 非空时，向 {gateway}/sources POST 当前信源 JSON */
async function deliverSourcesConfigIfConfigured(): Promise<void> {
  const { gateway, token } = await getDeliverConfig();
  if (!gateway.trim()) return;
  let raw: string;
  try {
    raw = await getSourcesRaw();
  } catch {
    return;
  }
  await postDeliverSourcesSafe(joinGatewayPath(gateway, "sources"), raw, { bearerToken: token || undefined });
}

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
  await rescheduleSources(cacheDir, false);
  let debounceTimer: NodeJS.Timeout | null = null;
  try {
    const watcher = watch(SOURCES_CONFIG_PATH, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void rescheduleSources(cacheDir, false)
          .then(() => deliverSourcesConfigIfConfigured())
          .catch(() => {});
      }, 500);
    });
    watcher.on("error", () => {});
  } catch {
    /* sources.json 尚不存在 */
  }
}
