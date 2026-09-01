import { exportAllItems, importAllItems, type DbItem, type ImportItemsMode } from "../db/index.js";
import { getAllSources, saveSourcesFile } from "../scraper/subscription/index.js";
import { normalizeSourceGroup, normalizeSourceProxyMode, type SourceType, type SubscriptionSource } from "../scraper/subscription/types.js";
import { canonicalHttpSourceRef } from "../utils/httpSourceRef.js";
import { VALID_INTERVALS, type RefreshInterval } from "../utils/refreshInterval.js";
import {
  deleteManagedCollector,
  listManagedCollectors,
  readManagedCollector,
  writeManagedCollector,
} from "../collectors/management.js";
import { initCollectors } from "../scraper/sources/index.js";
import { loadPipelineConfig, savePipelineConfig, type PipelineStepConfig } from "../pipeline/config.js";
import { listPipelineSummaries, reloadUserPipelines } from "../pipeline/index.js";
import {
  deleteManagedPipeline,
  readManagedPipeline,
  writeManagedPipeline,
} from "../pipeline/management.js";

export const SOURCES_BACKUP_FORMAT = "rssany-sources-backup" as const;
export const ITEMS_BACKUP_FORMAT = "rssany-items-backup" as const;
export const PLUGINS_BACKUP_FORMAT = "rssany-plugins-backup" as const;
export const PIPELINES_BACKUP_FORMAT = "rssany-pipelines-backup" as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;

export interface SourcesBackup {
  format: typeof SOURCES_BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  sources: SubscriptionSource[];
}

export interface ItemsBackup {
  format: typeof ITEMS_BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  items: DbItem[];
}

export interface ScriptBackupEntry {
  id: string;
  fileName: string;
  content: string;
}

export interface PluginsBackup {
  format: typeof PLUGINS_BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  plugins: ScriptBackupEntry[];
}

export interface PipelinesBackup {
  format: typeof PIPELINES_BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  pipelines: ScriptBackupEntry[];
  steps: PipelineStepConfig[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串或 null`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空字符串`);
  return value;
}

