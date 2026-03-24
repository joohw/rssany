// 话题报告调度：生成与发送分属两个调度分组（topics / email）
// — 生成按 refresh 提前跑 Markdown；发送在固定时刻（默认每天 6:00）按同一 refresh 发邮件
// node-cron：分 时 日 月 周，本地时区

import * as scheduler from "../scheduler/index.js";
import { generateTopicDigest } from "./index.js";
import { sendDailyDigestEmailsForTopic } from "./dailyDigestMail.js";
import { hasAnyEnabledSubscriberForDailyKey } from "../db/index.js";
import { loadDailyReports } from "../config/loadDailyReports.js";
import { logger } from "../core/logger/index.js";

let cachedTopicBaseDir: string | null = null;

/** 日报生成（Agent 写 Markdown） */
const TOPICS_GROUP = "topics";
/** 日报邮件发送，与生成隔离并发与展示 */
const EMAIL_GROUP = "email";
/** Agent 任务组最大并发数 */
const TOPICS_CONCURRENCY = 1;

/** 生成日报：默认每天 5:00（本地时间），早于发送以便模型有足够时间跑完 */
const DIGEST_GENERATE_HOUR = Number(process.env.DAILY_DIGEST_GENERATE_HOUR ?? 5);
const DIGEST_GENERATE_MINUTE = Number(process.env.DAILY_DIGEST_GENERATE_MINUTE ?? 0);

/** 发送邮件：默认每天 6:00（本地时间） */
const DIGEST_SEND_HOUR = Number(process.env.DAILY_DIGEST_SEND_HOUR ?? 6);
const DIGEST_SEND_MINUTE = Number(process.env.DAILY_DIGEST_SEND_MINUTE ?? 0);

function topicGenTaskId(dailyKey: string): string {
  return `topic:gen:${dailyKey}`;
}

function topicSendTaskId(dailyKey: string): string {
  return `topic:send:${dailyKey}`;
}

function createGenerateTask(baseDir: string, topicTitle: string): scheduler.ScheduledTask {
  return async () => {
    await generateTopicDigest(baseDir, topicTitle, false);
  };
}

function createSendTask(topicTitle: string, dailyKey: string): scheduler.ScheduledTask {
  return async () => {
    const any = await hasAnyEnabledSubscriberForDailyKey(dailyKey);
    if (!any) {
      logger.debug("scheduler", "该日报无订阅者，跳过邮件", { dailyKey, topicTitle });
      return;
    }
    await sendDailyDigestEmailsForTopic(topicTitle, dailyKey);
  };
}

/**
 * 将 refresh 天数转为 cron（本地时间，同一 hour/minute）
 * refresh 1 → 每天；7 → 每周日；其他 → 月内按步长
 */
function refreshDaysToCron(refreshDays: number, hour: number, minute: number): string {
  const h = Math.max(0, Math.min(23, hour));
  const min = Math.max(0, Math.min(59, minute));
  const m = String(min);
  if (refreshDays === 1) return `${m} ${h} * * *`;
  if (refreshDays === 7) return `${m} ${h} * * 0`;
  const n = Math.min(31, Math.max(2, refreshDays));
  return `${m} ${h} 1-31/${n} * *`;
}

/** 每个系统日报：生成注册在 topics；发邮件注册在 email（默认 6:00 等由环境变量控制） */
async function rescheduleTopics(baseDir: string, runNow: boolean): Promise<void> {
  scheduler.unscheduleGroup(TOPICS_GROUP);
  scheduler.unscheduleGroup(EMAIL_GROUP);

  let defs: Awaited<ReturnType<typeof loadDailyReports>>;
  try {
    defs = await loadDailyReports();
  } catch {
    defs = [];
  }

  let registered = 0;
  for (const def of defs) {
    const title = def.title.trim();
    if (!title) continue;
    const refreshDays = Math.max(1, def.refresh);
    const cronGen = refreshDaysToCron(refreshDays, DIGEST_GENERATE_HOUR, DIGEST_GENERATE_MINUTE);
    const cronSend = refreshDaysToCron(refreshDays, DIGEST_SEND_HOUR, DIGEST_SEND_MINUTE);

    scheduler.schedule(
      TOPICS_GROUP,
      topicGenTaskId(def.key),
      createGenerateTask(baseDir, title),
      {
        cron: cronGen,
        retries: 1,
        retryDelayMs: 60_000,
        concurrency: TOPICS_CONCURRENCY,
        runNow,
      }
    );
    scheduler.schedule(
      EMAIL_GROUP,
      topicSendTaskId(def.key),
      createSendTask(title, def.key),
      {
        cron: cronSend,
        retries: 1,
        retryDelayMs: 60_000,
        concurrency: TOPICS_CONCURRENCY,
        runNow: false,
      }
    );
    registered += 2;
  }

  logger.info("scheduler", "Agent 日报调度已注册（topics 生成 / email 邮件）", {
    taskPairs: registered / 2,
    defs: defs.length,
    generateAt: `${DIGEST_GENERATE_HOUR}:${String(DIGEST_GENERATE_MINUTE).padStart(2, "0")}`,
    sendAt: `${DIGEST_SEND_HOUR}:${String(DIGEST_SEND_MINUTE).padStart(2, "0")}`,
  });
}

export async function initTopicsScheduler(baseDir: string): Promise<void> {
  cachedTopicBaseDir = baseDir;
  await rescheduleTopics(baseDir, false);
}

/** 订阅开关变更后重新注册 cron（如 PUT /api/daily-reports 保存后调用） */
export async function refreshTopicsScheduler(): Promise<void> {
  if (!cachedTopicBaseDir) return;
  await rescheduleTopics(cachedTopicBaseDir, true);
}
