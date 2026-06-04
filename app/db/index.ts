// SQLite 主库：建表 schema、FTS、FeedItem CRUD 与运行日志库
// 使用 Node.js 20+ 内置 node:sqlite 模块 (DatabaseSync - 同步API)

import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync, openSync, closeSync, writeSync, unlinkSync, readFileSync } from "node:fs";
import type { FeedItem } from "../types/feedItem.js";
import { normalizeAuthor, pubDateToIsoOrNull } from "../types/feedItem.js";
import { canonicalHttpSourceRef } from "../utils/httpSourceRef.js";
import type { LogEntry } from "../core/logger/types.js";
import { DATA_DIR, TAGS_CONFIG_PATH } from "../config/paths.js";

/** 主库日志模式：默认 WAL；环境变量 RSSANY_DB_JOURNAL=delete 时使用 DELETE */
const MAIN_DB_JOURNAL = (process.env.RSSANY_DB_JOURNAL ?? "wal").toLowerCase() === "delete" ? "DELETE" : "WAL";

let _db: DatabaseSync | null = null;

/** 单写者锁：串行化 updateItemContent/upsertItems 等写库 */
let _writeLock: Promise<void> = Promise.resolve();

/** 单进程锁文件路径：与 rssany.db 同目录，内容为 PID */
const MAIN_DB_LOCK_PATH = join(DATA_DIR, "rssany.db.lock");

/** 将损坏类错误写到 stderr，便于排查 */
function logCorruptDiagnostic(operation: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const lines = [
    "[rssany db] 数据库可能损坏或并发冲突",
    `  操作: ${operation}`,
    `  错误: ${msg}`,
    "  常见原因:",
    "    1. 多进程同时打开同一库（例如 tsx --watch 与另一实例同时写）",
    "    2. 异常退出后 WAL 未正常 checkpoint",
    "    3. 磁盘/杀毒/同步盘导致文件不完整",
    "  建议:",
    "    - 避免多实例同时写库；开发时慎用 --watch 与后台任务并行",
    "    - 可尝试 RSSANY_DB_JOURNAL=delete 使用 DELETE 模式降低多文件依赖",
    "    - 备份后删除 .rssany/data/rssany.db 及同目录 -wal、-shm、rssany.db.lock 再启动",
  ];
  process.stderr.write(lines.join("\n") + "\n");
}

/** 独占创建锁文件 */
function acquireDbLock(dbDir: string): void {
  const lockPath = join(dbDir, "rssany.db.lock");
  const pid = process.pid;
  const tryCreate = (): void => {
    try {
      const fd = openSync(lockPath, "wx");
      writeSync(fd, String(pid), 0, "utf8");
      closeSync(fd);
      return;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") throw e;
    }
    if (!existsSync(lockPath)) {
      tryCreate();
      return;
    }
    let oldPid: number | null = null;
    try {
      const buf = readFileSync(lockPath, "utf8");
      const n = parseInt(buf.trim(), 10);
      if (!Number.isNaN(n)) oldPid = n;
    } catch {
      /* 读锁文件失败则重试创建 */
    }
    if (oldPid !== null && oldPid !== pid) {
      const stillRunning = ((): boolean => {
        try {
          process.kill(oldPid!, 0);
          return true;
        } catch {
          return false;
        }
      })();
      if (stillRunning) {
        throw new Error(
          `数据库已被其他进程占用（PID ${oldPid}）。请勿多开实例；若确认无其他进程，可删除 ${lockPath} 后重试（常见于 tsx --watch 未退出）`,
        );
      }
    }
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    tryCreate();
  };
  tryCreate();
}

/** 进程退出时删除锁文件 */
function releaseDbLock(): void {
  if (!existsSync(MAIN_DB_LOCK_PATH)) return;
  try {
    unlinkSync(MAIN_DB_LOCK_PATH);
  } catch {
    /* ignore */
  }
}

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _writeLock;
  let resolveOut!: (v: T) => void;
  let rejectOut!: (e: unknown) => void;
  const out = new Promise<T>((res, rej) => {
    resolveOut = res;
    rejectOut = rej;
  });
  _writeLock = prev
    .then(() => fn())
    .then(
      (v) => {
        resolveOut(v);
      },
      (e: unknown) => {
        if (isCorruptError(e)) {
          logCorruptDiagnostic("withWriteLock 内 updateItemContent/upsertItems 等", e);
        }
        rejectOut(e);
        throw e;
      },
    );
  return out;
}

