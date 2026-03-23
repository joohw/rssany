// users 表 CRUD：支持 email/password (local) 与 OAuth (google/github) 两种登录方式

import { randomUUID } from "node:crypto";
import { getDb, withWriteLock } from "./index.js";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  provider: string;
  provider_id: string | null;
  rss_token: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export type PublicUser = Omit<UserRow, "password_hash">;

export async function createUser(data: {
  email: string;
  passwordHash?: string | null;
  provider?: string;
  providerId?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
}): Promise<UserRow> {
  return withWriteLock(async () => {
    const db = await getDb();
    const id = randomUUID();
    const rssToken = randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, provider, provider_id, rss_token, display_name, avatar_url, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.email.toLowerCase().trim(),
      data.passwordHash ?? null,
      data.provider ?? "local",
      data.providerId ?? null,
      rssToken,
      data.displayName ?? null,
      data.avatarUrl ?? null,
      data.role ?? "user",
      now,
    );
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  });
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim()) as UserRow | undefined;
  return row ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ?? null;
}

export async function getUserByRssToken(token: string): Promise<UserRow | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM users WHERE rss_token = ?").get(token) as UserRow | undefined;
  return row ?? null;
}

export async function getUserByProvider(provider: string, providerId: string): Promise<UserRow | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM users WHERE provider = ? AND provider_id = ?").get(provider, providerId) as UserRow | undefined;
  return row ?? null;
}

/** 通过 OAuth 登录时，若邮箱已存在则关联 OAuth provider，否则新建用户 */
export async function upsertOAuthUser(data: {
  email: string;
  provider: string;
  providerId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRow> {
  const existing = await getUserByEmail(data.email);
  if (existing) {
    if (existing.provider === "local" || (existing.provider === data.provider && existing.provider_id === data.providerId)) {
      await withWriteLock(async () => {
        const db = await getDb();
        db.prepare(`
          UPDATE users SET provider_id = ?, display_name = COALESCE(?, display_name),
          avatar_url = COALESCE(?, avatar_url), last_login_at = ? WHERE id = ?
        `).run(data.providerId, data.displayName ?? null, data.avatarUrl ?? null, new Date().toISOString(), existing.id);
      });
      return (await getUserById(existing.id))!;
    }
  }
  const byProvider = await getUserByProvider(data.provider, data.providerId);
  if (byProvider) {
    await updateUserLastLogin(byProvider.id);
    return (await getUserById(byProvider.id))!;
  }
  return createUser({
    email: data.email,
    provider: data.provider,
    providerId: data.providerId,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
  });
}

export async function updateUserLastLogin(id: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  });
}

export async function regenerateRssToken(userId: string): Promise<string> {
  return withWriteLock(async () => {
    const db = await getDb();
    const newToken = randomUUID().replace(/-/g, "");
    db.prepare("UPDATE users SET rss_token = ? WHERE id = ?").run(newToken, userId);
    return newToken;
  });
}

export async function getAllUsers(): Promise<PublicUser[]> {
  const db = await getDb();
  return db.prepare(
    "SELECT id, email, provider, provider_id, rss_token, display_name, avatar_url, role, created_at, last_login_at FROM users ORDER BY created_at DESC"
  ).all() as PublicUser[];
}

export function toPublicUser(user: UserRow): PublicUser {
  const { password_hash: _, ...rest } = user;
  return rest;
}
