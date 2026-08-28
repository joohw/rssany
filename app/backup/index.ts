import { exportAllItems, importAllItems, type DbItem, type ImportItemsMode } from "../db/index.js";
import { getAllSources, saveSourcesFile } from "../scraper/subscription/index.js";
import type { SourceType, SubscriptionSource } from "../scraper/subscription/types.js";
import { canonicalHttpSourceRef } from "../utils/httpSourceRef.js";
import { VALID_INTERVALS, type RefreshInterval } from "../utils/refreshInterval.js";

export const SOURCES_BACKUP_FORMAT = "rssany-sources-backup" as const;
export const ITEMS_BACKUP_FORMAT = "rssany-items-backup" as const;
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
  const cron = optionalString(value.cron, `sources[${index}].cron`);
  const proxy = optionalString(value.proxy, `sources[${index}].proxy`);
  return {
    ref,
    ...(type ? { type } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(refresh ? { refresh } : {}),
    ...(cron !== undefined ? { cron } : {}),
    ...(proxy !== undefined ? { proxy } : {}),
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
