// 邮件报告调度器：用 node-cron 定时检查 user_email_reports 并发送

import cron from "node-cron";
import { supabase } from "../db/client.js";
import { getDueReports, updateLastSentAt } from "../db/userEmailReports.js";
import { getUserSources } from "../db/userSources.js";
import { getUserChannels } from "../db/userChannels.js";
import { getUserById } from "../db/users.js";
import { getEmailSender } from "./sender.js";
import { renderDigest, renderDigestText } from "./templates/digest.js";
import { renderResearch } from "./templates/research.js";
import { logger } from "../core/logger/index.js";
import type { UserEmailReport } from "../db/userEmailReports.js";

const CRON_CHECK_INTERVAL = "* * * * *"; // 每分钟检查一次

function shouldSendNow(schedule: string, lastSentAt: string | null): boolean {
  if (!lastSentAt) return true;
  try {
    const interval = cron.validate(schedule) ? parseCronInterval(schedule) : 60 * 60 * 1000;
    const last = new Date(lastSentAt).getTime();
    return Date.now() - last >= interval;
  } catch {
    return false;
  }
}

/** 粗略估算 cron 最小触发间隔（毫秒），仅用于判断是否需要发送 */
function parseCronInterval(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return 60 * 60 * 1000;
  const [minute, hour] = parts;
  if (minute !== "*" && hour !== "*") return 24 * 60 * 60 * 1000; // daily
  if (minute !== "*") return 60 * 60 * 1000; // hourly
  return 60 * 1000; // per-minute
}

async function getItemsSince(sourceRefs: string[], since: Date | null): Promise<ReturnType<typeof getRecentItems>> {
  return getRecentItems(sourceRefs, since);
}

async function getRecentItems(sourceRefs: string[], since: Date | null) {
  if (sourceRefs.length === 0) return [];
  type ItemRow = { id: string; url: string; source_url: string; title: string | null; summary: string | null; image_url: string | null; pub_date: string | null };
  let query = supabase
    .from("items")
    .select("id, url, source_url, title, summary, image_url, pub_date")
    .in("source_url", sourceRefs)
    .order("pub_date", { ascending: false, nullsFirst: false })
    .limit(100);
  if (since) query = query.gt("fetched_at", since.toISOString());
  const { data } = await query;
  return (data ?? []) as ItemRow[];
}

async function processDigest(report: UserEmailReport & { userEmail: string }): Promise<void> {
  const sender = await getEmailSender();
  if (!sender) {
    logger.warn("email", "EmailSender 未配置，跳过发送", { reportId: report.id });
    return;
  }

  const allUserSources = await getUserSources(report.userId);
  const userChannels = await getUserChannels(report.userId);

  const since = report.lastSentAt ? new Date(report.lastSentAt) : null;

  let channelList = userChannels;
  if (report.channelIds?.length) {
    channelList = userChannels.filter((ch) => report.channelIds!.includes(ch.id));
  }

  const allRefs = Array.from(new Set(channelList.flatMap((ch) => ch.sourceRefs)));
  if (allRefs.length === 0 && allUserSources.length > 0) {
    // 用户有信源但无频道，直接拿所有信源
    allRefs.push(...allUserSources.map((s) => s.ref));
  }

  const items = await getItemsSince(allRefs, since);
  if (items.length === 0) {
    logger.info("email", "无新文章，跳过发送", { reportId: report.id, userId: report.userId });
    return;
  }

  const sourceToChannel = new Map<string, { id: string; title: string }>();
  for (const ch of channelList) {
    for (const ref of ch.sourceRefs) {
      sourceToChannel.set(ref, { id: ch.id, title: ch.title ?? ch.id });
    }
  }

  const channelMap = new Map<string, { id: string; title: string; items: typeof items }>();
  for (const item of items) {
    const ch = sourceToChannel.get(item.source_url) ?? { id: "other", title: "其他" };
    if (!channelMap.has(ch.id)) channelMap.set(ch.id, { ...ch, items: [] });
    channelMap.get(ch.id)!.items.push(item);
  }

  const user = await getUserById(report.userId);
  const appUrl = process.env.APP_URL ?? "";

  const digestItems = Array.from(channelMap.values()).map((ch) => ({
    id: ch.id,
    title: ch.title,
    items: ch.items.map((i) => ({
      id: i.id,
      title: i.title ?? "(无标题)",
      url: i.url,
      summary: i.summary,
      source_url: i.source_url,
      pub_date: i.pub_date,
      image_url: i.image_url,
    })),
  }));

  const now = new Date();
  const period = since
    ? `${since.toLocaleDateString("zh-CN")} 至 ${now.toLocaleDateString("zh-CN")}`
    : `截至 ${now.toLocaleDateString("zh-CN")}`;

  const html = renderDigest({ title: report.title, recipientName: user?.display_name, channels: digestItems, period, appUrl });
  const text = renderDigestText({ title: report.title, recipientName: user?.display_name, channels: digestItems, period, appUrl });

  await sender.send({ to: report.userEmail, subject: report.title, html, text });
  logger.info("email", "摘要邮件已发送", { reportId: report.id, to: report.userEmail, itemCount: items.length });
}

