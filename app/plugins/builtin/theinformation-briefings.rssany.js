let _deps;

// The Information — Briefings 列表页：https://www.theinformation.com/briefings
// 结构：.content-feed .article.briefing.feed-item，标题 h3.title a，摘要 .briefing-dek，时间 .authors

const ORIGIN = "https://www.theinformation.com";
const LIST_URL_RE =
  /^https?:\/\/(www\.)?theinformation\.com\/briefings\/?(\?.*)?$/i;


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
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}


function pad2(n) {
  return String(n).padStart(2, "0");
}


/** .authors 文本：Apr 14, 2026 · 5:41am PDT（可含 · 1 comment）；Node 不能可靠解析 PDT 缩写，手动换算 offset */
function parseBriefingAuthorsDate(raw) {
  let t = normalizeText(raw);
  t = t.replace(/\s*·\s*\d+\s+comments?\s*$/i, "").trim();

  const m = t.match(
    /^(.+?\d{4})\s*·\s*(\d{1,2}:\d{2}\s*(?:am|pm))\s*(PDT|PST|PT)\s*$/i
  );
  if (m) {
    const datePart = m[1].trim();
    const timePart = m[2].trim();
    const tz = m[3].toUpperCase();
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
      const out = new Date(iso);
      if (!Number.isNaN(out.getTime())) return out;
    }
  }

  const first = t.split("·")[0].trim();
  const fallback = new Date(first);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}


function parseBriefingItems(html, pageUrl) {
  const root = _deps.parseHtml(html);
  const items = [];
  const seen = new Set();

  for (const node of root.querySelectorAll(".content-feed .article.briefing.feed-item")) {
    const linkEl = node.querySelector("h3.title a[href]");
    if (!linkEl) continue;

    const title = normalizeText(linkEl.textContent);
    const link = toAbsoluteHttpUrl(linkEl.getAttribute("href"), pageUrl);
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);

    const authorsText = normalizeText(node.querySelector(".authors")?.textContent ?? "");
    const pubDate = parseBriefingAuthorsDate(authorsText);
    const summary = normalizeText(node.querySelector(".briefing-dek")?.textContent ?? "") || undefined;

    items.push({
      guid: hashGuid(link),
      title,
      link,
      pubDate,
      summary,
    });
  }

  return items;
}


async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html, finalUrl, status } = await ctx.fetchHtml(sourceId, {
    waitMs: 5000,
    waitForSelector: ".content-feed .article.briefing",
    waitForSelectorTimeoutMs: 25_000,
  });

  const pageUrl = finalUrl || sourceId || ORIGIN;
  const items = parseBriefingItems(html, pageUrl);

  if (items.length === 0) {
    const hint = status && status >= 400 ? ` HTTP ${status}` : "";
    throw new Error(
      `[theinformation-briefings] 未解析到条目，页面结构可能已变化或需登录后抓取。${hint}`
    );
  }

  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  return items;
}


export default {
  id: "theinformation-briefings",
  listUrlPattern: LIST_URL_RE,
  refreshInterval: "1h",
  fetchItems,
};
