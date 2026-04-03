// 插件加载器：从 plugins/{sources,enrich}/ 和 .rssany/plugins/{sources,enrich}/ 加载信源与 enrich 插件
// pipeline 已移至 app/pipeline/ 作为固定流程，不再作为插件

import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { Site } from "../scraper/sources/web/site.js";
import type { Source } from "../scraper/sources/types.js";
import {
  BUILTIN_SOURCES_DIR,
  USER_SOURCES_DIR,
  BUILTIN_ENRICH_DIR,
  USER_ENRICH_DIR,
  BUILTIN_PLUGINS_DIR,
  USER_PLUGINS_DIR,
} from "../config/paths.js";
import { logger } from "../core/logger/index.js";
import type { FeedItem } from "../types/feedItem.js";


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
  isEnriched?: boolean;
  llm?: PluginLlm;
  db?: PluginDb;
  [key: string]: unknown;
}


const PLUGIN_EXTENSIONS = [".rssany.js", ".rssany.ts"];


/** Enrich 插件上下文（提供 fetchHtml、extractItem 等） */
export interface EnrichContext {
  cacheDir?: string;
  headless?: boolean;
  proxy?: string;
  sourceUrl?: string;
  fetchHtml(url: string, opts?: { waitMs?: number; purify?: boolean }): Promise<{ html: string; finalUrl: string; status: number }>;
  extractItem(item: FeedItem, opts?: { cacheKey?: string }): Promise<FeedItem>;
}

/** Enrich 插件：对条目补全正文等 */
export interface EnrichPlugin {
  id: string;
  match: (item: FeedItem, ctx: { sourceUrl?: string }) => boolean;
  enrichItem: (item: FeedItem, ctx: EnrichContext) => Promise<FeedItem>;
  priority?: number;
}

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

