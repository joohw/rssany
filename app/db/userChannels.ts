// user_channels 表 CRUD：每用户的频道配置（替代全局 channels.json）

import { supabase } from "./client.js";
import { withWriteLock } from "./index.js";

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
  } catch { return []; }
}

function toChannelData(r: UserChannelRow): UserChannelData {
  return { id: r.channel_id, title: r.title, description: r.description, sourceRefs: parseSourceRefs(r.source_refs) };
}

export async function getUserChannels(userId: string): Promise<UserChannelData[]> {
  const { data } = await supabase.from("user_channels").select("*").eq("user_id", userId).order("channel_id", { ascending: true });
  return (data ?? []).map((r) => toChannelData(r as UserChannelRow));
}

export async function getUserChannel(userId: string, channelId: string): Promise<UserChannelData | null> {
  const { data } = await supabase.from("user_channels").select("*").eq("user_id", userId).eq("channel_id", channelId).maybeSingle();
  return data ? toChannelData(data as UserChannelRow) : null;
}

export async function setUserChannels(
  userId: string,
  channels: Array<{ id: string; title?: string | null; description?: string | null; sourceRefs?: string[] }>
): Promise<void> {
  return withWriteLock(async () => {
    await supabase.from("user_channels").delete().eq("user_id", userId);
    if (channels.length === 0) return;
    const rows = channels.map((ch) => ({
      user_id: userId,
      channel_id: ch.id,
      title: ch.title ?? null,
      description: ch.description ?? null,
      source_refs: JSON.stringify(ch.sourceRefs ?? []),
    }));
    const { error } = await supabase.from("user_channels").insert(rows);
    if (error) throw new Error(`setUserChannels: ${error.message}`);
  });
}

export async function upsertUserChannel(
  userId: string,
  channel: { id: string; title?: string | null; description?: string | null; sourceRefs?: string[] }
): Promise<void> {
  return withWriteLock(async () => {
    const { error } = await supabase.from("user_channels").upsert(
      {
        user_id: userId,
        channel_id: channel.id,
        title: channel.title ?? null,
        description: channel.description ?? null,
        source_refs: JSON.stringify(channel.sourceRefs ?? []),
      },
      { onConflict: "user_id,channel_id" }
    );
    if (error) throw new Error(`upsertUserChannel: ${error.message}`);
  });
}

export async function deleteUserChannel(userId: string, channelId: string): Promise<void> {
  await supabase.from("user_channels").delete().eq("user_id", userId).eq("channel_id", channelId);
}