/** 仅英文「日期当标题」的粗判 */
const DATE_ONLY_TITLE_RE =
  /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s\d,./-]*(?:st|nd|rd|th)?[\s\d,./-]*$/i;

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function isDateOnlyTitle(title: string | null | undefined): boolean {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  return DATE_ONLY_TITLE_RE.test(normalized);
}

function toMs(input: string | null | undefined): number | null {
  if (!input) return null;
  const ms = Date.parse(input);
  return Number.isNaN(ms) ? null : ms;
}

/** 将 DB 中 author 列解析为 string[] */
export function parseAuthorFromDb(raw: string | null | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p)) return p.filter((s) => typeof s === "string").map((s) => String(s).trim()).filter(Boolean);
    return [String(p).trim()];
  } catch {
    return [raw.trim()];
  }
}

/** 将原始行转为 DbItem */
function toDbItem(row: Record<string, unknown>): DbItem {
  const author = parseAuthorFromDb(row.author as string) ?? null;
  const parseJsonArr = (v: unknown): string[] | null => {
    try {
      return v ? (JSON.parse(v as string) as string[]) : null;
    } catch {
      return null;
    }
  };
  const tags = parseJsonArr(row.tags);
  let translations: Record<string, { title?: string; summary?: string; content?: string }> | null = null;
  try {
    if (row.translations && typeof row.translations === "string") {
      const p = JSON.parse(row.translations) as unknown;
      if (p && typeof p === "object") translations = p as Record<string, { title?: string; summary?: string; content?: string }>;
    }
  } catch {
    /* ignore */
  }
  return { ...row, author, tags, translations } as DbItem;
}

function mapRowsToDbItems(rows: Record<string, unknown>[]): DbItem[] {
  return rows.map(toDbItem);
}

/** 判断是否 SQLite 库损坏 */
function isCorruptError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("SQLITE_CORRUPT") || msg.includes("database disk image is malformed");
}

/** 获取主库连接 */
export async function getDb(): Promise<DatabaseSync> {
  if (_db) return _db;
  const dbPath = join(DATA_DIR, "rssany.db");
  await mkdir(DATA_DIR, { recursive: true });
  acquireDbLock(DATA_DIR);
  try {
    _db = new DatabaseSync(dbPath);
    _db.exec(`PRAGMA journal_mode = ${MAIN_DB_JOURNAL}`);
    _db.exec("PRAGMA synchronous = NORMAL");
    initSchema(_db);
    return _db;
  } catch (err: unknown) {
    releaseDbLock();
    if (_db) {
      try {
        _db.close();
      } catch {
        /* ignore */
      }
      _db = null;
    }
    if (isCorruptError(err)) {
      logCorruptDiagnostic("打开/初始化主库 (getDb)", err);
    }
    throw err;
  }
}

/** 执行 PRAGMA integrity_check */
export async function runIntegrityCheck(): Promise<string> {
  const db = await getDb();
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string } | undefined;
    return result?.integrity_check ?? "unknown";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `integrity_check 执行失败: ${msg}`;
  }
}

/** 运行日志库路径 */
const LOGS_DB_PATH = join(DATA_DIR, "logs.db");

let _logsDb: DatabaseSync | null = null;

function initLogsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       TEXT NOT NULL,
      category    TEXT NOT NULL,
      message     TEXT NOT NULL,
      payload     TEXT,
      source_url  TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_level_created ON logs(level, created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_source_created ON logs(source_url, created_at);
  `);
}

/** 获取运行日志库 */
export async function getLogsDb(): Promise<DatabaseSync> {
  if (_logsDb) return _logsDb;
  await mkdir(DATA_DIR, { recursive: true });
  _logsDb = new DatabaseSync(LOGS_DB_PATH);
  _logsDb.exec("PRAGMA journal_mode = WAL");
  _logsDb.exec("PRAGMA synchronous = NORMAL");
  initLogsSchema(_logsDb);
  return _logsDb;
}

/** 初始化主库 schema */
function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id          TEXT PRIMARY KEY,
      url         TEXT UNIQUE NOT NULL,
      source_url  TEXT NOT NULL,
      title       TEXT,
      author      TEXT,
      summary     TEXT,
      content     TEXT,
      image_url   TEXT,
      tags        TEXT,
      translations TEXT,
      pub_date    TEXT,
      fetched_at  TEXT NOT NULL,
      pushed_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_items_source    ON items(source_url);
    CREATE INDEX IF NOT EXISTS idx_items_fetched   ON items(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_items_pushed    ON items(pushed_at);
  `);

  db.exec(`
    CREATE VIEW IF NOT EXISTS items_fts_src AS
    SELECT rowid, title, summary, content,
      json_extract(translations, '$."zh-CN".title') AS title_zh,
      json_extract(translations, '$."zh-CN".summary') AS summary_zh,
      json_extract(translations, '$."zh-CN".content') AS content_zh
    FROM items;
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      title, summary, content, title_zh, summary_zh, content_zh,
      content='items_fts_src',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS items_fts_after_insert AFTER INSERT ON items
    BEGIN
      INSERT INTO items_fts(rowid, title, summary, content, title_zh, summary_zh, content_zh)
      VALUES (
        NEW.rowid, NEW.title, NEW.summary, NEW.content,
        json_extract(NEW.translations, '$."zh-CN".title'),
        json_extract(NEW.translations, '$."zh-CN".summary'),
        json_extract(NEW.translations, '$."zh-CN".content')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS items_fts_after_update AFTER UPDATE ON items
    BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, content, title_zh, summary_zh, content_zh)
      VALUES (
        'delete', OLD.rowid, OLD.title, OLD.summary, OLD.content,
        json_extract(OLD.translations, '$."zh-CN".title'),
        json_extract(OLD.translations, '$."zh-CN".summary'),
        json_extract(OLD.translations, '$."zh-CN".content')
      );
      INSERT INTO items_fts(rowid, title, summary, content, title_zh, summary_zh, content_zh)
      VALUES (
        NEW.rowid, NEW.title, NEW.summary, NEW.content,
        json_extract(NEW.translations, '$."zh-CN".title'),
        json_extract(NEW.translations, '$."zh-CN".summary'),
        json_extract(NEW.translations, '$."zh-CN".content')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS items_fts_after_delete AFTER DELETE ON items
    BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, content, title_zh, summary_zh, content_zh)
      VALUES (
        'delete', OLD.rowid, OLD.title, OLD.summary, OLD.content,
        json_extract(OLD.translations, '$."zh-CN".title'),
        json_extract(OLD.translations, '$."zh-CN".summary'),
        json_extract(OLD.translations, '$."zh-CN".content')
      );
    END;
  `);

  // 旧库迁移：若无 image_url 列则追加
  try {
    const cols = db.prepare("PRAGMA table_info(items)").all().map((r: Record<string, unknown>) => r.name as string);
    if (!cols.includes("image_url")) {
      db.exec("ALTER TABLE items ADD COLUMN image_url TEXT");
    }
  } catch {
    /* ignore */
  }

  migrateItemsSourceUrlIfNeeded(db);
}

