// 路径配置：集中管理所有运行时路径，区分项目文件与用户数据

import { mkdir, rename, access, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../core/logger/index.js";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { getLegacyHomeUserDir, resolveDefaultUserDir } from "./userDir.js";

/** 用户数据根目录：全局安装时为 {npm prefix}/var/rssany；开发时为 {repo}/.rssany */
export const USER_DIR = resolveDefaultUserDir(PACKAGE_ROOT);

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

/** 全局配置：.rssany/config.json（pipeline 等） */
export const CONFIG_PATH = join(USER_DIR, "config.json");

/** @deprecated 仅用于迁移：若存在 .rssany/subscriptions.json 且无 sources.json 则迁移为 sources.json */
const LEGACY_SUBSCRIPTIONS_PATH = join(USER_DIR, "subscriptions.json");

/** 内置信源插件目录：app/plugins/builtin/（随包发布 *.rssany.js） */
export const BUILTIN_PLUGINS_DIR = join(PACKAGE_ROOT, "app/plugins/builtin");

/** 用户插件目录：.rssany/plugins/（扁平 *.rssany.js / *.rssany.ts） */
export const USER_PLUGINS_DIR = join(USER_DIR, "plugins");

/** 限定 .rssany 下动态 import 的模块类型，避免 Node 一直向上解析到用户主目录的 package.json 并触发 MODULE_TYPELESS_PACKAGE_JSON */
const USER_DIR_PACKAGE_JSON = join(USER_DIR, "package.json");
const USER_DIR_PACKAGE_JSON_MINIMAL = `${JSON.stringify({ type: "module", private: true, description: "RssAny user data root; marks plugins as ESM for Node" })}\n`;

/** 管理页「添加插件」所用模板（非 Site，不参与加载） */
export const PLUGIN_SITE_TEMPLATE_PATH = join(PACKAGE_ROOT, "app/plugins/site.rssany.js");

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

/** 包内首次初始化用的默认数据（`app/init/`；发布包需列入 package.json `files`） */
const INIT_DATA_DIR = join(PACKAGE_ROOT, "app/init");
const EXAMPLE_SOURCES = join(INIT_DATA_DIR, "sources.json");
const EXAMPLE_CONFIG = join(INIT_DATA_DIR, "config.json");

/**
 * 若用户目录尚无 `sources.json` / `config.json`，则从包内 `app/init/sources.json`、`app/init/config.json` 复制（不覆盖已有文件）。
 */
async function seedExampleConfigsIfMissing(): Promise<void> {
  if (!(await pathExists(SOURCES_CONFIG_PATH)) && (await pathExists(EXAMPLE_SOURCES))) {
    try {
      await copyFile(EXAMPLE_SOURCES, SOURCES_CONFIG_PATH);
      logger.info("config", "已写入默认信源示例", { path: SOURCES_CONFIG_PATH });
    } catch (err) {
      logger.warn("config", "写入 sources 示例失败", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!(await pathExists(CONFIG_PATH)) && (await pathExists(EXAMPLE_CONFIG))) {
    try {
      await copyFile(EXAMPLE_CONFIG, CONFIG_PATH);
      logger.info("config", "已写入默认配置示例", { path: CONFIG_PATH });
    } catch (err) {
      logger.warn("config", "写入 config 示例失败", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** 若尚无文件则写入最小 package.json，使用户插件目录下的 *.rssany.js 被明确视为 ESM */
async function ensureUserDirPackageJsonForPlugins(): Promise<void> {
  if (await pathExists(USER_DIR_PACKAGE_JSON)) return;
  try {
    await writeFile(USER_DIR_PACKAGE_JSON, USER_DIR_PACKAGE_JSON_MINIMAL, "utf-8");
    logger.info("config", "已写入 .rssany/package.json（type: module，消除插件 ESM 歧义）", { path: USER_DIR_PACKAGE_JSON });
  } catch (err) {
    logger.warn("config", "写入 .rssany/package.json 失败", {
      path: USER_DIR_PACKAGE_JSON,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function migrateLegacyHomeUserDir(): Promise<void> {
  const legacy = getLegacyHomeUserDir();
  if (USER_DIR === legacy) return;
  if (await pathExists(USER_DIR)) return;
  if (!(await pathExists(legacy))) return;
  try {
    await rename(legacy, USER_DIR);
    logger.info("config", "已从 ~/.rssany 迁移用户数据", { from: legacy, to: USER_DIR });
  } catch (err) {
    logger.warn("config", "从 ~/.rssany 迁移失败", {
      from: legacy,
      to: USER_DIR,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 初始化用户数据目录；若缺少 sources.json / config.json 则从包内示例复制 */
export async function initUserDir(): Promise<void> {
  await migrateLegacyHomeUserDir();
  await mkdir(USER_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(USER_PLUGINS_DIR, { recursive: true });
  await ensureUserDirPackageJsonForPlugins();
  await seedExampleConfigsIfMissing();
  if (!(await pathExists(SOURCES_CONFIG_PATH)) && (await pathExists(LEGACY_SUBSCRIPTIONS_PATH))) {
    await migrateFile(LEGACY_SUBSCRIPTIONS_PATH, SOURCES_CONFIG_PATH);
  }
}
