// user_channels 表 CRUD：每用户的频道配置（替代全局 channels.json）

import { getDb, withWriteLock } from "./index.js";

export interface UserChannelRow {
  channel_id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  source_refs: string;
}

export interface UserChannelData {
  id: string;
  title: string | null;
  description: string | null;
  sourceRefs: string[];
}

function parseSourceRefs(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function getUserChannels(userId: string): Promise<UserChannelData[]> {
  const db = await getDb();
  const rows = db.prepare("SELECT * FROM user_channels WHERE user_id = ? ORDER BY channel_id ASC").all(userId) as UserChannelRow[];
  return rows.map((r) => ({
    id: r.channel_id,
    title: r.title,
    description: r.description,
    sourceRefs: parseSourceRefs(r.source_refs),
  }));
}

export async function getUserChannel(userId: string, channelId: string): Promise<UserChannelData | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM user_channels WHERE user_id = ? AND channel_id = ?").get(userId, channelId) as UserChannelRow | undefined;
  if (!row) return null;
  return { id: row.channel_id, title: row.title, description: row.description, sourceRefs: parseSourceRefs(row.source_refs) };
}

/** 全量替换用户的频道配置 */
export async function setUserChannels(
  userId: string,
  channels: Array<{ id: string; title?: string | null; description?: string | null; sourceRefs?: string[] }>
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const del = db.prepare("DELETE FROM user_channels WHERE user_id = ?");
    const ins = db.prepare(
      "INSERT INTO user_channels (user_id, channel_id, title, description, source_refs) VALUES (?, ?, ?, ?, ?)"
    );
    db.transaction(() => {
      del.run(userId);
      for (const ch of channels) {
        ins.run(userId, ch.id, ch.title ?? null, ch.description ?? null, JSON.stringify(ch.sourceRefs ?? []));
      }
    })();
  });
}

export async function upsertUserChannel(
  userId: string,
  channel: { id: string; title?: string | null; description?: string | null; sourceRefs?: string[] }
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare(`
      INSERT INTO user_channels (user_id, channel_id, title, description, source_refs)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, channel_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        source_refs = excluded.source_refs
    `).run(userId, channel.id, channel.title ?? null, channel.description ?? null, JSON.stringify(channel.sourceRefs ?? []));
  });
}

export async function deleteUserChannel(userId: string, channelId: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare("DELETE FROM user_channels WHERE user_id = ? AND channel_id = ?").run(userId, channelId);
  });
}