/** 规范化 source_url */
function migrateItemsSourceUrlIfNeeded(db: DatabaseSync): void {
  const pragmaResult = db.exec("PRAGMA user_version") as unknown as { values?: unknown[][] } | undefined;
  const v = (pragmaResult?.values?.[0]?.[0] as number) ?? 0;
  if (v >= 2) return;
  const rows = db.prepare("SELECT rowid, source_url FROM items").all() as { rowid: number; source_url: string }[];
  const updateStmt = db.prepare("UPDATE items SET source_url = @next WHERE rowid = @rowid");
  db.exec("BEGIN TRANSACTION");
  try {
    for (const r of rows) {
      const next = canonicalHttpSourceRef(r.source_url);
      if (next !== r.source_url) {
        updateStmt.run({ next, rowid: r.rowid });
      }
    }
    db.exec("PRAGMA user_version = 2");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** 批量插入或忽略重复 */
export async function upsertItems(items: FeedItem[], sourceUrlOverride?: string): Promise<{ newCount: number; newIds: Set<string> }> {
  if (items.length === 0) return { newCount: 0, newIds: new Set() };
  const raw = (sourceUrlOverride ?? items[0].sourceRef)?.trim();
  if (!raw) {
    throw new Error("upsertItems: 每条 item 须有 sourceRef，或传入 sourceUrlOverride");
  }
  const sourceUrl = canonicalHttpSourceRef(raw);
  return withWriteLock(async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    let newCount = 0;
    const newIds = new Set<string>();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO items (id, url, source_url, title, author, summary, image_url, tags, pub_date, fetched_at)
      VALUES (@id, @url, @sourceUrl, @title, @author, @summary, @imageUrl, @tags, @pubDate, @fetchedAt)
    `);
    const selectExistingStmt = db.prepare(`
      SELECT title, author, summary, image_url, pub_date, fetched_at
      FROM items WHERE id = @id
    `);
    const updateStmt = db.prepare(`
      UPDATE items SET title = @title, author = @author, summary = @summary,
        image_url = @imageUrl, pub_date = @pubDate, fetched_at = @fetchedAt
      WHERE id = @id
    `);

    for (const item of items) {
      const nextTitle = normalizeText(item.title) || null;
      const nextSummary = normalizeText(item.summary) || null;
      const nextAuthorArr = normalizeAuthor(item.author);
      const nextAuthor = nextAuthorArr?.length ? JSON.stringify(nextAuthorArr) : null;
      const nextPubDate = pubDateToIsoOrNull(item.pubDate);
      const nextTags = item.tags?.length ? JSON.stringify(item.tags) : null;
      const rawImageUrl = item.imageUrl ?? item.coverImg ?? item.cover_img;
      const nextImageUrl = typeof rawImageUrl === "string" && rawImageUrl.trim() ? rawImageUrl.trim() : null;

      const info = insertStmt.run({
        id: item.guid,
        url: item.link,
        sourceUrl,
        title: nextTitle,
        author: nextAuthor,
        summary: nextSummary,
        imageUrl: nextImageUrl,
        tags: nextTags,
        pubDate: nextPubDate,
        fetchedAt: now,
      });
      newCount += Number(info.changes);
      if (info.changes > 0) {
        newIds.add(item.guid);
        continue;
      }

      const existing = selectExistingStmt.get({ id: item.guid }) as {
        title: string | null;
        author: string | null;
        summary: string | null;
        image_url: string | null;
        pub_date: string | null;
        fetched_at: string | null;
      } | undefined;
      if (!existing) continue;

      const shouldRepairTitle =
        !!nextTitle &&
        !isDateOnlyTitle(nextTitle) &&
        (isDateOnlyTitle(existing.title) || !normalizeText(existing.title));
      const existingSummaryText = normalizeText(existing.summary ?? "");
      const shouldClearDuplicatedSummary =
        nextSummary == null && !!nextTitle && existingSummaryText === nextTitle;
      const shouldRepairSummary =
        (!!nextSummary &&
          (existingSummaryText.length < nextSummary.length ||
            /!\[[^\]]*\]\([^)]*\)/.test(existingSummaryText))) ||
        shouldClearDuplicatedSummary;
      const shouldRepairImageUrl = !!nextImageUrl && !existing.image_url?.trim();
      const existingAuthorArr = parseAuthorFromDb(existing.author);
      const shouldRepairAuthor = !!nextAuthorArr?.length && !existingAuthorArr?.length;

      const existingPubDateMs = toMs(existing.pub_date);
      const existingFetchedAtMs = toMs(existing.fetched_at);
      const nextPubDateMs = toMs(nextPubDate);
      const existingPubDateLooksFallback =
        existingPubDateMs != null &&
        existingFetchedAtMs != null &&
        Math.abs(existingPubDateMs - existingFetchedAtMs) <= 5 * 60 * 1000;
      const shouldRepairPubDate =
        nextPubDateMs != null &&
        (existingPubDateMs == null ||
          (existingPubDateLooksFallback && nextPubDateMs < existingPubDateMs - 24 * 60 * 60 * 1000));

      if (!(shouldRepairTitle || shouldRepairSummary || shouldRepairImageUrl || shouldRepairAuthor || shouldRepairPubDate)) {
        continue;
      }

      updateStmt.run({
        id: item.guid,
        title: shouldRepairTitle ? nextTitle : existing.title,
        author: shouldRepairAuthor ? nextAuthor : (existing.author ?? null),
        summary: shouldClearDuplicatedSummary ? null : (shouldRepairSummary ? nextSummary : existing.summary),
        imageUrl: shouldRepairImageUrl ? nextImageUrl : (existing.image_url ?? null),
        pubDate: shouldRepairPubDate ? nextPubDate : existing.pub_date,
        fetchedAt: now,
      });
    }
    return { newCount, newIds };
  });
}

/** 查询已存在的 guid 集合 */
export async function getExistingIds(guids: string[]): Promise<Set<string>> {
  if (guids.length === 0) return new Set();
  const db = await getDb();
  const placeholders = guids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM items WHERE id IN (${placeholders})`).all(...guids) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** 按 guid 更新正文 */
export async function updateItemContent(item: FeedItem): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const rawImageUrl = item.imageUrl ?? item.coverImg ?? item.cover_img;
    const nextImageUrl = typeof rawImageUrl === "string" && rawImageUrl.trim() ? rawImageUrl.trim() : null;
    db.prepare(`
      UPDATE items SET
        content = COALESCE(content, @content),
        image_url = COALESCE(@imageUrl, image_url),
        author = COALESCE(@author, author),
        pub_date = COALESCE(@pubDate, pub_date),
        tags = @tags,
        translations = COALESCE(@translations, translations)
      WHERE id = @id
    `).run({
      id: item.guid,
      content: item.content ?? null,
      imageUrl: nextImageUrl,
      author: (() => {
        const arr = normalizeAuthor(item.author);
        return arr?.length ? JSON.stringify(arr) : null;
      })(),
      pubDate: pubDateToIsoOrNull(item.pubDate),
      tags: item.tags?.length ? JSON.stringify(item.tags) : null,
      translations: item.translations && Object.keys(item.translations).length > 0 ? JSON.stringify(item.translations) : null,
    });
  });
}

