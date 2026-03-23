// Digest 邮件模板：按频道分组列出近期文章，适合日报/周报摘要

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
          <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
            ${item.image_url ? `<img src="${escHtml(item.image_url)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:6px;float:right;margin-left:12px;" />` : ""}
            <a href="${escHtml(item.url)}" style="font-size:15px;font-weight:600;color:#111;text-decoration:none;line-height:1.4;display:block;margin-bottom:4px;">${escHtml(item.title)}</a>
            ${item.summary ? `<p style="margin:0 0 4px;font-size:13px;color:#555;line-height:1.5;">${escHtml(item.summary.slice(0, 200))}${item.summary.length > 200 ? "…" : ""}</p>` : ""}
            <span style="font-size:12px;color:#999;">${formatDate(item.pub_date)}</span>
            <div style="clear:both;"></div>
          </td>
        </tr>`).join("");

      return `
        <tr><td style="padding:24px 0 8px;">
          <h2 style="margin:0;font-size:17px;font-weight:700;color:#333;border-left:3px solid #2563eb;padding-left:10px;">${escHtml(ch.title)}</h2>
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
        </td></tr>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr><td style="background:#2563eb;padding:28px 32px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${escHtml(title)}</h1>
        ${period ? `<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.8);">${escHtml(period)}</p>` : ""}
      </td></tr>

      <!-- Greeting -->
      <tr><td style="padding:24px 32px 0;">
        <p style="margin:0;font-size:15px;color:#444;">
          ${recipientName ? `你好，${escHtml(recipientName)}，` : ""}本期共收录 <strong>${totalCount}</strong> 篇文章。
        </p>
      </td></tr>

      <!-- Channels -->
      <tr><td style="padding:8px 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${channelBlocks}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;font-size:12px;color:#999;">
          由 <a href="${escHtml(appUrl)}" style="color:#2563eb;text-decoration:none;">RssAny</a> 自动生成 · <a href="${escHtml(appUrl)}/settings/email-reports" style="color:#999;">管理订阅</a>
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
