export const id = "kognic-articles";
export const name = "Kognic Articles";
export const listUrlPattern = /^https:\/\/(?:www\.)?kognic\.com\/articles\/?(?:\?.*)?$/i;
export const refreshInterval = "1h";

let _deps;

const KOGNIC_ORIGIN = "https://www.kognic.com";
const RSS_UA = "RssAny/1.0 (+https://github.com/joohw/rssany)";
const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function hashGuid(input) {
  return _deps.createHash("sha256").update(input).digest("hex");
}

function resolveHttpUrl(rawHref, baseUrl) {
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

function isKognicArticleUrl(link) {
  try {
    const url = new URL(link);
    if (!/(^|\.)kognic\.com$/i.test(url.hostname)) return false;
    return /^\/articles\/[^/?#]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function toValidDate(raw, fallback = new Date()) {
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseListDate(raw) {
  const text = normalizeText(raw);
  const m = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
  const year = Number(m[3]);
  if (!Number.isFinite(day) || month == null || !Number.isFinite(year)) return undefined;
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function extractAuthor(raw) {
  const text = normalizeText(raw);
  if (!text) return undefined;
  const paren = text.match(/\(([^()]+)\)\s*$/);
  const author = normalizeText(paren?.[1] ?? text.replace(/\S+@\S+/g, ""));
  return author ? [author] : undefined;
}

function removeTrackingNodes(root) {
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") || "";
    if (src.includes("track.hubspot.com/__ptq.gif")) img.remove();
  }
}

function cleanHtml(html) {
  if (typeof html !== "string" || !html.trim()) return undefined;
  const root = _deps.parseHtml(html);
  removeTrackingNodes(root);
  const out = normalizeText(root.toString());
  return out || undefined;
}

function textFromHtml(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  const root = _deps.parseHtml(html);
  removeTrackingNodes(root);
  return normalizeText(root.textContent);
}

function extractImageUrlFromHtml(html, baseUrl) {
  if (typeof html !== "string" || !html) return undefined;
  const root = _deps.parseHtml(html);
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") || "";
    if (src.includes("track.hubspot.com/__ptq.gif")) continue;
    const url = resolveHttpUrl(src, baseUrl);
    if (url) return url;
  }
  return undefined;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function collectCategories(item) {
  const raw = Array.isArray(item.categories)
    ? item.categories
    : Array.isArray(item.category)
      ? item.category
      : item.category != null
        ? [item.category]
        : [];
  const seen = new Set();
  const out = [];
  for (const value of raw) {
    const text = normalizeText(String(value ?? ""));
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.length > 0 ? out : undefined;
}

function rssFeedUrl(sourceId) {
  try {
    const url = new URL(sourceId, KOGNIC_ORIGIN);
    url.pathname = "/articles/rss.xml";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return `${KOGNIC_ORIGIN}/articles/rss.xml`;
  }
}

async function fetchFeedXml(sourceId, ctx) {
  const feedUrl = rssFeedUrl(sourceId);
  const { html, status } = await ctx.fetchHtml(feedUrl, {
    waitMs: 800,
    purify: false,
    useHttpResponseBody: true,
  });
  if (status !== 200 && status !== 304) {
    throw new Error(`[kognic-articles] RSS returned HTTP ${status}: ${feedUrl}`);
  }
  return { xml: html, feedUrl };
}

function mapFeedItem(item, feedUrl) {
  const link = resolveHttpUrl(firstString(item.link, item.guid), feedUrl);
  if (!link || !isKognicArticleUrl(link)) return null;

  const title = firstString(item.title);
  if (!title) return null;

  const html = firstString(item.encoded, item.content, item.summary);
  const summary = firstString(item.contentSnippet) || textFromHtml(firstString(item.summary, item.content));
  const imageUrl = extractImageUrlFromHtml(html, link);
  const pubDate = toValidDate(firstString(item.pubDate, item.isoDate, item.dcDate));
  const author = extractAuthor(firstString(item.creator, item.author));
  const categories = collectCategories(item);

  const out = {
    guid: hashGuid(link),
    title,
    link,
    pubDate,
    author,
    summary: summary || undefined,
    content: cleanHtml(html),
    categories,
  };
  if (!imageUrl) return out;
  return { ...out, imageUrl, cover_img: imageUrl };
}

async function fetchRssItems(sourceId, ctx) {
  const { xml, feedUrl } = await fetchFeedXml(sourceId, ctx);
  const parser = new _deps.RssParser({
    timeout: 30_000,
    headers: {
      "User-Agent": RSS_UA,
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
    customFields: {
      item: [
        ["content:encoded", "encoded"],
        ["dc:date", "dcDate"],
        ["category", "category", { keepArray: true }],
      ],
    },
  });
  const feed = await parser.parseString(xml);
  const seen = new Set();
  const items = [];
  for (const raw of feed.items ?? []) {
    const item = mapFeedItem(raw, feedUrl);
    if (!item || seen.has(item.link)) continue;
    seen.add(item.link);
    items.push(item);
  }
  return items;
}

function parseHtmlItems(root, baseUrl) {
  const seen = new Set();
  const items = [];
  for (const card of root.querySelectorAll(".post-wrapper")) {
    const link = resolveHttpUrl(card.querySelector("a.link-wrapper[href]")?.getAttribute("href"), baseUrl);
    if (!link || !isKognicArticleUrl(link) || seen.has(link)) continue;

    const title = normalizeText(card.querySelector(".img-title")?.textContent);
    if (!title) continue;

    const summary = normalizeText(card.querySelector(".post-description")?.textContent);
    const pubDate = parseListDate(card.querySelector(".date")?.textContent) ?? new Date();
    const categories = card
      .querySelectorAll(".tag")
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);

    seen.add(link);
    items.push({
      guid: hashGuid(link),
      title,
      link,
      pubDate,
      author: ["Kognic"],
      summary: summary || undefined,
      categories: categories.length > 0 ? categories : undefined,
    });
  }
  return items;
}

async function fetchHtmlItems(sourceId, ctx) {
  const { html, finalUrl, status } = await ctx.fetchHtml(sourceId, {
    waitMs: 2500,
    waitForSelector: ".post-wrapper",
    waitForSelectorTimeoutMs: 10_000,
  });
  if (status !== 200 && status !== 304) {
    throw new Error(`[kognic-articles] HTML returned HTTP ${status}: ${sourceId}`);
  }
  const root = _deps.parseHtml(html);
  return parseHtmlItems(root, finalUrl || sourceId || KOGNIC_ORIGIN);
}

export async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;

  try {
    const fromRss = await fetchRssItems(sourceId, ctx);
    if (fromRss.length > 0) return fromRss;
  } catch {
    // Fall back to the listing page when HubSpot RSS is unavailable.
  }

  const fromHtml = await fetchHtmlItems(sourceId, ctx);
  if (fromHtml.length === 0) {
    throw new Error("[kognic-articles] no article items parsed; page structure may have changed");
  }
  return fromHtml;
}
