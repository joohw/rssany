import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { USER_PIPELINES_DIR } from "../config/paths.js";
import { loadPipelineConfig, savePipelineConfig } from "./config.js";
import {
  getPipelineDefinition,
  getPipelineFilePath,
  isBuiltinPipeline,
  reloadUserPipelines,
} from "./index.js";
import { loadPipelineModuleFromFile } from "./loader.js";

export interface ManagedPipelineFile {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  filePath: string;
  scope: "user";
  canDelete: true;
  content: string;
}

export class PipelineManagementError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 | 500 = 400) {
    super(message);
    this.name = "PipelineManagementError";
  }
}

let mutationQueue: Promise<void> = Promise.resolve();

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function requirePipelineId(rawId: string): string {
  const id = rawId.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(id)) {
    throw new PipelineManagementError("id 须为字母或下划线开头，且仅含字母、数字、下划线和连字符", 400);
  }
  return id;
}

function isInsideUserPipelines(filePath: string): boolean {
  const root = resolve(USER_PIPELINES_DIR);
  return resolve(filePath).startsWith(root + sep);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readManagedPipeline(rawId: string): Promise<ManagedPipelineFile> {
  const id = requirePipelineId(rawId);
  await reloadUserPipelines();
  const filePath = getPipelineFilePath(id);
  const definition = getPipelineDefinition(id);
  if (!filePath || !definition) throw new PipelineManagementError("未找到该用户 Pipeline", 404);
  if (!isInsideUserPipelines(filePath)) throw new PipelineManagementError("Pipeline 路径不允许", 403);
  return {
    id,
    name: definition.name,
    description: definition.description,
    fileName: basename(filePath),
    filePath,
    scope: "user",
    canDelete: true,
    content: await readFile(filePath, "utf-8"),
  };
}

export function writeManagedPipeline(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean } = {},
): Promise<ManagedPipelineFile> {
  return enqueueMutation(() => writeManagedPipelineUnlocked(rawId, content, options));
}

async function writeManagedPipelineUnlocked(
  rawId: string,
  content: string,
  options: { mustNotExist?: boolean },
): Promise<ManagedPipelineFile> {
  const id = requirePipelineId(rawId);
  if (isBuiltinPipeline(id)) throw new PipelineManagementError("不能覆盖内置 Pipeline", 409);
  if (Buffer.byteLength(content, "utf-8") > 2 * 1024 * 1024) {
    throw new PipelineManagementError("Pipeline 文件不能超过 2 MiB", 400);
  }
  await mkdir(USER_PIPELINES_DIR, { recursive: true });
  await reloadUserPipelines();

  const activePath = getPipelineFilePath(id);
  const targetPath = activePath ?? join(USER_PIPELINES_DIR, `${id}.rssany.js`);
  if (!isInsideUserPipelines(targetPath)) throw new PipelineManagementError("Pipeline 路径不允许", 403);
  if (options.mustNotExist && (activePath || await fileExists(targetPath))) {
    throw new PipelineManagementError("该 id 已存在", 409);
  }

  const existed = await fileExists(targetPath);
  const previous = existed ? await readFile(targetPath, "utf-8") : undefined;
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, targetPath);
    await reloadUserPipelines();
    const loadedPath = getPipelineFilePath(id);
    const loaded = getPipelineDefinition(id);
    if (!loadedPath || resolve(loadedPath) !== resolve(targetPath) || !loaded || loaded.id !== id) {
      throw new PipelineManagementError(`Pipeline ${id} 加载失败；默认导出的 id 必须一致并实现 process()`, 422);
    }
    return readManagedPipeline(id);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (previous !== undefined) await writeFile(targetPath, previous, "utf-8").catch(() => {});
    else if (!existed) await rm(targetPath, { force: true }).catch(() => {});
    await reloadUserPipelines().catch(() => {});
    if (error instanceof PipelineManagementError) throw error;
    throw new PipelineManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function validatePipelineContent(rawId: string, content: string): Promise<{ ok: true; id: string; name: string; description?: string }> {
  const id = requirePipelineId(rawId);
  if (isBuiltinPipeline(id)) throw new PipelineManagementError("不能覆盖内置 Pipeline", 409);
  if (Buffer.byteLength(content, "utf-8") > 2 * 1024 * 1024) {
    throw new PipelineManagementError("Pipeline 文件不能超过 2 MiB", 400);
  }
  await mkdir(USER_PIPELINES_DIR, { recursive: true });
  const tempPath = join(USER_PIPELINES_DIR, `.validate-${id}-${process.pid}-${Date.now()}.mjs`);
  try {
    await writeFile(tempPath, content, "utf-8");
    const definition = await loadPipelineModuleFromFile(tempPath);
    if (definition.id !== id) throw new PipelineManagementError("默认导出的 id 与请求 id 不一致", 422);
    return { ok: true, id, name: definition.name, description: definition.description };
  } catch (error) {
    if (error instanceof PipelineManagementError) throw error;
    throw new PipelineManagementError(error instanceof Error ? error.message : String(error), 422);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export function deleteManagedPipeline(rawId: string): Promise<{ ok: true; id: string; deletedFile: string }> {
  return enqueueMutation(() => deleteManagedPipelineUnlocked(rawId));
}

async function deleteManagedPipelineUnlocked(rawId: string): Promise<{ ok: true; id: string; deletedFile: string }> {
  const id = requirePipelineId(rawId);
  await reloadUserPipelines();
  const filePath = getPipelineFilePath(id);
  if (!filePath) throw new PipelineManagementError("未找到该用户 Pipeline", 404);
  if (!isInsideUserPipelines(filePath)) throw new PipelineManagementError("不能删除内置 Pipeline", 403);
  const deletedPath = `${filePath}.${process.pid}.${Date.now()}.deleted`;
  try {
    await rename(filePath, deletedPath);
    await reloadUserPipelines();
    const config = await loadPipelineConfig();
    await savePipelineConfig({ steps: config.steps.filter((step) => step.id !== id) });
    await rm(deletedPath, { force: true }).catch(() => {});
    return { ok: true, id, deletedFile: basename(filePath) };
  } catch (error) {
    if (await fileExists(deletedPath)) await rename(deletedPath, filePath).catch(() => {});
    await reloadUserPipelines().catch(() => {});
    if (error instanceof PipelineManagementError) throw error;
    throw new PipelineManagementError(error instanceof Error ? error.message : String(error), 500);
  }
}
