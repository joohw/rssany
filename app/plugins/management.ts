// 插件管理：运行时插件均位于 USER_PLUGINS_DIR，支持读取、修改和删除。

import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { USER_PLUGINS_DIR } from "../config/paths.js";
import { initSources, registeredSources } from "../scraper/sources/index.js";
import { getPluginSites } from "../scraper/sources/web/index.js";
import { getPluginFilePath } from "./loader.js";

export type PluginScope = "user";

export interface PluginSummary {
  kind: "site" | "source";
  id: string;
  name: string;
  listUrlPattern: string;
  hasAuth: boolean;
  scope: PluginScope;
  canDelete: boolean;
}

export interface PluginFile {
  id: string;
  fileName: string;
  filePath: string;
  scope: PluginScope;
  canDelete: boolean;
  content: string;
}

export class PluginManagementError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 | 500 = 400) {
    super(message);
    this.name = "PluginManagementError";
  }
}

let mutationQueue: Promise<void> = Promise.resolve();

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isValidPluginId(id: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(id) && id !== "generic" && id !== "new";
}

function isInside(root: string, filePath: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedFile = resolve(filePath);
  return normalizedFile.startsWith(normalizedRoot + sep);
}

function pluginScope(filePath: string): PluginScope | undefined {
  if (isInside(USER_PLUGINS_DIR, filePath)) return "user";
  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requirePluginId(rawId: string): string {
  const id = rawId.trim();
  if (!isValidPluginId(id)) {
    throw new PluginManagementError(
      "id 须为字母或下划线开头，仅含字母数字、下划线、连字符；不能为 generic 或 new",
      400,
    );
  }
  return id;
}

export function listManagedPlugins(): PluginSummary[] {
  const sites = getPluginSites().map<PluginSummary | null>((site) => {
    const filePath = getPluginFilePath(site.id);
    const scope = filePath ? pluginScope(filePath) : undefined;
    if (!scope) return null;
    return {
      kind: "site" as const,
      id: site.id,
      name: site.name ?? site.id,
      listUrlPattern: typeof site.listUrlPattern === "string" ? site.listUrlPattern : String(site.listUrlPattern),
      hasAuth: !!(site.checkAuth && site.loginUrl),
      scope,
      canDelete: scope === "user",
    };
  }).filter((plugin): plugin is PluginSummary => plugin != null);
  const siteIds = new Set(sites.map((plugin) => plugin.id));
  const sources = registeredSources
    .filter((source) => source.id !== "generic" && !siteIds.has(source.id))
    .map<PluginSummary | null>((source) => {
      const filePath = getPluginFilePath(source.id);
      const scope = filePath ? pluginScope(filePath) : undefined;
      if (!scope) return null;
      return {
        kind: "source" as const,
        id: source.id,
        name: source.name ?? source.id,
        listUrlPattern: typeof source.pattern === "string" ? source.pattern : String(source.pattern),
        hasAuth: false,
        scope,
        canDelete: scope === "user",
      };
    })
    .filter((plugin): plugin is PluginSummary => plugin != null);
  return [...sites, ...sources];
}

export async function readManagedPlugin(rawId: string): Promise<PluginFile> {
  const id = requirePluginId(rawId);
  const filePath = getPluginFilePath(id);
  if (!filePath) throw new PluginManagementError("未找到该插件或无可读取文件", 404);
  const scope = pluginScope(filePath);
  if (!scope) throw new PluginManagementError("插件路径不允许", 403);
  try {
    return {
      id,
      fileName: basename(filePath),
      filePath,
      scope,
      canDelete: scope === "user",
      content: await readFile(filePath, "utf-8"),
    };
  } catch (error) {
    throw new PluginManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function writeManagedPlugin(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean } = {},
): Promise<PluginFile> {
  return enqueueMutation(() => writeManagedPluginUnlocked(rawId, content, options));
}

async function writeManagedPluginUnlocked(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean },
): Promise<PluginFile> {
  const id = requirePluginId(rawId);
  if (typeof content !== "string") throw new PluginManagementError("需要 content 字符串", 400);
  if (Buffer.byteLength(content, "utf-8") > 2 * 1024 * 1024) {
    throw new PluginManagementError("插件文件不能超过 2 MiB", 400);
  }
  await mkdir(USER_PLUGINS_DIR, { recursive: true });

  const activePath = getPluginFilePath(id);
  const targetPath = activePath && pluginScope(activePath) === "user"
    ? activePath
    : join(USER_PLUGINS_DIR, `${id}.rssany.js`);
  if (!isInside(USER_PLUGINS_DIR, targetPath)) throw new PluginManagementError("插件路径不允许", 403);
  if (options.mustNotExist && (activePath || await fileExists(targetPath))) {
    throw new PluginManagementError("该 id 已存在", 409);
  }

  const existed = await fileExists(targetPath);
  const previous = existed ? await readFile(targetPath, "utf-8") : undefined;
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, targetPath);
    await initSources();
    const reloadedPath = getPluginFilePath(id);
    if (!reloadedPath || resolve(reloadedPath) !== resolve(targetPath)) {
      throw new PluginManagementError(
        `插件 ${id} 加载失败，文件必须导出相同 id、有效的 Site/Source 字段和 fetchItems()`,
        422,
      );
    }
    return readManagedPlugin(id);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (previous !== undefined) {
      await writeFile(targetPath, previous, "utf-8").catch(() => {});
    } else if (!existed) {
      await rm(targetPath, { force: true }).catch(() => {});
    }
    await initSources().catch(() => {});
    if (error instanceof PluginManagementError) throw error;
    throw new PluginManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function deleteManagedPlugin(rawId: string): Promise<{
  ok: true;
  id: string;
  deletedFile: string;
  activeScopeAfterDelete: PluginScope | null;
}> {
  return enqueueMutation(() => deleteManagedPluginUnlocked(rawId));
}

async function deleteManagedPluginUnlocked(rawId: string): Promise<{
  ok: true;
  id: string;
  deletedFile: string;
  activeScopeAfterDelete: PluginScope | null;
}> {
  const id = requirePluginId(rawId);
  const filePath = getPluginFilePath(id);
  if (!filePath) throw new PluginManagementError("未找到该插件", 404);
  if (pluginScope(filePath) !== "user") {
    throw new PluginManagementError("插件路径不允许", 403);
  }
  const deletedPath = `${filePath}.${process.pid}.${Date.now()}.deleted`;
  try {
    await rename(filePath, deletedPath);
    await initSources();
    const nextPath = getPluginFilePath(id);
    await rm(deletedPath, { force: true }).catch(() => {});
    return {
      ok: true,
      id,
      deletedFile: basename(filePath),
      activeScopeAfterDelete: nextPath ? pluginScope(nextPath) ?? null : null,
    };
  } catch (error) {
    if (await fileExists(deletedPath)) {
      await rename(deletedPath, filePath).catch(() => {});
      await initSources().catch(() => {});
    }
    if (error instanceof PluginManagementError) throw error;
    throw new PluginManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}
