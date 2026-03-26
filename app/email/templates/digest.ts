// Digest 邮件模板：按频道分组列出近期文章，适合日报/周报摘要
// 视觉与 webui/src/app.css 的 Linear 深色主题 token 对齐

import { PRODUCT_NAME } from "../../config/brand.js";

/** 与网站 :root 主题色一致（邮件内联样式，避免依赖 CSS 变量） */
const THEME = {
  bg: "#08090a",
  card: "#0c0c0e",
  cardElevated: "#111113",
  primary: "#5e6ad2",
  primaryHover: "#7c85e8",
  primaryForeground: "#ffffff",
  foreground: "#ececed",
  muted: "#8b8e98",
  mutedStrong: "#b4b8c2",
  border: "rgba(255,255,255,0.1)",
  borderHairline: "rgba(255,255,255,0.06)",
} as const;

export interface DigestItem {
  id: string;
  title: string;
  url: string;
  summary?: string | null;
  source_url: string;
  pub_date?: string | null;
  image_url?: string | null;
}

export interface DigestChannel {
  id: string;
  title: string;
  items: DigestItem[];
}

export interface DigestOptions {
  title: string;
  recipientName?: string | null;
  channels: DigestChannel[];
  period?: string;
  appUrl?: string;
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

export function renderDigest(opts: DigestOptions): string {
  const { title, recipientName, channels, period, appUrl = "" } = opts;
  const totalCount = channels.reduce((s, ch) => s + ch.items.length, 0);

  const channelBlocks = channels
    .filter((ch) => ch.items.length > 0)
    .map((ch) => {
      const items = ch.items.map((item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${THEME.borderHairline};">
            ${item.image_url ? `<img src="${escHtml(item.image_url)}" alt="" style="width:64px;height:64px;object-fit:cover;float:right;margin-left:12px;" />` : ""}
            <a href="${escHtml(item.url)}" style="font-size:15px;font-weight:600;color:${THEME.foreground};text-decoration:none;line-height:1.4;display:block;margin-bottom:4px;">${escHtml(item.title)}</a>
            ${item.summary ? `<p style="margin:0 0 4px;font-size:13px;color:${THEME.mutedStrong};line-height:1.5;">${escHtml(item.summary.slice(0, 200))}${item.summary.length > 200 ? "…" : ""}</p>` : ""}
            <span style="font-size:12px;color:${THEME.muted};">${formatDate(item.pub_date)}</span>
            <div style="clear:both;"></div>
          </td>
        </tr>`).join("");

      return `
        <tr><td class="digest-channel-title" style="padding:24px 0 8px;">
          <h2 style="margin:0;font-size:17px;font-weight:700;color:${THEME.foreground};border-left:3px solid ${THEME.primary};padding-left:10px;">${escHtml(ch.title)}</h2>
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
        </td></tr>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style type="text/css">
  @media only screen and (max-width: 480px) {
    .digest-shell { padding: 12px 8px !important; }
    .digest-header { padding: 18px 16px !important; }
    .digest-greeting { padding: 16px 16px 0 !important; }
    .digest-channels { padding: 6px 16px 16px !important; }
    .digest-footer { padding: 14px 16px !important; }
    .digest-channel-title { padding-top: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${THEME.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${THEME.bg};">
  <tr><td align="center" class="digest-shell" style="padding:28px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${THEME.card};border:1px solid ${THEME.border};overflow:hidden;">

      <!-- Header -->
      <tr><td class="digest-header" style="background:${THEME.primary};padding:26px 28px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:${THEME.primaryForeground};">${escHtml(title)}</h1>
        ${period ? `<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.82);">${escHtml(period)}</p>` : ""}
      </td></tr>

      <!-- Greeting -->
      <tr><td class="digest-greeting" style="padding:22px 28px 0;">
        <p style="margin:0;font-size:15px;color:${THEME.mutedStrong};">
          ${recipientName ? `你好，${escHtml(recipientName)}，` : ""}本期共收录 <strong style="color:${THEME.foreground};font-weight:600;">${totalCount}</strong> 篇文章。
        </p>
      </td></tr>

      <!-- Channels -->
      <tr><td class="digest-channels" style="padding:8px 28px 22px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${channelBlocks}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td class="digest-footer" style="background:${THEME.cardElevated};padding:18px 28px;border-top:1px solid ${THEME.border};text-align:center;">
        <p style="margin:0;font-size:12px;color:${THEME.muted};">
          由 <a href="${escHtml(appUrl)}" style="color:${THEME.primaryHover};text-decoration:none;">${escHtml(PRODUCT_NAME)}</a> 自动生成 · <a href="${escHtml(appUrl)}/me" style="color:${THEME.muted};">账户设置</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** 从 DigestOptions 生成纯文本版本（邮件客户端降级展示用） */
export function renderDigestText(opts: DigestOptions): string {
  const lines: string[] = [`${opts.title}`, opts.period ?? "", ""];
  for (const ch of opts.channels.filter((c) => c.items.length > 0)) {
    lines.push(`【${ch.title}】`);
    for (const item of ch.items) {
      lines.push(`  • ${item.title}`);
      lines.push(`    ${item.url}`);
      if (item.summary) lines.push(`    ${item.summary.slice(0, 120)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
