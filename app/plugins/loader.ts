// 插件加载器：运行时只从 .rssany/plugins/ 加载 Site / Source 插件。

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { Site } from "../scraper/sources/web/site.js";
import type { Source } from "../scraper/sources/types.js";
import { USER_PLUGINS_DIR } from "../config/paths.js";
import { logger } from "../core/logger/index.js";


/** LLM 帮助函数，由 feeder 注入到插件上下文 */
export interface PluginLlm {
  chatJson: (prompt: string, config?: Record<string, unknown>, options?: { maxTokens?: number; debugLabel?: string }) => Promise<Record<string, unknown>>;
  chatText: (prompt: string, config?: Record<string, unknown>, options?: { maxTokens?: number; debugLabel?: string }) => Promise<string>;
}

/** DB 帮助函数，由 feeder 注入到插件上下文 */
export interface PluginDb {
  getSystemTags: () => Promise<string[]>;
}

/** 插件统一上下文，由 feeder 在执行前注入 llm / db */
export interface PluginContext {
  sourceUrl?: string;
  llm?: PluginLlm;
  db?: PluginDb;
  [key: string]: unknown;
}


const PLUGIN_EXTENSIONS = [".rssany.js", ".rssany.ts"];


/** 判断对象是否为有效的 Site 实现 */
function isValidSite(obj: unknown): obj is Site {
  if (obj == null || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    (typeof s.listUrlPattern === "string" || s.listUrlPattern instanceof RegExp) &&
    typeof s.fetchItems === "function"
  );
}

/** 判断对象是否为有效的 Source 实现 */
function isValidSource(obj: unknown): obj is Source {
  if (obj == null || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    (typeof s.pattern === "string" || s.pattern instanceof RegExp) &&
    typeof s.fetchItems === "function" &&
    s.listUrlPattern === undefined
  );
}

/** 从单个目录加载 Site / Source 插件，并记录每个 Site / Source 的文件路径 */
async function loadSourcePluginsFromDir(
  dir: string,
  label: string,
): Promise<{
  siteEntries: Array<{ site: Site; filePath: string }>;
  sources: Array<{ source: Source; filePath: string }>;
}> {
  const siteEntries: Array<{ site: Site; filePath: string }> = [];
  const sources: Array<{ source: Source; filePath: string }> = [];
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
    if (!PLUGIN_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    const filePath = join(dir, name);
    try {
      const moduleUrl = pathToFileURL(filePath);
      // ESM import 自带模块缓存；加入文件版本确保 API/MCP 修改后 initSources() 能加载新代码。
      const contentHash = createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 16);
      moduleUrl.searchParams.set("v", contentHash);
      const mod = await import(moduleUrl.href);
      const plugin = mod.default ?? mod;
      if (isValidSite(plugin)) {
        siteEntries.push({ site: plugin, filePath });
      } else if (isValidSource(plugin)) {
        sources.push({ source: plugin, filePath });
      } else {
        logger.warn("plugin", "插件未实现 Site 或 Source 接口，已跳过", { label, name });
      }
    } catch (err) {
      logger.warn("plugin", "插件加载失败", { label, name, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { siteEntries, sources };
}


/** Site / Source 插件 id → 当前生效的用户目录文件路径。 */
const pluginSitePaths = new Map<string, string>();

function mergeSites(entries: Array<{ site: Site; filePath: string }>): Map<string, Site> {
  const sites = new Map<string, Site>();
  for (const { site } of entries) {
    if (sites.has(site.id)) logger.warn("plugin", "用户目录存在重复 Site id，后加载文件生效", { pluginId: site.id });
    sites.set(site.id, site);
  }
  return sites;
}

function mergeSources(entries: Array<{ source: Source; filePath: string }>): Map<string, Source> {
  const sources = new Map<string, Source>();
  for (const { source } of entries) {
    if (sources.has(source.id)) logger.warn("plugin", "用户目录存在重复 Source id，后加载文件生效", { sourceId: source.id });
    sources.set(source.id, source);
  }
  return sources;
}

function updatePluginPaths(
  siteEntries: Array<{ site: Site; filePath: string }>,
  sourceEntries: Array<{ source: Source; filePath: string }>,
  activeSiteIds: Set<string>,
): void {
  const pathMap = new Map<string, string>();
  for (const { site, filePath } of siteEntries) pathMap.set(site.id, filePath);
  for (const { source, filePath } of sourceEntries) {
    if (activeSiteIds.has(source.id)) {
      logger.warn("plugin", "Source 插件 id 与 Site 插件冲突，已忽略 Source 路径", { sourceId: source.id });
      continue;
    }
    pathMap.set(source.id, filePath);
  }
  pluginSitePaths.clear();
  pathMap.forEach((path, id) => pluginSitePaths.set(id, path));
}

/** 根据插件 id 获取其源文件路径（仅当前生效的插件有路径）。 */
export function getPluginFilePath(id: string): string | undefined {
  return pluginSitePaths.get(id);
}

/** 加载用户目录中的所有 Site 插件。 */
export async function loadPlugins(): Promise<Site[]> {
  const user = await loadSourcePluginsFromDir(USER_PLUGINS_DIR, "user");
  const sites = mergeSites(user.siteEntries);
  updatePluginPaths(user.siteEntries, user.sources, new Set(sites.keys()));
  return Array.from(sites.values());
}


/** 加载用户目录中的所有 Source 插件。 */
export async function loadSourcePlugins(): Promise<Source[]> {
  const user = await loadSourcePluginsFromDir(USER_PLUGINS_DIR, "user");
  return Array.from(mergeSources(user.sources).values());
}


/** 从用户目录加载 Site 与 Source，供 initSources 使用；同时更新 pluginSitePaths。 */
export async function loadSiteAndSourcePlugins(): Promise<{ sites: Site[]; sources: Source[] }> {
  const user = await loadSourcePluginsFromDir(USER_PLUGINS_DIR, "user");
  const sites = mergeSites(user.siteEntries);
  const sources = mergeSources(user.sources);
  updatePluginPaths(user.siteEntries, user.sources, new Set(sites.keys()));
  return { sites: Array.from(sites.values()), sources: Array.from(sources.values()) };
}
