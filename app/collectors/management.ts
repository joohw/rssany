// 采集器管理：运行时采集器均位于 USER_COLLECTORS_DIR，支持读取、修改和删除。

import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { USER_COLLECTORS_DIR } from "../config/paths.js";
import { initCollectors, registeredCollectors } from "../scraper/sources/index.js";
import { getCollectorSites } from "../scraper/sources/web/index.js";
import { getCollectorFilePath } from "./loader.js";

export type CollectorScope = "user";

export interface CollectorSummary {
  kind: "site" | "source";
  id: string;
  name: string;
  listUrlPattern: string;
  hasAuth: boolean;
  scope: CollectorScope;
  canDelete: boolean;
}

export interface CollectorFile {
  id: string;
  fileName: string;
  filePath: string;
  scope: CollectorScope;
  canDelete: boolean;
  content: string;
}

export class CollectorManagementError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 | 500 = 400) {
    super(message);
    this.name = "CollectorManagementError";
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

function isValidCollectorId(id: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(id) && id !== "generic" && id !== "new";
}

function isInside(root: string, filePath: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedFile = resolve(filePath);
  return normalizedFile.startsWith(normalizedRoot + sep);
}

function collectorScope(filePath: string): CollectorScope | undefined {
  if (isInside(USER_COLLECTORS_DIR, filePath)) return "user";
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

function requireCollectorId(rawId: string): string {
  const id = rawId.trim();
  if (!isValidCollectorId(id)) {
    throw new CollectorManagementError(
      "id 须为字母或下划线开头，仅含字母数字、下划线、连字符；不能为 generic 或 new",
      400,
    );
  }
  return id;
}

export function listManagedCollectors(): CollectorSummary[] {
  const sites = getCollectorSites().map<CollectorSummary | null>((site) => {
    const filePath = getCollectorFilePath(site.id);
    const scope = filePath ? collectorScope(filePath) : undefined;
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
  }).filter((collector): collector is CollectorSummary => collector != null);
  const siteIds = new Set(sites.map((collector) => collector.id));
  const sources = registeredCollectors
    .filter((source) => source.id !== "generic" && !siteIds.has(source.id))
    .map<CollectorSummary | null>((source) => {
      const filePath = getCollectorFilePath(source.id);
      const scope = filePath ? collectorScope(filePath) : undefined;
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
    .filter((collector): collector is CollectorSummary => collector != null);
  return [...sites, ...sources];
}

export async function readManagedCollector(rawId: string): Promise<CollectorFile> {
  const id = requireCollectorId(rawId);
  const filePath = getCollectorFilePath(id);
  if (!filePath) throw new CollectorManagementError("未找到该采集器或无可读取文件", 404);
  const scope = collectorScope(filePath);
  if (!scope) throw new CollectorManagementError("采集器路径不允许", 403);
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
    throw new CollectorManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function writeManagedCollector(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean } = {},
): Promise<CollectorFile> {
  return enqueueMutation(() => writeManagedCollectorUnlocked(rawId, content, options));
}

async function writeManagedCollectorUnlocked(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean },
): Promise<CollectorFile> {
  const id = requireCollectorId(rawId);
  if (typeof content !== "string") throw new CollectorManagementError("需要 content 字符串", 400);
  if (Buffer.byteLength(content, "utf-8") > 2 * 1024 * 1024) {
    throw new CollectorManagementError("采集器文件不能超过 2 MiB", 400);
  }
  await mkdir(USER_COLLECTORS_DIR, { recursive: true });

  const activePath = getCollectorFilePath(id);
  const targetPath = activePath && collectorScope(activePath) === "user"
    ? activePath
    : join(USER_COLLECTORS_DIR, `${id}.rssany.js`);
  if (!isInside(USER_COLLECTORS_DIR, targetPath)) throw new CollectorManagementError("采集器路径不允许", 403);
  if (options.mustNotExist && (activePath || await fileExists(targetPath))) {
    throw new CollectorManagementError("该 id 已存在", 409);
  }

  const existed = await fileExists(targetPath);
  const previous = existed ? await readFile(targetPath, "utf-8") : undefined;
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, targetPath);
    await initCollectors();
    const reloadedPath = getCollectorFilePath(id);
    if (!reloadedPath || resolve(reloadedPath) !== resolve(targetPath)) {
      throw new CollectorManagementError(
        `采集器 ${id} 加载失败，文件必须导出相同 id、有效的 SiteCollector/Collector 字段和 fetchItems()`,
        422,
      );
    }
    return readManagedCollector(id);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (previous !== undefined) {
      await writeFile(targetPath, previous, "utf-8").catch(() => {});
    } else if (!existed) {
      await rm(targetPath, { force: true }).catch(() => {});
    }
    await initCollectors().catch(() => {});
    if (error instanceof CollectorManagementError) throw error;
    throw new CollectorManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function deleteManagedCollector(rawId: string): Promise<{
  ok: true;
  id: string;
  deletedFile: string;
  activeScopeAfterDelete: CollectorScope | null;
}> {
  return enqueueMutation(() => deleteManagedCollectorUnlocked(rawId));
}

async function deleteManagedCollectorUnlocked(rawId: string): Promise<{
  ok: true;
  id: string;
  deletedFile: string;
  activeScopeAfterDelete: CollectorScope | null;
}> {
  const id = requireCollectorId(rawId);
  const filePath = getCollectorFilePath(id);
  if (!filePath) throw new CollectorManagementError("未找到该采集器", 404);
  if (collectorScope(filePath) !== "user") {
    throw new CollectorManagementError("采集器路径不允许", 403);
  }
  const deletedPath = `${filePath}.${process.pid}.${Date.now()}.deleted`;
  try {
    await rename(filePath, deletedPath);
    await initCollectors();
    const nextPath = getCollectorFilePath(id);
    await rm(deletedPath, { force: true }).catch(() => {});
    return {
      ok: true,
      id,
      deletedFile: basename(filePath),
      activeScopeAfterDelete: nextPath ? collectorScope(nextPath) ?? null : null,
    };
  } catch (error) {
    if (await fileExists(deletedPath)) {
      await rename(deletedPath, filePath).catch(() => {});
      await initCollectors().catch(() => {});
    }
    if (error instanceof CollectorManagementError) throw error;
    throw new CollectorManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}
