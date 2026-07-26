// 路径配置：集中管理所有运行时路径，区分项目文件与用户数据

import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { getLegacyHomeUserDir, resolveDefaultUserDir } from "./userDir.js";

/** 用户数据根目录：全局安装时为 {npm prefix}/var/rssany；开发时为 {repo}/.rssany */
export const USER_DIR = resolveDefaultUserDir(PACKAGE_ROOT);

/** SQLite 数据库目录：.rssany/data/ */
export const DATA_DIR = join(USER_DIR, "data");

/** 缓存目录：.rssany/cache/（fetched、extracted、feeds、domains、browser_data 等子目录）；环境变量 CACHE_DIR 可覆盖 */
export const CACHE_DIR = process.env.CACHE_DIR ?? join(USER_DIR, "cache");

/** 唯一运行时配置：.rssany/config.json */
export const CONFIG_PATH = join(USER_DIR, "config.json");

/** 旧版分散配置，仅在启动时合入 config.json 后删除。 */
const LEGACY_SOURCES_CONFIG_PATH = join(USER_DIR, "sources.json");
const LEGACY_SITES_CONFIG_PATH = join(USER_DIR, "sites.json");
const LEGACY_TAGS_CONFIG_PATH = join(USER_DIR, "tags.json");
const LEGACY_SUBSCRIPTIONS_PATH = join(USER_DIR, "subscriptions.json");

/** 内置信源插件目录：app/plugins/builtin/（随包发布 *.rssany.js） */
export const BUILTIN_PLUGINS_DIR = join(PACKAGE_ROOT, "app/plugins/builtin");

/** 用户插件目录：.rssany/plugins/（扁平 *.rssany.js / *.rssany.ts） */
export const USER_PLUGINS_DIR = join(USER_DIR, "plugins");

/** 首次复制内置插件完成标记；存在时不再补回被用户修改或删除的插件。 */
export const BUILTIN_PLUGINS_SEED_MARKER_PATH = join(USER_PLUGINS_DIR, ".builtin-plugins-initialized.json");

/** 限定 .rssany 下动态 import 的模块类型，避免 Node 一直向上解析到用户主目录的 package.json 并触发 MODULE_TYPELESS_PACKAGE_JSON */
const USER_DIR_PACKAGE_JSON = join(USER_DIR, "package.json");
const USER_DIR_PACKAGE_JSON_MINIMAL = `${JSON.stringify({ type: "module", private: true, description: "RssAny user data root; marks plugins as ESM for Node" })}\n`;

function logConfig(level: "info" | "warn", message: string, meta: Record<string, unknown>): void {
  void import("../core/logger/index.js").then(({ logger }) => {
    logger[level]("config", message, meta);
  });
}

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

/** 包内首次初始化用的默认数据（`app/init/`；发布包需列入 package.json `files`） */
const INIT_DATA_DIR = join(PACKAGE_ROOT, "app/init");
const EXAMPLE_CONFIG = join(INIT_DATA_DIR, "config.json");

