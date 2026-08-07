// 信源调度：根据 config.json 中的 sources refresh 定时触发 getItems，使用通用调度器

import { watch } from "node:fs";
import { getAllSources, getSourcesRaw } from "../subscription/index.js";
import { resolveRef } from "../subscription/types.js";
import { crawlSource } from "../../feeder/index.js";
import { CONFIG_PATH } from "../../config/paths.js";
import { getDeliverConfig } from "../../config/deliver.js";
import { joinGatewayPath, postDeliverSourcesSafe } from "../../deliver/post.js";
import type { RefreshInterval } from "../../utils/refreshInterval.js";
import { refreshIntervalToCron } from "../../utils/refreshInterval.js";
import * as scheduler from "../../scheduler/index.js";

const DEFAULT_REFRESH: RefreshInterval = "1day";

function readSourcesConcurrency(): number {
  const raw = process.env.RSSANY_SOURCES_CONCURRENCY?.trim();
  const parsed = raw ? Number(raw) : 4;
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(1, Math.min(12, Math.floor(parsed)));
}

const SOURCES_CONCURRENCY = readSourcesConcurrency();

function createPullTask(ref: string, cacheDir: string, cronExpr: string): scheduler.ScheduledTask {
  return async () => {
    await crawlSource(ref, {
      cacheDir,
      cron: cronExpr,
    });
  };
}

export const SOURCES_GROUP = "sources";
/** 手动拉取使用独立通道，避免被定时抓取占满 SOURCES_GROUP 的并发槽。 */
export const MANUAL_SOURCES_GROUP = "sources-manual";

/** config.json 变更且 config.deliver.gateways 非空时，向每个 {gateway}/sources POST 当前信源 JSON */
async function deliverSourcesConfigIfConfigured(): Promise<void> {
  const { gateways, token } = await getDeliverConfig();
  if (gateways.length === 0) return;
  let raw: string;
  try {
    raw = await getSourcesRaw();
  } catch {
    return;
  }
  await Promise.all(
    gateways.map((gateway) =>
      postDeliverSourcesSafe(joinGatewayPath(gateway, "sources"), raw, { bearerToken: token || undefined }),
    ),
  );
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
    const watcher = watch(CONFIG_PATH, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void rescheduleSources(cacheDir, false)
          .then(() => deliverSourcesConfigIfConfigured())
          .catch(() => {});
      }, 500);
    });
    watcher.on("error", () => {});
  } catch {
    /* config.json 尚不存在 */
  }
}