/** 按 id（guid）取单条 */
export async function getItemById(id: string): Promise<DbItem | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = @id").get({ id });
  if (!row) return null;
  const obj: Record<string, unknown | null> = {};
  for (const [k, v] of Object.entries(row)) obj[k] = v;
  return toDbItem(obj);
}

/** 单信源最近条目 */
export async function queryItemsBySource(sourceUrl: string, limit = 50, since?: Date): Promise<DbItem[]> {
  const key = canonicalHttpSourceRef(sourceUrl);
  if (!key) return [];
  const db = await getDb();
  const sinceClause = since ? "AND COALESCE(pub_date, fetched_at) >= @since" : "";
  const rows = db
    .prepare(`
      SELECT * FROM items
      WHERE source_url = @sourceUrl ${sinceClause}
      ORDER BY COALESCE(pub_date, fetched_at) DESC
      LIMIT ${limit}
    `)
    .all({ sourceUrl: key, since: since?.toISOString() ?? null });
  return mapRowsToDbItems(rows.map((r) => {
    const obj: Record<string, unknown | null> = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v;
    return obj;
  }));
}

/** 多条件查询 */
export async function queryItems(opts: {
  sourceUrl?: string;
  sourceUrls?: string[];
  author?: string;
  q?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}): Promise<{ items: DbItem[]; total: number }> {
  const db = await getDb();
  const { sourceUrl, sourceUrls, author, q, tags: tagsFilter, limit = 20, offset = 0, since, until } = opts;
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (sourceUrl) {
    const key = canonicalHttpSourceRef(sourceUrl);
    if (!key) return { items: [], total: 0 };
    conditions.push("i.source_url = @sourceUrl");
    params.sourceUrl = key;
  } else if (sourceUrls && sourceUrls.length > 0) {
    const expanded = [...new Set(sourceUrls.map((s) => canonicalHttpSourceRef(s)).filter(Boolean))];
    if (expanded.length === 0) return { items: [], total: 0 };
    const placeholders = expanded.map((_, i) => `@src${i}`).join(", ");
    conditions.push(`i.source_url IN (${placeholders})`);
    expanded.forEach((s, i) => { (params as Record<string, unknown>)[`src${i}`] = s; });
  }
  if (author && author.trim().length >= 2) {
    conditions.push("instr(i.author, @author) > 0");
    params.author = author.trim();
  }
  if (q) {
    conditions.push("i.rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH @q)");
    params.q = q;
  }
  if (tagsFilter && tagsFilter.length > 0) {
    const trimmed = tagsFilter
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    if (trimmed.length > 0) {
      const tagConds = trimmed.map((_, idx: number) => `LOWER(TRIM(json_each.value)) = LOWER(@tag${idx})`).join(" OR ");
      conditions.push(`i.tags IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(i.tags) WHERE ${tagConds})`);
      trimmed.forEach((t: string, i: number) => { (params as Record<string, unknown>)[`tag${i}`] = t; });
    }
  }
  if (since) {
    conditions.push("COALESCE(i.pub_date, i.fetched_at) >= @since");
    params.since = since.toISOString();
  }
  if (until) {
    conditions.push("COALESCE(i.pub_date, i.fetched_at) < @until");
    params.until = until.toISOString();
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sqlParams = params as unknown as Record<string, string | number | null>;
  const rows = db
    .prepare(`
      SELECT i.id, i.url, i.source_url, i.title, i.author, i.summary, i.content, i.image_url, i.tags, i.translations, i.pub_date, i.fetched_at, i.pushed_at
      FROM items i ${where}
      ORDER BY COALESCE(i.pub_date, i.fetched_at) DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    .all(sqlParams);
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM items i ${where}`).get(sqlParams) as { count: number };
  return { items: mapRowsToDbItems(rows.map((r) => {
    const obj: Record<string, unknown | null> = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v;
    return obj;
  })), total: count };
}

/** 从所有条目移除指定标签 */
export async function removeTagFromAllItems(tag: string): Promise<number> {
  const trimmed = String(tag ?? "").trim();
  if (!trimmed) return 0;
  const targetLower = trimmed.toLowerCase();

  return withWriteLock(async () => {
    const db = await getDb();
    const rows = db.prepare("SELECT id, tags FROM items WHERE tags IS NOT NULL AND tags != ''").all() as { id: string; tags: string }[];
    const updateStmt = db.prepare("UPDATE items SET tags = @tags WHERE id = @id");
    let count = 0;

    for (const row of rows) {
      let itemTags: string[];
      try {
        itemTags = JSON.parse(row.tags) as string[];
      } catch {
        continue;
      }
      const filtered = itemTags.filter((t) => String(t).trim().toLowerCase() !== targetLower);
      if (filtered.length === itemTags.length) continue;
      const nextTags = filtered.length > 0 ? JSON.stringify(filtered) : null;
      updateStmt.run({ id: row.id, tags: nextTags });
      count += 1;
    }
    return count;
  });
}

/** 标记已投递 */
export async function markPushed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  return withWriteLock(async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE items SET pushed_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
  });
}

