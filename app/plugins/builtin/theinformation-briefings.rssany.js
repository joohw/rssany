export const id = "theinformation";
export const name = "Theinformation";
export const listUrlPattern = /^https:\/\/(www\.)?theinformation\.com\/(briefings|features\/[^/]+)\/?(\?.*)?$/i;
export const refreshInterval = "1h";

let _deps;

// The Information — AI Agenda 和 Briefings 列表页
// 当前结构：.article.feed-item，标题 h3.title a，分类 .category-content a，作者 .authors，摘要 .recent-excerpt .long-excerpt

const ORIGIN = "https://www.theinformation.com";

function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}


function hashGuid(input) {
  return _deps.createHash("sha256").update(input).digest("hex");
}


function toAbsoluteHttpUrl(rawHref, baseUrl) {
  if (!rawHref) return null;
  const href = rawHref.trim();
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
  try {
    const url = new URL(href, baseUrl);
    if (!/^https:$/i.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}


function pad2(n) {
  return String(n).padStart(2, "0");
}


/** .authors 文本：By Author · Apr 14, 2026 · 7:52am PDT */
function parseAuthorsDate(raw) {
  let t = normalizeText(raw);
  t = t.replace(/\s*·\s*\d+\s+comments?\s*$/i, "").trim();

  const m = t.match(
    /^By\s+(.+?)\s*·\s*(.+?\d{4})\s*·\s*(\d{1,2}:\d{2}\s*(?:am|pm))\s*(PDT|PST|PT)\s*$/i
  );
  if (m) {
    const author = m[1].trim();
    const datePart = m[2].trim();
    const timePart = m[3].trim();
    const tz = m[4].toUpperCase();
    const offset = tz === "PDT" ? "-07:00" : "-08:00";

    const hm = timePart.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    const d0 = new Date(datePart);
    if (hm && !Number.isNaN(d0.getTime())) {
      let h = Number(hm[1]);
      const min = Number(hm[2]);
      const ap = hm[3].toLowerCase();
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      const y = d0.getFullYear();
      const mo = d0.getMonth() + 1;
      const da = d0.getDate();
      const iso = `${y}-${pad2(mo)}-${pad2(da)}T${pad2(h)}:${pad2(min)}:00${offset}`;
      const pubDate = new Date(iso);
      if (!Number.isNaN(pubDate.getTime())) return { author, pubDate };
    }
  }

  const authorMatch = t.match(/^By\s+(.+?)\s*·/i);
  const author = authorMatch ? authorMatch[1].trim() : undefined;
  const dateStr = t.replace(/^By\s+.*?\s*·\s*/, "").trim();
  const pubDate = new Date(dateStr);
  return { author, pubDate: Number.isNaN(pubDate.getTime()) ? new Date() : pubDate };
}


function parseFeedItems(html, pageUrl) {
  const root = _deps.parseHtml(html);
  const items = [];
  const seen = new Set();

  for (const node of root.querySelectorAll(".article.feed-item")) {
    const linkEl = node.querySelector("h3.title a[href]");
    if (!linkEl) continue;

    const title = normalizeText(linkEl.textContent);
    const link = toAbsoluteHttpUrl(linkEl.getAttribute("href"), pageUrl);
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);

    const authorsText = normalizeText(node.querySelector(".authors")?.textContent ?? "");
    const { author, pubDate } = parseAuthorsDate(authorsText);

    const summary = normalizeText(
      node.querySelector(".recent-excerpt .long-excerpt")?.textContent ??
      node.querySelector(".recent-excerpt")?.textContent ??
      node.querySelector(".short-excerpt")?.textContent ??
      ""
    ) || undefined;

    const categoryEl = node.querySelector(".category-content a");
    const category = categoryEl ? normalizeText(categoryEl.textContent) : undefined;

    items.push({
      guid: hashGuid(link),
      title,
      link,
      pubDate,
      author,
      summary,
      categories: category ? [category] : undefined,
    });
  }

  return items;
}


export async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html, finalUrl, status } = await ctx.fetchHtml(sourceId, {
    waitMs: 5000,
    waitForSelector: ".article.feed-item",
    waitForSelectorTimeoutMs: 25_000,
  });

  const pageUrl = finalUrl || sourceId || ORIGIN;
  const items = parseFeedItems(html, pageUrl);

  if (items.length === 0) {
    const hint = status && status >= 400 ? ` HTTP ${status}` : "";
    throw new Error(
      `[theinformation] 未解析到条目，页面结构可能已变化或需登录后抓取。${hint}`
    );
  }

  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  return items;
}