function parseSource(value: unknown, index: number): SubscriptionSource {
  if (!isRecord(value)) throw new Error(`sources[${index}] 必须是对象`);
  const ref = canonicalHttpSourceRef(requiredString(value.ref, `sources[${index}].ref`));
  const typeValue = optionalString(value.type, `sources[${index}].type`);
  const type: SourceType | undefined = typeValue === undefined
    ? undefined
    : typeValue === "web" || typeValue === "rss" || typeValue === "email"
      ? typeValue
      : (() => { throw new Error(`sources[${index}].type 无效`); })();
  const refreshValue = optionalString(value.refresh, `sources[${index}].refresh`);
  const refresh: RefreshInterval | undefined = refreshValue === undefined
    ? undefined
    : VALID_INTERVALS.includes(refreshValue as RefreshInterval)
      ? refreshValue as RefreshInterval
      : (() => { throw new Error(`sources[${index}].refresh 无效`); })();
  const weight = value.weight;
  if (weight !== undefined && (typeof weight !== "number" || !Number.isFinite(weight))) {
    throw new Error(`sources[${index}].weight 必须是有限数字`);
  }
  const label = optionalString(value.label, `sources[${index}].label`);
  const description = optionalString(value.description, `sources[${index}].description`);
  if (value.group !== undefined && (!Array.isArray(value.group) || value.group.some((segment) => typeof segment !== "string"))) {
    throw new Error(`sources[${index}].group 必须是字符串数组`);
  }
  const group = normalizeSourceGroup(value.group);
  const cron = optionalString(value.cron, `sources[${index}].cron`);
  const proxy = optionalString(value.proxy, `sources[${index}].proxy`);
  const proxyMode = normalizeSourceProxyMode(value.proxyMode, proxy);
  if (value.proxyMode !== undefined && value.proxyMode !== "none" && value.proxyMode !== "default" && value.proxyMode !== "custom") {
    throw new Error(`sources[${index}].proxyMode 无效`);
  }
  return {
    ref,
    ...(type ? { type } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    group,
    ...(refresh ? { refresh } : {}),
    ...(cron !== undefined ? { cron } : {}),
    proxyMode,
    ...(proxyMode === "custom" && proxy !== undefined ? { proxy } : {}),
    ...(typeof weight === "number" ? { weight } : {}),
  };
}

function parseStringArray(value: unknown, field: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串数组或 null`);
  }
  return value as string[];
}

function parseTranslations(value: unknown, field: string): DbItem["translations"] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error(`${field} 必须是对象或 null`);
  for (const [language, fields] of Object.entries(value)) {
    if (!isRecord(fields)) throw new Error(`${field}.${language} 必须是对象`);
    for (const key of ["title", "summary", "content"] as const) {
      if (fields[key] !== undefined && typeof fields[key] !== "string") {
        throw new Error(`${field}.${language}.${key} 必须是字符串`);
      }
    }
  }
  return value as DbItem["translations"];
}

function parseExtra(value: unknown, field: string): DbItem["extra"] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error(`${field} 必须是对象或 null`);
  return value;
}

function parseItem(value: unknown, index: number): DbItem {
  if (!isRecord(value)) throw new Error(`items[${index}] 必须是对象`);
  return {
    id: requiredString(value.id, `items[${index}].id`),
    url: requiredString(value.url, `items[${index}].url`),
    source_url: canonicalHttpSourceRef(requiredString(value.source_url, `items[${index}].source_url`)),
    title: nullableString(value.title, `items[${index}].title`),
    author: parseStringArray(value.author, `items[${index}].author`),
    summary: nullableString(value.summary, `items[${index}].summary`),
    content: nullableString(value.content, `items[${index}].content`),
    image_url: nullableString(value.image_url, `items[${index}].image_url`),
    tags: parseStringArray(value.tags, `items[${index}].tags`),
    translations: parseTranslations(value.translations, `items[${index}].translations`),
    extra: parseExtra(value.extra, `items[${index}].extra`),
    pub_date: nullableString(value.pub_date, `items[${index}].pub_date`),
    fetched_at: requiredString(value.fetched_at, `items[${index}].fetched_at`),
    pushed_at: nullableString(value.pushed_at, `items[${index}].pushed_at`),
  };
}

function assertBackupHeader(value: unknown, expectedFormat: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("备份文件必须是 JSON 对象");
  if (value.format !== expectedFormat) throw new Error("备份文件类型不匹配");
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支持的备份版本：${String(value.schemaVersion)}`);
  }
  requiredString(value.exportedAt, "exportedAt");
  return value;
}

export function parseSourcesBackup(value: unknown): SourcesBackup {
  const record = assertBackupHeader(value, SOURCES_BACKUP_FORMAT);
  if (!Array.isArray(record.sources)) throw new Error("信源备份缺少 sources 数组");
  const byRef = new Map<string, SubscriptionSource>();
  record.sources.map(parseSource).forEach((source) => byRef.set(source.ref, source));
  return {
    format: SOURCES_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt as string,
    sources: [...byRef.values()],
  };
}

export function parseItemsBackup(value: unknown): ItemsBackup {
  const record = assertBackupHeader(value, ITEMS_BACKUP_FORMAT);
  if (!Array.isArray(record.items)) throw new Error("条目备份缺少 items 数组");
  const items = record.items.map(parseItem);
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`备份中存在重复条目 id：${item.id}`);
    if (urls.has(item.url)) throw new Error(`备份中存在重复条目 url：${item.url}`);
    ids.add(item.id);
    urls.add(item.url);
  }
  return {
    format: ITEMS_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt as string,
    items,
  };
}