/** 按 id 删除条目 */
export async function deleteItem(id: string): Promise<boolean> {
  if (!id?.trim()) return false;
  return withWriteLock(async () => {
    const db = await getDb();
    const row = db.prepare("SELECT rowid FROM items WHERE id = @id").get({ id: id.trim() }) as { rowid: number } | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM items_fts WHERE rowid = @rowid").run({ rowid: row.rowid });
    const info = db.prepare("DELETE FROM items WHERE id = @id").run({ id: id.trim() });
    return Number(info.changes) > 0;
  });
}

/** 按 source_url 删除条目 */
export async function deleteItemsBySourceUrl(sourceUrl: string): Promise<number> {
  if (!sourceUrl?.trim()) return 0;
  const key = canonicalHttpSourceRef(sourceUrl.trim());
  if (!key) return 0;
  return withWriteLock(async () => {
    const db = await getDb();
    const info = db.prepare("DELETE FROM items WHERE source_url = @sourceUrl").run({ sourceUrl: key });
    return Number(info.changes);
  });
}

/** 待投递条目 */
export async function getPendingPushItems(limit = 100): Promise<DbItem[]> {
  const db = await getDb();
  const rows = db
    .prepare(`
      SELECT * FROM items
      WHERE pushed_at IS NULL AND content IS NOT NULL
      ORDER BY fetched_at ASC
      LIMIT ${limit}
    `)
    .all();
  return mapRowsToDbItems(rows.map((r) => {
    const obj: Record<string, unknown | null> = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v;
    return obj;
  }));
}

