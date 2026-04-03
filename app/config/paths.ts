// 路径配置：集中管理所有运行时路径，区分项目文件与用户数据

import { mkdir, rename, access } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../core/logger/index.js";

/** 用户数据根目录：.rssany/（不纳入版本管理，存放所有运行时用户数据） */
export const USER_DIR = join(process.cwd(), ".rssany");

/** SQLite 数据库目录：.rssany/data/ */
export const DATA_DIR = join(USER_DIR, "data");

/** 缓存目录：.rssany/cache/（fetched、extracted、feeds、domains、browser_data 等子目录）；环境变量 CACHE_DIR 可覆盖 */
export const CACHE_DIR = process.env.CACHE_DIR ?? join(USER_DIR, "cache");

/** 站点配置文件：.rssany/sites.json */
export const SITES_CONFIG_PATH = join(USER_DIR, "sites.json");

/** 爬虫配置：.rssany/sources.json（扁平信源列表，供 scheduler 使用） */
export const SOURCES_CONFIG_PATH = join(USER_DIR, "sources.json");

/** 系统标签配置：.rssany/tags.json（供 pipeline tagger 使用） */
export const TAGS_CONFIG_PATH = join(USER_DIR, "tags.json");

/** 全局配置：.rssany/config.json（enrich、pipeline 等） */
export const CONFIG_PATH = join(USER_DIR, "config.json");

/** @deprecated 仅用于迁移：若存在 .rssany/subscriptions.json 且无 sources.json 则迁移为 sources.json */
const LEGACY_SUBSCRIPTIONS_PATH = join(USER_DIR, "subscriptions.json");

/** 内置插件目录：plugins/（项目文件，纳入版本管理） */
export const BUILTIN_PLUGINS_DIR = join(process.cwd(), "plugins");

/** 用户自定义插件目录：.rssany/plugins/（用户数据，不纳入版本管理） */
export const USER_PLUGINS_DIR = join(USER_DIR, "plugins");

/** 插件子目录：sources（信源） / enrich（补全）；pipeline 已移至 app/pipeline/ 作为固定流程 */
export const BUILTIN_SOURCES_DIR = join(BUILTIN_PLUGINS_DIR, "sources");
export const USER_SOURCES_DIR = join(USER_PLUGINS_DIR, "sources");
export const BUILTIN_ENRICH_DIR = join(BUILTIN_PLUGINS_DIR, "enrich");
export const USER_ENRICH_DIR = join(USER_PLUGINS_DIR, "enrich");

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function migrateFile(from: string, to: string): Promise<void> {
  if (!(await pathExists(from))) return;
  if (await pathExists(to)) return;
  try {
    await rename(from, to);
    logger.info("config", "配置已迁移", { from, to });
  } catch (err) {
    logger.warn("config", "配置迁移失败", { from, to, err: err instanceof Error ? err.message : String(err) });
  }
}

/** 初始化用户数据目录，自动迁移旧版配置文件到 .rssany/ */
export async function initUserDir(): Promise<void> {
  await mkdir(USER_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(USER_PLUGINS_DIR, { recursive: true });
  await mkdir(USER_SOURCES_DIR, { recursive: true });
  await mkdir(USER_ENRICH_DIR, { recursive: true });
  await migrateFile(join(process.cwd(), "sites.json"), SITES_CONFIG_PATH);
  await migrateFile(join(process.cwd(), "subscriptions.json"), SOURCES_CONFIG_PATH);
  await migrateFile(join(process.cwd(), "data", "rssany.db"), join(DATA_DIR, "rssany.db"));
  if (!(await pathExists(SOURCES_CONFIG_PATH)) && (await pathExists(LEGACY_SUBSCRIPTIONS_PATH))) {
    await migrateFile(LEGACY_SUBSCRIPTIONS_PATH, SOURCES_CONFIG_PATH);
  }
}
