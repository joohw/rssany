// EmailSender 接口 + 工厂函数：driver/from 读自 config.json，连接参数全部读自 .env

import nodemailer from "nodemailer";

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(opts: EmailSendOptions): Promise<void>;
}

// ─── SMTP Driver（连接参数全部来自 env）──────────────────────────────────────

export class SmtpSender implements EmailSender {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(from: string) {
    this.from = from;
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(opts: EmailSendOptions): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
  }
}

// ─── Resend Driver（API Key 来自 env）────────────────────────────────────────

export class ResendSender implements EmailSender {
  private from: string;

  constructor(from: string) {
    this.from = from;
    if (!process.env.RESEND_API_KEY) {
      throw new Error("email.driver=resend 需设置 RESEND_API_KEY 环境变量");
    }
  }

  async send(opts: EmailSendOptions): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend 发送失败 [${res.status}]: ${body}`);
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface EmailConfig {
  driver: "smtp" | "resend";
  from: string;
}

let _sender: EmailSender | null = null;

export function createEmailSender(config: EmailConfig): EmailSender {
  switch (config.driver) {
    case "smtp":   return new SmtpSender(config.from);
    case "resend": return new ResendSender(config.from);
    default:
      throw new Error(`未知 email driver: ${(config as { driver: string }).driver}`);
  }
}

/** 获取全局 EmailSender 单例；driver/from 读自 config.json，凭证读自 .env */
export async function getEmailSender(): Promise<EmailSender | null> {
  if (_sender) return _sender;
  try {
    const { readFile } = await import("node:fs/promises");
    const { CONFIG_PATH } = await import("../config/paths.js");
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as { email?: EmailConfig };
    if (!config.email?.driver) return null;
    _sender = createEmailSender(config.email);
    return _sender;
  } catch {
    return null;
  }
}

/** 重置单例（config 更新后调用） */
export function resetEmailSender(): void {
  _sender = null;
}
