// 美团技术团队博客：https://tech.meituan.com/
// 列表页解析 .post-container，可选 enrichItem 拉取正文

import { parse } from "node-html-parser";
import { createHash } from "node:crypto";

function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(href, baseUrl) {
  if (!href) return null;
  try {
    const url = new URL(href, baseUrl);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** 解析 "2026年03月13日" 或 "2026-03-13" */
function parseDate(text) {
  const raw = normalizeText(text);
  const m = raw.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (!m) return undefined;
  const [, y, mon, d] = m;
  const iso = `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function hashGuid(link) {
  return createHash("sha256").update(link).digest("hex");
}

async function fetchItems(sourceId, ctx) {
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
    waitMs: 5000,
    waitForSelector: ".post-container",
    waitForSelectorTimeoutMs: 25000,
  });
  const root = parse(html);
  const baseUrl = finalUrl || sourceId;

  const items = [];
  const seen = new Set();

  // 兼容 .row.post-container-wrapper > .col-md-6 > .post-container 或直接 .post-container
  let containers = root.querySelectorAll(".post-container");
  if (containers.length === 0) {
    containers = root.querySelectorAll(".post-container-wrapper .post-container");
  }
  for (const el of containers) {
    const titleEl = el.querySelector(".post-title a[href]");
    let href = titleEl?.getAttribute("href");
    if (!href) {
      const moreLink = el.querySelector("a.more-link[href]");
      if (moreLink) href = moreLink.getAttribute("href");
    }
    if (!href) continue;

    const link = toAbsoluteUrl(href, baseUrl);
    if (!link) continue;
    try {
      const u = new URL(link);
      if (!u.hostname.endsWith("tech.meituan.com")) continue;
    } catch {
      continue;
    }
    if (seen.has(link)) continue;
    seen.add(link);

    const title = normalizeText(titleEl?.textContent) || normalizeText(el.querySelector(".post-title")?.textContent);
    if (!title) continue;

    const dateEl = el.querySelector(".m-post-date");
    const pubDate = parseDate(dateEl?.textContent) ?? new Date();

    const authorEl = el.querySelector(".m-post-nick");
    const authorRaw = normalizeText(authorEl?.textContent);
    const author = authorRaw ? [authorRaw] : undefined;

    const summaryEl = el.querySelector(".post-content.post-expect");
    let summary = "";
    if (summaryEl) {
      const clone = summaryEl.clone();
      const moreLink = clone.querySelector("a.more-link");
      if (moreLink) moreLink.remove();
      summary = normalizeText(clone.textContent);
    }

    const tagLinks = el.querySelectorAll(".tag-links a[rel='tag']");
    const categories = tagLinks.length
      ? Array.from(tagLinks).map((a) => normalizeText(a.textContent)).filter(Boolean)
      : undefined;

    items.push({
      guid: hashGuid(link),
      title,
      link,
      pubDate,
      author,
      summary: summary || undefined,
      categories,
      sourceRef: sourceId,
    });
  }

  if (items.length === 0) {
    throw new Error("[meituan-tech] 未解析到文章条目，请检查列表页结构是否变化");
  }

  return items;
}

/** 可选：拉取详情页正文，使用默认 Readability 提取 */
async function enrichItem(item, ctx) {
  return ctx.extractItem(item);
}

export default {
  id: "meituan-tech",
  listUrlPattern: /^https?:\/\/(www\.)?tech\.meituan\.com(\/.*)?$/i,
  detailUrlPattern: /^https?:\/\/(www\.)?tech\.meituan\.com\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html(?:\?.*)?$/i,
  refreshInterval: "1day",
  fetchItems,
  enrichItem,
};
