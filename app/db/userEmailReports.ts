// user_email_reports 表 CRUD：每用户的邮件报告订阅配置

import { getDb, withWriteLock } from "./index.js";

export interface UserEmailReportRow {
  id: number;
  user_id: string;
  title: string;
  channel_ids: string | null;
  schedule: string;
  last_sent_at: string | null;
  enabled: number;
  mode: string;
  extra_prompt: string | null;
}

export interface UserEmailReport {
  id: number;
  userId: string;
  title: string;
  channelIds: string[] | null;
  schedule: string;
  lastSentAt: string | null;
  enabled: boolean;
  mode: "digest" | "research";
  extraPrompt: string | null;
}

function toReport(row: UserEmailReportRow): UserEmailReport {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    channelIds: row.channel_ids ? JSON.parse(row.channel_ids) as string[] : null,
    schedule: row.schedule,
    lastSentAt: row.last_sent_at,
    enabled: row.enabled === 1,
    mode: (row.mode === "research" ? "research" : "digest"),
    extraPrompt: row.extra_prompt,
  };
}

export async function getUserEmailReports(userId: string): Promise<UserEmailReport[]> {
  const db = await getDb();
  const rows = db.prepare("SELECT * FROM user_email_reports WHERE user_id = ? ORDER BY id ASC").all(userId) as UserEmailReportRow[];
  return rows.map(toReport);
}

export async function getEmailReportById(id: number, userId: string): Promise<UserEmailReport | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM user_email_reports WHERE id = ? AND user_id = ?").get(id, userId) as UserEmailReportRow | undefined;
  return row ? toReport(row) : null;
}

export async function createEmailReport(data: {
  userId: string;
  title: string;
  channelIds?: string[] | null;
  schedule?: string;
  mode?: "digest" | "research";
  extraPrompt?: string | null;
}): Promise<UserEmailReport> {
  return withWriteLock(async () => {
    const db = await getDb();
    const info = db.prepare(`
      INSERT INTO user_email_reports (user_id, title, channel_ids, schedule, enabled, mode, extra_prompt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(
      data.userId,
      data.title,
      data.channelIds ? JSON.stringify(data.channelIds) : null,
      data.schedule ?? "0 8 * * *",
      data.mode ?? "digest",
      data.extraPrompt ?? null,
    );
    const row = db.prepare("SELECT * FROM user_email_reports WHERE id = ?").get(info.lastInsertRowid) as UserEmailReportRow;
    return toReport(row);
  });
}

export async function updateEmailReport(
  id: number,
  userId: string,
  data: Partial<{ title: string; channelIds: string[] | null; schedule: string; enabled: boolean; mode: "digest" | "research"; extraPrompt: string | null }>
): Promise<UserEmailReport | null> {
  return withWriteLock(async () => {
    const db = await getDb();
    const existing = db.prepare("SELECT * FROM user_email_reports WHERE id = ? AND user_id = ?").get(id, userId) as UserEmailReportRow | undefined;
    if (!existing) return null;
    const merged = {
      title: data.title ?? existing.title,
      channel_ids: data.channelIds !== undefined ? (data.channelIds ? JSON.stringify(data.channelIds) : null) : existing.channel_ids,
      schedule: data.schedule ?? existing.schedule,
      enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
      mode: data.mode ?? existing.mode,
      extra_prompt: data.extraPrompt !== undefined ? data.extraPrompt : existing.extra_prompt,
    };
    db.prepare(`
      UPDATE user_email_reports SET title=?, channel_ids=?, schedule=?, enabled=?, mode=?, extra_prompt=? WHERE id=? AND user_id=?
    `).run(merged.title, merged.channel_ids, merged.schedule, merged.enabled, merged.mode, merged.extra_prompt, id, userId);
    const row = db.prepare("SELECT * FROM user_email_reports WHERE id = ?").get(id) as UserEmailReportRow;
    return toReport(row);
  });
}

export async function deleteEmailReport(id: number, userId: string): Promise<boolean> {
  return withWriteLock(async () => {
    const db = await getDb();
    const info = db.prepare("DELETE FROM user_email_reports WHERE id = ? AND user_id = ?").run(id, userId);
    return info.changes > 0;
  });
}

export async function updateLastSentAt(id: number, sentAt: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare("UPDATE user_email_reports SET last_sent_at = ? WHERE id = ?").run(sentAt, id);
  });
}

/** 查询所有已启用且到期需要发送的报告 */
export async function getDueReports(): Promise<(UserEmailReport & { userEmail: string })[]> {
  const db = await getDb();
  const rows = db.prepare(`
    SELECT r.*, u.email as user_email
    FROM user_email_reports r
    JOIN users u ON r.user_id = u.id
    WHERE r.enabled = 1
  `).all() as (UserEmailReportRow & { user_email: string })[];
  return rows.map((row) => ({ ...toReport(row), userEmail: row.user_email }));
}