async function processResearch(report: UserEmailReport & { userEmail: string }): Promise<void> {
  const sender = await getEmailSender();
  if (!sender) return;

  // 获取用户订阅信源
  const allUserSources = await getUserSources(report.userId);
  const refs = report.channelIds?.length
    ? (await getUserChannels(report.userId)).filter((ch) => report.channelIds!.includes(ch.id)).flatMap((ch) => ch.sourceRefs)
    : allUserSources.map((s) => s.ref);

  const since = report.lastSentAt ? new Date(report.lastSentAt) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const items = await getRecentItems(Array.from(new Set(refs)), since);
  if (items.length === 0) return;

  // 构建 LLM 提示词
  const itemsText = items.slice(0, 30).map((it, i) =>
    `${i + 1}. ${it.title ?? "(无标题)"}\n   链接: ${it.url}\n   摘要: ${(it.summary ?? "").slice(0, 200)}`
  ).join("\n\n");

  const basePrompt = `根据以下 ${items.length} 篇文章，生成一份结构化研究报告。\n\n${itemsText}`;
  const prompt = report.extraPrompt ? `${basePrompt}\n\n补充要求：${report.extraPrompt}` : basePrompt;

  let markdown = `# ${report.title}\n\n`;
  try {
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    markdown += resp.choices[0]?.message?.content ?? "（报告生成失败）";
  } catch (err) {
    logger.error("email", "研究报告 LLM 生成失败", { err: err instanceof Error ? err.message : String(err) });
    markdown += "（报告生成失败，请检查 OPENAI_API_KEY 配置）";
  }

  const user = await getUserById(report.userId);
  const html = await renderResearch({
    title: report.title,
    markdown,
    recipientName: user?.display_name,
    generatedAt: new Date().toISOString(),
    appUrl: process.env.APP_URL ?? "",
  });

  await sender.send({ to: report.userEmail, subject: report.title, html });
  logger.info("email", "研究报告已发送", { reportId: report.id, to: report.userEmail });
}

async function processDueReports(): Promise<void> {
  try {
    const reports = await getDueReports();
    for (const report of reports) {
      if (!shouldSendNow(report.schedule, report.lastSentAt)) continue;
      const sentAt = new Date().toISOString();
      try {
        if (report.mode === "research") {
          await processResearch(report);
        } else {
          await processDigest(report);
        }
        await updateLastSentAt(report.id, sentAt);
      } catch (err) {
        logger.error("email", "邮件发送失败", { reportId: report.id, err: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    logger.error("email", "邮件调度器异常", { err: err instanceof Error ? err.message : String(err) });
  }
}

export function initEmailScheduler(): void {
  cron.schedule(CRON_CHECK_INTERVAL, () => {
    processDueReports().catch(() => {});
  });
  logger.info("email", "邮件调度器已启动");
}
