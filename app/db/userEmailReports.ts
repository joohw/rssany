// user_email_reports 表 CRUD：每用户的邮件报告订阅配置

import { supabase } from "./client.js";
import { withWriteLock } from "./index.js";

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
    enabled: Number(row.enabled) === 1,
    mode: row.mode === "research" ? "research" : "digest",
    extraPrompt: row.extra_prompt,
  };
}

export async function getUserEmailReports(userId: string): Promise<UserEmailReport[]> {
  const { data } = await supabase.from("user_email_reports").select("*").eq("user_id", userId).order("id", { ascending: true });
  return (data ?? []).map((r) => toReport(r as UserEmailReportRow));
}

export async function getEmailReportById(id: number, userId: string): Promise<UserEmailReport | null> {
  const { data } = await supabase.from("user_email_reports").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return data ? toReport(data as UserEmailReportRow) : null;
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
    const row = {
      user_id: data.userId,
      title: data.title,
      channel_ids: data.channelIds ? JSON.stringify(data.channelIds) : null,
      schedule: data.schedule ?? "0 8 * * *",
      enabled: 1,
      mode: data.mode ?? "digest",
      extra_prompt: data.extraPrompt ?? null,
    };
    const { data: inserted, error } = await supabase.from("user_email_reports").insert(row).select().single();
    if (error) throw new Error(`createEmailReport: ${error.message}`);
    return toReport(inserted as UserEmailReportRow);
  });
}

export async function updateEmailReport(
  id: number,
  userId: string,
  data: Partial<{ title: string; channelIds: string[] | null; schedule: string; enabled: boolean; mode: "digest" | "research"; extraPrompt: string | null }>
): Promise<UserEmailReport | null> {
  return withWriteLock(async () => {
    const existing = await getEmailReportById(id, userId);
    if (!existing) return null;
    const update: Record<string, unknown> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.channelIds !== undefined) update.channel_ids = data.channelIds ? JSON.stringify(data.channelIds) : null;
    if (data.schedule !== undefined) update.schedule = data.schedule;
    if (data.enabled !== undefined) update.enabled = data.enabled ? 1 : 0;
    if (data.mode !== undefined) update.mode = data.mode;
    if (data.extraPrompt !== undefined) update.extra_prompt = data.extraPrompt;
    const { data: updated, error } = await supabase.from("user_email_reports").update(update).eq("id", id).eq("user_id", userId).select().single();
    if (error) throw new Error(`updateEmailReport: ${error.message}`);
    return toReport(updated as UserEmailReportRow);
  });
}

export async function deleteEmailReport(id: number, userId: string): Promise<boolean> {
  const { error, count } = await supabase.from("user_email_reports").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`deleteEmailReport: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function updateLastSentAt(id: number, sentAt: string): Promise<void> {
  await supabase.from("user_email_reports").update({ last_sent_at: sentAt }).eq("id", id);
}

export async function getDueReports(): Promise<(UserEmailReport & { userEmail: string })[]> {
  const { data, error } = await supabase
    .from("user_email_reports")
    .select("*, users!inner(email)")
    .eq("enabled", 1);
  if (error) throw new Error(`getDueReports: ${error.message}`);
  return (data ?? []).map((row) => {
    const { users, ...rest } = row as UserEmailReportRow & { users: { email: string } };
    return { ...toReport(rest), userEmail: users.email };
  });
}