function parseScriptEntries(value: unknown, field: "plugins" | "pipelines"): ScriptBackupEntry[] {
  if (!Array.isArray(value)) throw new Error(`${field} 备份缺少 ${field} 数组`);
  const entries = value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${field}[${index}] 必须是对象`);
    const id = requiredString(entry.id, `${field}[${index}].id`).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error(`${field}[${index}].id 无效`);
    const fileName = requiredString(entry.fileName, `${field}[${index}].fileName`);
    const allowedNames = field === "plugins"
      ? [`${id}.rssany.js`, `${id}.rssany.ts`]
      : [`${id}.rssany.js`];
    if (!allowedNames.includes(fileName)) throw new Error(`${field}[${index}].fileName 与 id 或扩展名不匹配`);
    const content = requiredString(entry.content, `${field}[${index}].content`);
    if (Buffer.byteLength(content, "utf-8") > 2 * 1024 * 1024) throw new Error(`${field}[${index}] 文件不能超过 2 MiB`);
    return { id, fileName, content };
  });
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`${field} 备份中存在重复 id：${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
}

function parsePipelineSteps(value: unknown): PipelineStepConfig[] {
  if (!Array.isArray(value)) throw new Error("Pipeline 备份缺少 steps 数组");
  const steps: PipelineStepConfig[] = [];
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`steps[${index}] 必须是对象`);
    const id = requiredString(entry.id, `steps[${index}].id`).trim();
    if (ids.has(id)) throw new Error(`steps 中存在重复 id：${id}`);
    ids.add(id);
    steps.push({ id });
  });
  return steps;
}

export function parsePluginsBackup(value: unknown): PluginsBackup {
  const record = assertBackupHeader(value, PLUGINS_BACKUP_FORMAT);
  return {
    format: PLUGINS_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt as string,
    plugins: parseScriptEntries(record.plugins, "plugins"),
  };
}

export function parsePipelinesBackup(value: unknown): PipelinesBackup {
  const record = assertBackupHeader(value, PIPELINES_BACKUP_FORMAT);
  return {
    format: PIPELINES_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt as string,
    pipelines: parseScriptEntries(record.pipelines, "pipelines"),
    steps: parsePipelineSteps(record.steps),
  };
}

export async function createSourcesBackup(): Promise<SourcesBackup> {
  return {
    format: SOURCES_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sources: await getAllSources(),
  };
}

export async function createItemsBackup(): Promise<ItemsBackup> {
  return {
    format: ITEMS_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    items: await exportAllItems(),
  };
}

export async function createPluginsBackup(): Promise<PluginsBackup> {
  await initCollectors();
  const plugins = await Promise.all(listManagedCollectors().map(async ({ id }) => {
    const file = await readManagedCollector(id);
    return { id: file.id, fileName: file.fileName, content: file.content };
  }));
  return {
    format: PLUGINS_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    plugins,
  };
}

export async function createPipelinesBackup(): Promise<PipelinesBackup> {
  await reloadUserPipelines();
  const userPipelines = (await listPipelineSummaries()).filter((pipeline) => pipeline.scope === "user");
  const pipelines = await Promise.all(userPipelines.map(async ({ id }) => {
    const file = await readManagedPipeline(id);
    return { id: file.id, fileName: file.fileName, content: file.content };
  }));
  return {
    format: PIPELINES_BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pipelines,
    steps: (await loadPipelineConfig()).steps,
  };
}

async function restorePluginsSnapshot(snapshot: ScriptBackupEntry[]): Promise<void> {
  await initCollectors();
  for (const { id } of listManagedCollectors()) await deleteManagedCollector(id);
  for (const plugin of snapshot) {
    await writeManagedCollector(plugin.id, plugin.content, { mustNotExist: true, fileName: plugin.fileName });
  }
}

