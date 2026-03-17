// 缓存管理：认证 profile 缓存

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CacheKeyStrategy } from "../../scraper/sources/web/fetcher/types.js";
import { cronToRefreshInterval } from "../../utils/refreshInterval.js";


const DOMAINS_SUBDIR = "domains";


/** 认证配置档：可存 cookies、localStorage、sessionStorage 等，由 cacher 写入 cacheDir/domains/ */
export interface AuthProfile {
  cookies?: string;
  localStorage?: string;
  sessionStorage?: string;
  [key: string]: unknown;
}


function profileFileName(domain: string): string {
  return `${domain.replace(/[/\\]/g, "_")}.json`;
}


function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}


// 将时间映射到对应策略的时间窗口前缀（UTC）
// 与 refreshIntervalToCron 的时间边界一致：如 1h 策略，窗口为整点，cron 为 "0 * * * *"
function timeBucket(strategy: CacheKeyStrategy, now: Date): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = now.getUTCHours();
  const hs = String(h).padStart(2, "0");
  const min = now.getUTCMinutes();
  if (strategy === "1min") return `${y}-${mo}-${d}T${hs}:${String(min).padStart(2, "0")}`;
  if (strategy === "5min") return `${y}-${mo}-${d}T${hs}:${String(Math.floor(min / 5) * 5).padStart(2, "0")}`;
  if (strategy === "10min") return `${y}-${mo}-${d}T${hs}:${String(Math.floor(min / 10) * 10).padStart(2, "0")}`;
  if (strategy === "30min") return `${y}-${mo}-${d}T${hs}:${min < 30 ? "00" : "30"}`;
  if (strategy === "1h") return `${y}-${mo}-${d}T${hs}`;
  if (strategy === "6h") return `${y}-${mo}-${d}T${String(Math.floor(h / 6) * 6).padStart(2, "0")}`;
  if (strategy === "12h") return `${y}-${mo}-${d}T${h < 12 ? "00" : "12"}`;
  if (strategy === "1day") return `${y}-${mo}-${d}`;
  if (strategy === "3day") {
    const epochDay = Math.floor(now.getTime() / 86400000);
    return `d${Math.floor(epochDay / 3) * 3}`;
  }
  if (strategy === "7day") {
    const adjusted = new Date(now);
    adjusted.setUTCHours(0, 0, 0, 0);
    adjusted.setUTCDate(adjusted.getUTCDate() + 3 - ((adjusted.getUTCDay() + 6) % 7));
    const week1 = new Date(Date.UTC(adjusted.getUTCFullYear(), 0, 4));
    const isoYear = adjusted.getUTCFullYear();
    const isoWeek = 1 + Math.round(((adjusted.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
  }
  return "";
}


// 根据 URL 与策略生成缓存 key：forever=仅 sha256(url)；其余=时间窗口前缀-sha256(url)
export function cacheKey(url: string, strategy: CacheKeyStrategy = "forever", now: Date = new Date()): string {
  const hash = urlHash(url);
  if (strategy === "forever") return hash;
  return `${timeBucket(strategy, now)}-${hash}`;
}


/** 基于 cron 表达式生成缓存 key：策略由 cronToRefreshInterval 派生，与调度触发时刻对齐 */
export function cacheKeyFromCron(url: string, cron: string, now: Date = new Date()): string {
  return cacheKey(url, cronToRefreshInterval(cron), now);
}


// 从 cacheDir/domains/{domain}.json 读取认证配置（未来可扩展为 domains/{domain}/{profileName}.json）
export async function readProfile(cacheDir: string, domain: string): Promise<AuthProfile | null> {
  const dir = join(cacheDir, DOMAINS_SUBDIR);
  const filePath = join(dir, profileFileName(domain));
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as AuthProfile;
  } catch {
    return null;
  }
}


// 将认证配置写入 cacheDir/domains/{domain}.json
export async function writeProfile(cacheDir: string, domain: string, data: AuthProfile): Promise<void> {
  const dir = join(cacheDir, DOMAINS_SUBDIR);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, profileFileName(domain));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