/** 判断对象是否为有效的 EnrichPlugin */
function isValidEnrichPlugin(obj: unknown): obj is EnrichPlugin {
  if (obj == null || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.match === "function" && typeof p.enrichItem === "function";
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
      const mod = await import(pathToFileURL(filePath).href);
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


/** 从单个目录加载指定类型插件 */
async function loadPluginsFromDir<T>(
  dir: string,
  label: string,
  validator: (obj: unknown) => obj is T,
): Promise<T[]> {
  const result: T[] = [];
  let entries: { name: string; isFile: () => boolean }[];
  try {
    const raw = await readdir(dir, { withFileTypes: true, encoding: "utf-8" });
    entries = raw as { name: string; isFile: () => boolean }[];
  } catch {
    return result;
  }
  for (const e of entries) {
    const name = String(e.name);
    if (!e.isFile()) continue;
    if (!PLUGIN_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    const filePath = join(dir, name);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const plugin = mod.default ?? mod;
      if (validator(plugin)) {
        result.push(plugin);
      } else {
        logger.warn("plugin", "插件接口不匹配，已跳过", { label, name });
      }
    } catch (err) {
      logger.warn("plugin", "插件加载失败", { label, name, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}


/** 加载 sources 目录，若不存在或为空则回退到 plugins 根目录 */
async function loadFromSourcesOrRoot(): Promise<{
  builtin: {
    siteEntries: Array<{ site: Site; filePath: string }>;
    sources: Array<{ source: Source; filePath: string }>;
  };
  user: {
    siteEntries: Array<{ site: Site; filePath: string }>;
    sources: Array<{ source: Source; filePath: string }>;
  };
}> {
  const [builtinFromSources, userFromSources] = await Promise.all([
    loadSourcePluginsFromDir(BUILTIN_SOURCES_DIR, "builtin:sources"),
    loadSourcePluginsFromDir(USER_SOURCES_DIR, "user:sources"),
  ]);
  const hasAny =
    builtinFromSources.siteEntries.length +
    builtinFromSources.sources.length +
    userFromSources.siteEntries.length +
    userFromSources.sources.length > 0;
  if (hasAny) return { builtin: builtinFromSources, user: userFromSources };
  const [builtinRoot, userRoot] = await Promise.all([
    loadSourcePluginsFromDir(BUILTIN_PLUGINS_DIR, "builtin"),
    loadSourcePluginsFromDir(USER_PLUGINS_DIR, "user"),
  ]);
  return { builtin: builtinRoot, user: userRoot };
}


/** Site / Source 插件 id → 当前生效的文件路径（用户覆盖内置后的路径） */
const pluginSitePaths = new Map<string, string>();

/** 将 Source 插件路径写入 pathMap（不与 Site id 冲突；用户覆盖内置 Source） */
function mergeSourcePluginPaths(
  siteIds: Set<string>,
  pathMap: Map<string, string>,
  builtinSources: Array<{ source: Source; filePath: string }>,
  userSources: Array<{ source: Source; filePath: string }>,
): void {
  for (const { source, filePath } of builtinSources) {
    if (siteIds.has(source.id)) {
      logger.warn("plugin", "Source 插件 id 与 Site 插件冲突，已忽略 Source 路径", { sourceId: source.id });
      continue;
    }
    pathMap.set(source.id, filePath);
  }
  for (const { source, filePath } of userSources) {
    if (siteIds.has(source.id)) {
      logger.warn("plugin", "Source 插件 id 与 Site 插件冲突，已忽略 Source 路径", { sourceId: source.id });
      continue;
    }
    if (pathMap.has(source.id)) logger.info("plugin", "用户 Source 插件覆盖同名内置", { sourceId: source.id });
    pathMap.set(source.id, filePath);
  }
}

/** 根据插件 id 获取其源文件路径（用于详情页编辑，仅当前生效的插件有路径） */
export function getPluginFilePath(id: string): string | undefined {
  return pluginSitePaths.get(id);
}

/** 加载所有 Site 插件；用户插件可覆盖同 id 内置 */
export async function loadPlugins(): Promise<Site[]> {
  const { builtin, user } = await loadFromSourcesOrRoot();
  const merged = new Map<string, Site>();
  const pathMap = new Map<string, string>();
  for (const { site, filePath } of builtin.siteEntries) {
    merged.set(site.id, site);
    pathMap.set(site.id, filePath);
  }
  for (const { site, filePath } of user.siteEntries) {
    if (merged.has(site.id)) logger.info("plugin", "用户插件覆盖同名内置插件", { pluginId: site.id });
    merged.set(site.id, site);
    pathMap.set(site.id, filePath);
  }
  mergeSourcePluginPaths(new Set(merged.keys()), pathMap, builtin.sources, user.sources);
  pluginSitePaths.clear();
  pathMap.forEach((path, id) => pluginSitePaths.set(id, path));
  return Array.from(merged.values());
}


/** 加载所有 Source 插件；用户插件可覆盖同 id */
export async function loadSourcePlugins(): Promise<Source[]> {
  const { builtin, user } = await loadFromSourcesOrRoot();
  const merged = new Map<string, Source>();
  for (const { source } of builtin.sources) merged.set(source.id, source);
  for (const { source } of user.sources) {
    if (merged.has(source.id)) logger.info("plugin", "用户 Source 插件覆盖同名内置", { sourceId: source.id });
    merged.set(source.id, source);
  }
  return Array.from(merged.values());
}


/** 加载 Site 与 Source：合并去重，供 initSources 使用；同时更新 pluginSitePaths */
export async function loadSiteAndSourcePlugins(): Promise<{ sites: Site[]; sources: Source[] }> {
  const { builtin, user } = await loadFromSourcesOrRoot();
  const siteMap = new Map<string, Site>();
  const pathMap = new Map<string, string>();
  for (const { site: s, filePath } of builtin.siteEntries) {
    siteMap.set(s.id, s);
    pathMap.set(s.id, filePath);
  }
  for (const { site: s, filePath } of user.siteEntries) {
    if (siteMap.has(s.id)) logger.info("plugin", "用户插件覆盖同名内置", { pluginId: s.id });
    siteMap.set(s.id, s);
    pathMap.set(s.id, filePath);
  }
  mergeSourcePluginPaths(new Set(siteMap.keys()), pathMap, builtin.sources, user.sources);
  const sourceMap = new Map<string, Source>();
  for (const { source } of builtin.sources) sourceMap.set(source.id, source);
  for (const { source } of user.sources) {
    if (sourceMap.has(source.id)) logger.info("plugin", "用户 Source 插件覆盖同名内置", { sourceId: source.id });
    sourceMap.set(source.id, source);
  }
  pluginSitePaths.clear();
  pathMap.forEach((path, id) => pluginSitePaths.set(id, path));
  return { sites: Array.from(siteMap.values()), sources: Array.from(sourceMap.values()) };
}


/** 已加载的 Enrich 插件（按 priority 排序） */
export let registeredEnrichPlugins: EnrichPlugin[] = [];


/** 加载 Enrich 插件 */
export async function loadEnrichPlugins(): Promise<EnrichPlugin[]> {
  const [builtin, user] = await Promise.all([
    loadPluginsFromDir(BUILTIN_ENRICH_DIR, "builtin:enrich", isValidEnrichPlugin),
    loadPluginsFromDir(USER_ENRICH_DIR, "user:enrich", isValidEnrichPlugin),
  ]);
  const merged = new Map<string, EnrichPlugin>();
  for (const p of builtin) merged.set(p.id, p);
  for (const p of user) {
    if (merged.has(p.id)) logger.info("plugin", "用户 Enrich 插件覆盖同名内置", { pluginId: p.id });
    merged.set(p.id, p);
  }
  const list = Array.from(merged.values());
  list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  registeredEnrichPlugins = list;
  return list;
}


/** 根据条目获取匹配的 Enrich 插件（优先级最高者） */
export function getMatchedEnrichPlugin(item: FeedItem, ctx: { sourceUrl?: string }): EnrichPlugin | undefined {
  return registeredEnrichPlugins.find((p) => p.match(item, ctx));
}