export async function importPluginsBackup(
  value: unknown,
  mode: ImportItemsMode,
): Promise<{ mode: ImportItemsMode; plugins: number }> {
  const backup = parsePluginsBackup(value);
  const snapshot = (await createPluginsBackup()).plugins;
  try {
    const importedIds = new Set(backup.plugins.map((plugin) => plugin.id));
    for (const plugin of backup.plugins) {
      const current = listManagedCollectors().find((collector) => collector.id === plugin.id);
      if (current) {
        const currentFile = await readManagedCollector(plugin.id);
        if (currentFile.fileName !== plugin.fileName) await deleteManagedCollector(plugin.id);
      }
      await writeManagedCollector(plugin.id, plugin.content, { fileName: plugin.fileName });
    }
    if (mode === "replace") {
      await initCollectors();
      for (const { id } of listManagedCollectors()) {
        if (!importedIds.has(id)) await deleteManagedCollector(id);
      }
    }
    await initCollectors();
    return { mode, plugins: listManagedCollectors().length };
  } catch (error) {
    await restorePluginsSnapshot(snapshot);
    throw error;
  }
}

async function restorePipelinesSnapshot(snapshot: ScriptBackupEntry[], steps: PipelineStepConfig[]): Promise<void> {
  await reloadUserPipelines();
  const userIds = (await listPipelineSummaries()).filter((pipeline) => pipeline.scope === "user").map((pipeline) => pipeline.id);
  for (const id of userIds) await deleteManagedPipeline(id);
  for (const pipeline of snapshot) await writeManagedPipeline(pipeline.id, pipeline.content, { mustNotExist: true });
  await savePipelineConfig({ steps });
  await reloadUserPipelines();
}

export async function importPipelinesBackup(
  value: unknown,
  mode: ImportItemsMode,
): Promise<{ mode: ImportItemsMode; pipelines: number; steps: number }> {
  const backup = parsePipelinesBackup(value);
  const current = await createPipelinesBackup();
  try {
    const importedIds = new Set(backup.pipelines.map((pipeline) => pipeline.id));
    for (const pipeline of backup.pipelines) await writeManagedPipeline(pipeline.id, pipeline.content);
    if (mode === "replace") {
      await reloadUserPipelines();
      const userIds = (await listPipelineSummaries()).filter((pipeline) => pipeline.scope === "user").map((pipeline) => pipeline.id);
      for (const id of userIds) if (!importedIds.has(id)) await deleteManagedPipeline(id);
    }
    const availableIds = new Set((await listPipelineSummaries()).map((pipeline) => pipeline.id));
    const steps = mode === "replace"
      ? backup.steps
      : [...current.steps, ...backup.steps.filter((step) => !current.steps.some((existing) => existing.id === step.id))];
    const validSteps = steps.filter((step) => availableIds.has(step.id));
    await savePipelineConfig({ steps: validSteps });
    await reloadUserPipelines();
    return {
      mode,
      pipelines: (await listPipelineSummaries()).filter((pipeline) => pipeline.scope === "user").length,
      steps: validSteps.length,
    };
  } catch (error) {
    await restorePipelinesSnapshot(current.pipelines, current.steps);
    throw error;
  }
}

export async function importSourcesBackup(
  value: unknown,
  mode: ImportItemsMode,
): Promise<{ mode: ImportItemsMode; sources: number }> {
  const backup = parseSourcesBackup(value);
  let sources = backup.sources;
  if (mode === "merge") {
    const merged = new Map((await getAllSources()).map((source) => [canonicalHttpSourceRef(source.ref), source]));
    for (const source of backup.sources) merged.set(source.ref, source);
    sources = [...merged.values()];
  }
  await saveSourcesFile(sources);
  return { mode, sources: sources.length };
}

export async function importItemsBackup(
  value: unknown,
  mode: ImportItemsMode,
): Promise<{ mode: ImportItemsMode; items: number; insertedItems: number; updatedItems: number }> {
  const backup = parseItemsBackup(value);
  const result = await importAllItems(backup.items, mode);
  return {
    mode,
    items: result.imported,
    insertedItems: result.inserted,
    updatedItems: result.updated,
  };
}
