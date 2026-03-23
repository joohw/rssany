// user_sources 表 CRUD：每用户的信源订阅（替代全局 sources.json）

import { supabase } from "./client.js";
import { withWriteLock } from "./index.js";

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
  const { data } = await supabase.from("user_sources").select("*").eq("user_id", userId).order("id", { ascending: true });
  return (data ?? []) as UserSourceRow[];
}

export async function getUserSourceRefs(userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_sources").select("ref").eq("user_id", userId);
  return (data ?? []).map((r) => r.ref as string);
}

export async function setUserSources(
  userId: string,
  sources: Array<{ ref: string; label?: string | null; refresh?: string | null; proxy?: string | null; cron?: string | null; weight?: number | null }>
): Promise<void> {
  return withWriteLock(async () => {
    await supabase.from("user_sources").delete().eq("user_id", userId);
    if (sources.length === 0) return;
    const rows = sources.map((s) => ({
      user_id: userId,
      ref: s.ref,
      label: s.label ?? null,
      refresh: s.refresh ?? null,
      proxy: s.proxy ?? null,
      cron: s.cron ?? null,
      weight: s.weight ?? null,
    }));
    const { error } = await supabase.from("user_sources").insert(rows);
    if (error) throw new Error(`setUserSources: ${error.message}`);
  });
}

export async function addUserSource(
  userId: string,
  source: { ref: string; label?: string | null; refresh?: string | null; proxy?: string | null; cron?: string | null; weight?: number | null }
): Promise<void> {
  return withWriteLock(async () => {
    await supabase.from("user_sources").upsert(
      { user_id: userId, ref: source.ref, label: source.label ?? null, refresh: source.refresh ?? null, proxy: source.proxy ?? null, cron: source.cron ?? null, weight: source.weight ?? null },
      { onConflict: "user_id,ref", ignoreDuplicates: true }
    );
  });
}

export async function removeUserSource(userId: string, ref: string): Promise<void> {
  await supabase.from("user_sources").delete().eq("user_id", userId).eq("ref", ref);
}

export async function getAllUserSourceRefs(): Promise<string[]> {
  const { data } = await supabase.from("user_sources").select("ref");
  const refs = [...new Set((data ?? []).map((r) => r.ref as string))];
  return refs;
}
