// Research 邮件模板：将 markdown 格式的研究报告渲染为 HTML 邮件
// 视觉与 webui/src/app.css 的 Linear 深色主题、digest 邮件一致

import { marked } from "marked";
import { PRODUCT_NAME } from "../../config/brand.js";

const THEME = {
  bg: "#08090a",
  card: "#0c0c0e",
  cardElevated: "#111113",
  primary: "#5e6ad2",
  primaryHover: "#7c85e8",
  primaryLight: "rgba(94, 106, 210, 0.15)",
  primaryForeground: "#ffffff",
  foreground: "#ececed",
  muted: "#8b8e98",
  mutedStrong: "#b4b8c2",
  border: "rgba(255,255,255,0.1)",
  codeBg: "rgba(255,255,255,0.06)",
} as const;

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
  body{margin:0;padding:0;background:${THEME.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .prose{color:${THEME.foreground};line-height:1.7;font-size:15px;}
  .prose h1,.prose h2,.prose h3{margin-top:1.5em;margin-bottom:.5em;font-weight:700;color:${THEME.foreground};}
  .prose h1{font-size:22px;border-bottom:1px solid ${THEME.border};padding-bottom:.3em;}
  .prose h2{font-size:18px;}
  .prose h3{font-size:15px;color:${THEME.mutedStrong};}
  .prose p{margin:.8em 0;color:${THEME.mutedStrong};}
  .prose ul,.prose ol{margin:.8em 0;padding-left:1.5em;}
  .prose li{margin:.3em 0;}
  .prose blockquote{margin:.8em 0;padding:.5em 1em;border-left:3px solid ${THEME.primary};background:${THEME.primaryLight};color:${THEME.mutedStrong};}
  .prose a{color:${THEME.primaryHover};text-decoration:none;}
  .prose strong{font-weight:700;color:${THEME.foreground};}
  .prose code{background:${THEME.codeBg};padding:2px 5px;font-size:13px;font-family:monospace;}
  .prose pre{background:#111113;color:#cdd3de;padding:16px;overflow-x:auto;border:1px solid ${THEME.border};}
  .prose pre code{background:none;color:inherit;padding:0;}
  .prose table{width:100%;border-collapse:collapse;margin:.8em 0;}
  .prose th{background:${THEME.cardElevated};text-align:left;padding:8px 12px;border:1px solid ${THEME.border};color:${THEME.foreground};}
  .prose td{padding:8px 12px;border:1px solid ${THEME.border};color:${THEME.mutedStrong};}
  .prose tr:nth-child(even){background:${THEME.codeBg};}
  @media only screen and (max-width:480px){
    .research-shell{padding:12px 8px!important;}
    .research-header{padding:18px 16px!important;}
    .research-body{padding:16px!important;}
    .research-footer{padding:14px 16px!important;}
  }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${THEME.bg};">
  <tr><td align="center" class="research-shell" style="padding:28px 16px;">
    <table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:${THEME.card};border:1px solid ${THEME.border};overflow:hidden;">

      <!-- Header -->
      <tr><td class="research-header" style="background:${THEME.primary};padding:26px 28px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:${THEME.primaryForeground};">${escHtml(title)}</h1>
        ${timeStr ? `<p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.82);">生成于 ${escHtml(timeStr)}</p>` : ""}
        ${recipientName ? `<p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.72);">专属报告：${escHtml(recipientName)}</p>` : ""}
      </td></tr>

      <!-- Content -->
      <tr><td class="research-body" style="padding:28px;">
        <div class="prose">${contentHtml}</div>
      </td></tr>

      <!-- Footer -->
      <tr><td class="research-footer" style="background:${THEME.cardElevated};padding:18px 28px;border-top:1px solid ${THEME.border};text-align:center;">
        <p style="margin:0;font-size:12px;color:${THEME.muted};">
          由 <a href="${escHtml(appUrl)}" style="color:${THEME.primaryHover};text-decoration:none;">${escHtml(PRODUCT_NAME)}</a> AI 研究助手自动生成 · <a href="${escHtml(appUrl)}/me" style="color:${THEME.muted};">账户设置</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