/** 按本地日取条目 */
export async function getItemsForDate(date: string): Promise<DbItem[]> {
  const db = await getDb();
  const start = new Date(`${date}T00:00:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999`).toISOString();
  const rows = db
    .prepare(`
      SELECT * FROM items
      WHERE fetched_at >= @start AND fetched_at <= @end
      ORDER BY fetched_at DESC
      LIMIT 300
    `)
    .all({ start, end });
  return mapRowsToDbItems(rows.map((r) => {
    const obj: Record<string, unknown | null> = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v;
    return obj;
  }));
}

/** 信源统计 */
export async function getSourceStats(): Promise<
  { source_url: string; count: number; count_7d: number; latest_at: string | null }[]
> {
  const { mergeSourceStatsRows } = await import("../utils/httpSourceRef.js");
  const db = await getDb();
  const rows = db
    .prepare(`
      SELECT source_url,
             COUNT(*) as count,
             SUM(CASE WHEN julianday(fetched_at) >= julianday('now', '-7 days') THEN 1 ELSE 0 END) as count_7d,
             MAX(COALESCE(pub_date, fetched_at)) as latest_at
      FROM items GROUP BY source_url ORDER BY count DESC
    `)
    .all() as { source_url: string; count: number; count_7d: number; latest_at: string | null }[];
  return mergeSourceStatsRows(rows);
}

/** 写入运行日志 */
export async function insertLog(entry: LogEntry): Promise<void> {
  const db = await getLogsDb();
  db.prepare(`
    INSERT INTO logs (level, category, message, payload, source_url, created_at)
    VALUES (@level, @category, @message, @payload, NULL, @created_at)
  `).run({
    level: entry.level,
    category: entry.category,
    message: entry.message,
    payload: entry.payload != null ? JSON.stringify(entry.payload) : null,
    created_at: entry.created_at,
  });
}

/** 分页查询运行日志 */
export async function queryLogs(opts: {
  level?: LogEntry["level"];
  category?: LogEntry["category"];
  limit?: number;
  offset?: number;
  since?: Date;
}): Promise<{ items: DbLog[]; total: number }> {
  const db = await getLogsDb();
  const { level, category, limit = 50, offset = 0, since } = opts;
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (level) {
    conditions.push("level = @level");
    params.level = level;
  }
  if (category) {
    conditions.push("INSTR(LOWER(category), LOWER(@categoryPattern)) > 0");
    params.categoryPattern = category;
  }
  if (since) {
    conditions.push("created_at >= @since");
    params.since = since.toISOString();
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sqlParams = params as unknown as Record<string, string | number | null>;
  const rows = db
    .prepare(`
      SELECT id, level, category, message, payload, created_at
      FROM logs ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    .all(sqlParams);
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM logs ${where}`).get(sqlParams) as { count: number };
  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      level: String(r.level),
      category: String(r.category),
      message: String(r.message),
      payload: r.payload as string | null,
      created_at: String(r.created_at),
    })),
    total: Number(count)
  };
}

/** 清空日志 */
export async function clearAllLogs(): Promise<number> {
  const db = await getLogsDb();
  const r = db.prepare("DELETE FROM logs").run();
  return Number(r.changes);
}

