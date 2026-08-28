import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { USER_PIPELINES_DIR } from "../config/paths.js";
import { logger } from "../core/logger/index.js";
import type { PipelineDefinition } from "./types.js";

const PIPELINE_EXTENSION = ".rssany.js";

export interface LoadedUserPipeline {
  definition: PipelineDefinition;
  filePath: string;
}

export function isValidPipelineDefinition(value: unknown): value is PipelineDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(candidate.id) &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    (candidate.description === undefined || typeof candidate.description === "string") &&
    typeof candidate.process === "function"
  );
}

export async function loadPipelineModuleFromFile(filePath: string): Promise<PipelineDefinition> {
  const moduleUrl = pathToFileURL(filePath);
  const contentHash = createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 16);
  moduleUrl.searchParams.set("v", contentHash);
  const imported = await import(moduleUrl.href);
  const definition = imported.default ?? imported;
  if (!isValidPipelineDefinition(definition)) {
    throw new Error("Pipeline 必须默认导出 { id, name, description?, process(item, context) }");
  }
  return definition;
}

export async function loadUserPipelines(): Promise<LoadedUserPipeline[]> {
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    const raw = await readdir(USER_PIPELINES_DIR, { withFileTypes: true, encoding: "utf-8" });
    entries = raw as Array<{ name: string; isFile: () => boolean }>;
  } catch {
    return [];
  }

  const loaded: LoadedUserPipeline[] = [];
  for (const entry of entries) {
    const fileName = String(entry.name);
    if (!entry.isFile() || !fileName.endsWith(PIPELINE_EXTENSION)) continue;
    const filePath = join(USER_PIPELINES_DIR, fileName);
    try {
      loaded.push({ definition: await loadPipelineModuleFromFile(filePath), filePath });
    } catch (error) {
      logger.warn("pipeline", "用户 Pipeline 加载失败", {
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return loaded;
}
