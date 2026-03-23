// users 表 CRUD：支持 email/password (local) 与 OAuth (google/github) 两种登录方式

import { randomUUID } from "node:crypto";
import { supabase } from "./client.js";
import { withWriteLock } from "./index.js";

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
    const id = randomUUID();
    const rssToken = randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const row = {
      id,
      email: data.email.toLowerCase().trim(),
      password_hash: data.passwordHash ?? null,
      provider: data.provider ?? "local",
      provider_id: data.providerId ?? null,
      rss_token: rssToken,
      display_name: data.displayName ?? null,
      avatar_url: data.avatarUrl ?? null,
      role: data.role ?? "user",
      created_at: now,
      last_login_at: null,
    };
    const { error } = await supabase.from("users").insert(row);
    if (error) throw new Error(`createUser: ${error.message}`);
    return row as UserRow;
  });
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data } = await supabase.from("users").select("*").eq("email", email.toLowerCase().trim()).maybeSingle();
  return (data as UserRow | null) ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  return (data as UserRow | null) ?? null;
}

export async function getUserByRssToken(token: string): Promise<UserRow | null> {
  const { data } = await supabase.from("users").select("*").eq("rss_token", token).maybeSingle();
  return (data as UserRow | null) ?? null;
}

export async function getUserByProvider(provider: string, providerId: string): Promise<UserRow | null> {
  const { data } = await supabase.from("users").select("*").eq("provider", provider).eq("provider_id", providerId).maybeSingle();
  return (data as UserRow | null) ?? null;
}

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
        await supabase.from("users").update({
          provider_id: data.providerId,
          display_name: data.displayName ?? existing.display_name,
          avatar_url: data.avatarUrl ?? existing.avatar_url,
          last_login_at: new Date().toISOString(),
        }).eq("id", existing.id);
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
  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

export async function regenerateRssToken(userId: string): Promise<string> {
  return withWriteLock(async () => {
    const newToken = randomUUID().replace(/-/g, "");
    await supabase.from("users").update({ rss_token: newToken }).eq("id", userId);
    return newToken;
  });
}

export async function getAllUsers(): Promise<PublicUser[]> {
  const { data } = await supabase
    .from("users")
    .select("id, email, provider, provider_id, rss_token, display_name, avatar_url, role, created_at, last_login_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as PublicUser[];
}

export function toPublicUser(user: UserRow): PublicUser {
  const { password_hash: _, ...rest } = user;
  return rest;
}