/** 读取系统标签 */
export async function getSystemTags(): Promise<string[]> {
  try {
    const raw = await readFile(TAGS_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { tags?: unknown[] };
    if (!Array.isArray(parsed?.tags)) return [];
    return parsed.tags
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
  } catch {
    return [];
  }
}

/** 保存系统标签 */
export async function saveSystemTagsToFile(tags: string[]): Promise<void> {
  const list = tags
    .filter((t) => typeof t === "string" && t.trim())
    .map((t) => t.trim());
  await writeFile(TAGS_CONFIG_PATH, JSON.stringify({ tags: list }, null, 2), "utf-8");
}

/** 标签使用统计 */
export async function getSystemTagStats(): Promise<TagStat[]> {
  const systemTags = await getSystemTags();
  if (systemTags.length === 0) return [];

  const db = await getDb();
  const rows = db
    .prepare("SELECT tags, pub_date, fetched_at FROM items WHERE tags IS NOT NULL AND tags != ''")
    .all() as { tags: string; pub_date: string | null; fetched_at: string }[];

  const now = Date.now();
  const tagMap = new Map<string, { count: number; hotness: number }>();
  for (const name of systemTags) {
    tagMap.set(name.toLowerCase(), { count: 0, hotness: 0 });
  }

  for (const row of rows) {
    let itemTags: string[];
    try {
      itemTags = JSON.parse(row.tags) as string[];
    } catch {
      continue;
    }
    const pubMs = row.pub_date ? Date.parse(row.pub_date) : null;
    const fetchedMs = Date.parse(row.fetched_at);
    const factor = recencyFactor(pubMs, fetchedMs, now);

    for (const t of itemTags) {
      const key = String(t).trim().toLowerCase();
      const entry = tagMap.get(key);
      if (entry) {
        entry.count += 1;
        entry.hotness += factor;
      }
    }
  }

  return systemTags.map((name) => {
    const entry = tagMap.get(name.toLowerCase()) ?? { count: 0, hotness: 0 };
    return {
      name,
      count: entry.count,
      hotness: Math.round(entry.hotness * 100) / 100,
    };
  });
}

export interface TagStat {
  name: string;
  count: number;
  hotness: number;
  period?: number;
}

function recencyFactor(pubDateMs: number | null, fetchedAtMs: number, nowMs: number): number {
  const ref = pubDateMs ?? fetchedAtMs;
  const daysAgo = (nowMs - ref) / (24 * 60 * 60 * 1000);
  return 1 / (1 + Math.max(0, daysAgo) / 7);
}

/** 建议标签 */
export async function getSuggestedTags(): Promise<TagStat[]> {
  const systemTags = await getSystemTags();
  const systemLower = new Set(systemTags.map((t) => t.toLowerCase().trim()));

  const db = await getDb();
  const rows = db
    .prepare("SELECT tags, pub_date, fetched_at FROM items WHERE tags IS NOT NULL AND tags != ''")
    .all() as { tags: string; pub_date: string | null; fetched_at: string }[];

  const tagMap = new Map<string, { name: string; count: number; hotness: number }>();
  const now = Date.now();

  for (const row of rows) {
    let tags: string[];
    try {
      tags = JSON.parse(row.tags) as string[];
    } catch {
      continue;
    }
    const pubMs = row.pub_date ? Date.parse(row.pub_date) : null;
    const fetchedMs = Date.parse(row.fetched_at);
    const factor = recencyFactor(pubMs, fetchedMs, now);

    for (const t of tags) {
      const trimmed = String(t).trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (systemLower.has(key)) continue;

      const existing = tagMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.hotness += factor;
      } else {
        tagMap.set(key, { name: trimmed, count: 1, hotness: factor });
      }
    }
  }

  return Array.from(tagMap.values())
    .filter((s) => s.hotness > 20)
    .sort((a, b) => b.hotness - a.hotness)
    .slice(0, 5)
    .map((s) => ({ name: s.name, count: s.count, hotness: Math.round(s.hotness * 100) / 100 }));
}

/** 库中行结构 */
export interface DbItem {
  id: string;
  url: string;
  source_url: string;
  title: string | null;
  author: string[] | null;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  tags: string[] | null;
  translations: Record<string, { title?: string; summary?: string; content?: string }> | null;
  pub_date: string | null;
  fetched_at: string;
  pushed_at: string | null;
}

/** 运行日志表行 */
export interface DbLog {
  id: number;
  level: string;
  category: string;
  message: string;
  payload: string | null;
  created_at: string;
}
