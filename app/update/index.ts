import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getUpdateSettings } from "../config/updateSettings.js";
import { USER_DIR } from "../config/paths.js";
import { logger } from "../core/logger/index.js";
import { PACKAGE_ROOT } from "../packageRoot.js";
import * as scheduler from "../scheduler/index.js";
import { getAppVersion } from "../version.js";

export const UPDATE_GROUP = "system";
export const UPDATE_TASK_ID = "system:auto-update";
const UPDATE_CRON = "17 */6 * * *";

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  managed: boolean;
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/, "").split("-")[0].split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

async function isManagedProcess(): Promise<boolean> {
  try {
    const pid = Number((await readFile(join(USER_DIR, "rssany.pid"), "utf-8")).trim());
    return pid === process.pid;
  } catch {
    return false;
  }
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/rssany/latest", {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm registry HTTP ${response.status}`);
  const data = await response.json() as { version?: unknown };
  if (typeof data.version !== "string" || !data.version.trim()) throw new Error("npm registry 未返回版本号");
  return data.version.trim();
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const currentVersion = getAppVersion();
  const managed = await isManagedProcess();
  try {
    const latestVersion = await fetchLatestVersion();
    return {
      currentVersion,
      latestVersion,
      updateAvailable: currentVersion !== "unknown" && compareVersions(latestVersion, currentVersion) > 0,
      managed,
    };
  } catch {
    return { currentVersion, latestVersion: null, updateAvailable: false, managed };
  }
}

export async function checkAndUpdate(): Promise<void> {
  const settings = await getUpdateSettings();
  if (!settings.autoUpdate || !(await isManagedProcess())) return;
  const status = await getUpdateStatus();
  if (!status.latestVersion || !status.updateAvailable) return;

  logger.info("update", "发现新版本，开始自动更新", {
    currentVersion: status.currentVersion,
    latestVersion: status.latestVersion,
    autoRestart: settings.autoRestart,
  });
  const binPath = join(PACKAGE_ROOT, "bin", "rssany.js");
  const child = spawn(process.execPath, [binPath, "update", settings.autoRestart ? "--restart" : "--no-restart"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

export function initAutoUpdate(): void {
  scheduler.schedule(UPDATE_GROUP, UPDATE_TASK_ID, checkAndUpdate, {
    cron: UPDATE_CRON,
    concurrency: 1,
    runNow: true,
  });
}
