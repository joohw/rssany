// user_sources 表 CRUD：每用户的信源订阅（替代全局 sources.json）

import { getDb, withWriteLock } from "./index.js";

export interface UserSourceRow {
  id: number;
  user_id: string;
  ref: string;
  label: string | null;
  refresh: string | null;
  proxy: string | null;
  cron: string | null;
  weight: number | null;
}

export async function getUserSources(userId: string): Promise<UserSourceRow[]> {
  const db = await getDb();
  return db.prepare("SELECT * FROM user_sources WHERE user_id = ? ORDER BY id ASC").all(userId) as UserSourceRow[];
}

export async function getUserSourceRefs(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = db.prepare("SELECT ref FROM user_sources WHERE user_id = ?").all(userId) as { ref: string }[];
  return rows.map((r) => r.ref);
}

/** 全量替换用户的信源列表 */
export async function setUserSources(
  userId: string,
  sources: Array<{ ref: string; label?: string | null; refresh?: string | null; proxy?: string | null; cron?: string | null; weight?: number | null }>
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const del = db.prepare("DELETE FROM user_sources WHERE user_id = ?");
    const ins = db.prepare(
      "INSERT INTO user_sources (user_id, ref, label, refresh, proxy, cron, weight) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    db.transaction(() => {
      del.run(userId);
      for (const s of sources) {
        ins.run(userId, s.ref, s.label ?? null, s.refresh ?? null, s.proxy ?? null, s.cron ?? null, s.weight ?? null);
      }
    })();
  });
}

export async function addUserSource(
  userId: string,
  source: { ref: string; label?: string | null; refresh?: string | null; proxy?: string | null; cron?: string | null; weight?: number | null }
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare(
      "INSERT OR IGNORE INTO user_sources (user_id, ref, label, refresh, proxy, cron, weight) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(userId, source.ref, source.label ?? null, source.refresh ?? null, source.proxy ?? null, source.cron ?? null, source.weight ?? null);
  });
}

export async function removeUserSource(userId: string, ref: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare("DELETE FROM user_sources WHERE user_id = ? AND ref = ?").run(userId, ref);
  });
}

/** 聚合所有用户的 refs（去重），供调度器使用 */
export async function getAllUserSourceRefs(): Promise<string[]> {
  const db = await getDb();
  const rows = db.prepare("SELECT DISTINCT ref FROM user_sources").all() as { ref: string }[];
  return rows.map((r) => r.ref);
}
