// 采集器加载器：运行时只从 .rssany/collectors/ 加载 SiteCollector / Collector。

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { SiteCollector } from "../scraper/sources/web/site.js";
import type { Collector } from "../scraper/sources/types.js";
import { USER_COLLECTORS_DIR } from "../config/paths.js";
import { logger } from "../core/logger/index.js";


/** LLM 帮助函数，由 feeder 注入到采集器上下文 */
export interface CollectorLlm {
  chatJson: (prompt: string, config?: Record<string, unknown>, options?: { maxTokens?: number; debugLabel?: string }) => Promise<Record<string, unknown>>;
  chatText: (prompt: string, config?: Record<string, unknown>, options?: { maxTokens?: number; debugLabel?: string }) => Promise<string>;
}

/** DB 帮助函数，由 feeder 注入到采集器上下文 */
export interface CollectorDb {
  getSystemTags: () => Promise<string[]>;
}

/** 采集器统一上下文，由 feeder 在执行前注入 llm / db */
export interface CollectorRuntimeContext {
  sourceUrl?: string;
  llm?: CollectorLlm;
  db?: CollectorDb;
  [key: string]: unknown;
}


const COLLECTOR_EXTENSIONS = [".rssany.js", ".rssany.ts"];


/** 判断对象是否为有效的 SiteCollector 实现 */
function isValidSite(obj: unknown): obj is SiteCollector {
  if (obj == null || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    (typeof s.listUrlPattern === "string" || s.listUrlPattern instanceof RegExp) &&
    typeof s.fetchItems === "function"
  );
}

/** 判断对象是否为有效的 Collector 实现 */
function isValidSource(obj: unknown): obj is Collector {
  if (obj == null || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    (typeof s.pattern === "string" || s.pattern instanceof RegExp) &&
    typeof s.fetchItems === "function" &&
    s.listUrlPattern === undefined
  );
}

/** 从单个目录加载采集器，并记录每个采集器的文件路径 */
async function loadCollectorsFromDir(
  dir: string,
  label: string,
): Promise<{
  siteEntries: Array<{ site: SiteCollector; filePath: string }>;
  sources: Array<{ source: Collector; filePath: string }>;
}> {
  const siteEntries: Array<{ site: SiteCollector; filePath: string }> = [];
  const sources: Array<{ source: Collector; filePath: string }> = [];
  let entries: { name: string; isFile: () => boolean }[];
  try {
    const raw = await readdir(dir, { withFileTypes: true, encoding: "utf-8" });
    entries = raw as { name: string; isFile: () => boolean }[];
  } catch {
    return { siteEntries, sources };
  }
  for (const e of entries) {
    const name = String(e.name);
    if (!e.isFile()) continue;
    if (!COLLECTOR_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    const filePath = join(dir, name);
    try {
      const moduleUrl = pathToFileURL(filePath);
      // ESM import 自带模块缓存；加入文件版本确保 API/MCP 修改后 initCollectors() 能加载新代码。
      const contentHash = createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 16);
      moduleUrl.searchParams.set("v", contentHash);
      const mod = await import(moduleUrl.href);
      const collector = mod.default ?? mod;
      if (isValidSite(collector)) {
        siteEntries.push({ site: collector, filePath });
      } else if (isValidSource(collector)) {
        sources.push({ source: collector, filePath });
      } else {
        logger.warn("collector", "采集器未实现 SiteCollector 或 Collector 接口，已跳过", { label, name });
      }
    } catch (err) {
      logger.warn("collector", "采集器加载失败", { label, name, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { siteEntries, sources };
}


/** 采集器 id → 当前生效的用户目录文件路径。 */
const collectorFilePaths = new Map<string, string>();

function mergeSites(entries: Array<{ site: SiteCollector; filePath: string }>): Map<string, SiteCollector> {
  const sites = new Map<string, SiteCollector>();
  for (const { site } of entries) {
    if (sites.has(site.id)) logger.warn("collector", "用户目录存在重复 SiteCollector id，后加载文件生效", { collectorId: site.id });
    sites.set(site.id, site);
  }
  return sites;
}

function mergeSources(entries: Array<{ source: Collector; filePath: string }>): Map<string, Collector> {
  const sources = new Map<string, Collector>();
  for (const { source } of entries) {
    if (sources.has(source.id)) logger.warn("collector", "用户目录存在重复 Collector id，后加载文件生效", { collectorId: source.id });
    sources.set(source.id, source);
  }
  return sources;
}

function updateCollectorPaths(
  siteEntries: Array<{ site: SiteCollector; filePath: string }>,
  sourceEntries: Array<{ source: Collector; filePath: string }>,
  activeSiteIds: Set<string>,
): void {
  const pathMap = new Map<string, string>();
  for (const { site, filePath } of siteEntries) pathMap.set(site.id, filePath);
  for (const { source, filePath } of sourceEntries) {
    if (activeSiteIds.has(source.id)) {
      logger.warn("collector", "Collector id 与 SiteCollector id 冲突，已忽略 Collector 路径", { collectorId: source.id });
      continue;
    }
    pathMap.set(source.id, filePath);
  }
  collectorFilePaths.clear();
  pathMap.forEach((path, id) => collectorFilePaths.set(id, path));
}

/** 根据采集器 id 获取其源文件路径（仅当前生效的采集器有路径）。 */
export function getCollectorFilePath(id: string): string | undefined {
  return collectorFilePaths.get(id);
}

/** 加载用户目录中的所有站点采集器。 */
export async function loadSiteCollectors(): Promise<SiteCollector[]> {
  const user = await loadCollectorsFromDir(USER_COLLECTORS_DIR, "user");
  const sites = mergeSites(user.siteEntries);
  updateCollectorPaths(user.siteEntries, user.sources, new Set(sites.keys()));
  return Array.from(sites.values());
}


/** 加载用户目录中的所有通用采集器。 */
export async function loadCollectors(): Promise<Collector[]> {
  const user = await loadCollectorsFromDir(USER_COLLECTORS_DIR, "user");
  return Array.from(mergeSources(user.sources).values());
}


/** 从用户目录加载两类采集器，供 initCollectors 使用；同时更新文件路径。 */
export async function loadAllCollectors(): Promise<{ sites: SiteCollector[]; collectors: Collector[] }> {
  const user = await loadCollectorsFromDir(USER_COLLECTORS_DIR, "user");
  const sites = mergeSites(user.siteEntries);
  const collectors = mergeSources(user.sources);
  updateCollectorPaths(user.siteEntries, user.sources, new Set(sites.keys()));
  return { sites: Array.from(sites.values()), collectors: Array.from(collectors.values()) };
}