/** 若用户目录尚无 config.json，则复制统一的默认配置。 */
async function seedExampleConfigsIfMissing(): Promise<void> {
  if (!(await pathExists(CONFIG_PATH)) && (await pathExists(EXAMPLE_CONFIG))) {
    try {
      await copyFile(EXAMPLE_CONFIG, CONFIG_PATH);
      logConfig("info", "已写入默认配置示例", { path: CONFIG_PATH });
    } catch (err) {
      logConfig("warn", "写入 config 示例失败", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 将旧版 sources/sites/tags/subscriptions 文件一次性合入统一配置。 */
async function mergeLegacyConfigFiles(): Promise<void> {
  const config = (await readJsonObject(CONFIG_PATH)) ?? {};
  let changed = false;
  const migratedPaths = new Set<string>();
  if (typeof config.initialized !== "boolean") {
    config.initialized = false;
    changed = true;
  }
  if (!Array.isArray(config.sources)) {
    config.sources = [];
    changed = true;
  }
  if (!config.sites || typeof config.sites !== "object" || Array.isArray(config.sites)) {
    config.sites = {};
    changed = true;
  }
  if (!Array.isArray(config.tags)) {
    config.tags = [];
    changed = true;
  }

  const legacySources: unknown[] = [];
  let foundLegacySources = false;
  for (const sourcePath of [LEGACY_SOURCES_CONFIG_PATH, LEGACY_SUBSCRIPTIONS_PATH]) {
    const sourceFile = await readJsonObject(sourcePath);
    if (!sourceFile || !Array.isArray(sourceFile.sources)) continue;
    foundLegacySources = true;
    legacySources.push(...sourceFile.sources);
    migratedPaths.add(sourcePath);
  }
  if (foundLegacySources) {
    config.sources = legacySources;
    changed = true;
  }

  const sitesFile = await readJsonObject(LEGACY_SITES_CONFIG_PATH);
  if (sitesFile) {
    config.sites = sitesFile.sites ?? sitesFile;
    migratedPaths.add(LEGACY_SITES_CONFIG_PATH);
    changed = true;
  }

  const tagsFile = await readJsonObject(LEGACY_TAGS_CONFIG_PATH);
  if (tagsFile && Array.isArray(tagsFile.tags)) {
    config.tags = tagsFile.tags;
    migratedPaths.add(LEGACY_TAGS_CONFIG_PATH);
    changed = true;
  }

  if (changed) {
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    logConfig("info", "旧版分散配置已合入 config.json", { path: CONFIG_PATH });
  }

  for (const legacyPath of migratedPaths) {
    await rm(legacyPath);
  }
}

/** 若尚无文件则写入最小 package.json，使用户插件目录下的 *.rssany.js 被明确视为 ESM */
async function ensureUserDirPackageJsonForPlugins(): Promise<void> {
  if (await pathExists(USER_DIR_PACKAGE_JSON)) return;
  try {
    await writeFile(USER_DIR_PACKAGE_JSON, USER_DIR_PACKAGE_JSON_MINIMAL, "utf-8");
    logConfig("info", "已写入 .rssany/package.json（type: module，消除插件 ESM 歧义）", { path: USER_DIR_PACKAGE_JSON });
  } catch (err) {
    logConfig("warn", "写入 .rssany/package.json 失败", {
      path: USER_DIR_PACKAGE_JSON,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 首次初始化时将随包插件复制到用户目录；已有同名文件不覆盖，后续启动不再同步。 */
async function seedBuiltinPluginsOnce(): Promise<void> {
  if (await pathExists(BUILTIN_PLUGINS_SEED_MARKER_PATH)) return;

  const entries = await readdir(BUILTIN_PLUGINS_DIR, { withFileTypes: true, encoding: "utf-8" });
  const availableFiles = entries
    .filter((entry) => entry.isFile() && [".rssany.js", ".rssany.ts"].some((ext) => entry.name.endsWith(ext)))
    .map((entry) => String(entry.name))
    .sort();
  const copiedFiles: string[] = [];

  for (const fileName of availableFiles) {
    const sourcePath = join(BUILTIN_PLUGINS_DIR, fileName);
    const targetPath = join(USER_PLUGINS_DIR, fileName);
    try {
      await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
      copiedFiles.push(fileName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  await writeFile(
    BUILTIN_PLUGINS_SEED_MARKER_PATH,
    JSON.stringify(
      {
        initializedAt: new Date().toISOString(),
        availableFiles,
        copiedFiles,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  logConfig("info", "内置插件已初始化到用户目录", {
    path: USER_PLUGINS_DIR,
    copied: copiedFiles.length,
    preserved: availableFiles.length - copiedFiles.length,
  });
}

async function migrateLegacyHomeUserDir(): Promise<void> {
  const legacy = getLegacyHomeUserDir();
  if (USER_DIR === legacy) return;
  if (await pathExists(USER_DIR)) return;
  if (!(await pathExists(legacy))) return;
  try {
    await rename(legacy, USER_DIR);
    logConfig("info", "已从 ~/.rssany 迁移用户数据", { from: legacy, to: USER_DIR });
  } catch (err) {
    logConfig("warn", "从 ~/.rssany 迁移失败", {
      from: legacy,
      to: USER_DIR,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 初始化用户数据目录与唯一的 config.json。 */
export async function initUserDir(): Promise<void> {
  await migrateLegacyHomeUserDir();
  await mkdir(USER_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(USER_PLUGINS_DIR, { recursive: true });
  await ensureUserDirPackageJsonForPlugins();
  await seedBuiltinPluginsOnce();
  await seedExampleConfigsIfMissing();
  await mergeLegacyConfigFiles();
}
