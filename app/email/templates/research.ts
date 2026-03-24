// Research 邮件模板：将 markdown 格式的研究报告渲染为 HTML 邮件

import { marked } from "marked";
import { PRODUCT_NAME } from "../../config/brand.js";

export interface ResearchReportOptions {
  title: string;
  markdown: string;
  recipientName?: string | null;
  generatedAt?: string;
  appUrl?: string;
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderResearch(opts: ResearchReportOptions): Promise<string> {
  const { title, markdown, recipientName, generatedAt, appUrl = "" } = opts;

  // marked 将 markdown 转为 HTML
  const contentHtml = await marked.parse(markdown, { gfm: true });

  const timeStr = generatedAt
    ? new Date(generatedAt).toLocaleString("zh-CN", { dateStyle: "long", timeStyle: "short" })
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>
  body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .prose{color:#222;line-height:1.7;font-size:15px;}
  .prose h1,.prose h2,.prose h3{margin-top:1.5em;margin-bottom:.5em;font-weight:700;}
  .prose h1{font-size:22px;border-bottom:2px solid #e5e7eb;padding-bottom:.3em;}
  .prose h2{font-size:18px;}
  .prose h3{font-size:15px;}
  .prose p{margin:.8em 0;}
  .prose ul,.prose ol{margin:.8em 0;padding-left:1.5em;}
  .prose li{margin:.3em 0;}
  .prose blockquote{margin:.8em 0;padding:.5em 1em;border-left:4px solid #2563eb;background:#f0f4ff;color:#444;border-radius:0 6px 6px 0;}
  .prose a{color:#2563eb;text-decoration:none;}
  .prose strong{font-weight:700;}
  .prose code{background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:13px;font-family:monospace;}
  .prose pre{background:#1e1e1e;color:#cdd3de;padding:16px;border-radius:8px;overflow-x:auto;}
  .prose pre code{background:none;color:inherit;padding:0;}
  .prose table{width:100%;border-collapse:collapse;margin:.8em 0;}
  .prose th{background:#f0f4ff;text-align:left;padding:8px 12px;border:1px solid #ddd;}
  .prose td{padding:8px 12px;border:1px solid #ddd;}
  .prose tr:nth-child(even){background:#fafafa;}
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">${escHtml(title)}</h1>
        ${timeStr ? `<p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.75);">生成于 ${escHtml(timeStr)}</p>` : ""}
        ${recipientName ? `<p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.65);">专属报告：${escHtml(recipientName)}</p>` : ""}
      </td></tr>

      <!-- Content -->
      <tr><td style="padding:32px;" class="prose">
        <div class="prose">${contentHtml}</div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;font-size:12px;color:#999;">
          由 <a href="${escHtml(appUrl)}" style="color:#2563eb;text-decoration:none;">${escHtml(PRODUCT_NAME)}</a> AI 研究助手自动生成 · <a href="${escHtml(appUrl)}/me" style="color:#999;">账户设置</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
