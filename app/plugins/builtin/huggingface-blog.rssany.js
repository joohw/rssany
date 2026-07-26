export const id = "huggingface-blog";
export const name = "Hugging Face Blog";
export const listUrlPattern = /^https:\/\/huggingface\.co\/blog\/?(?:[?#].*)?$/i;
export const refreshInterval = "1h";

const FEED_URL = "https://huggingface.co/blog/feed.xml";
const USER_AGENT = "RssAny/1.0 (+https://github.com/joohw/rssany)";

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function validArticleUrl(value) {
  const link = normalizeText(value);
  try {
    const url = new URL(link);
    return url.protocol === "https:" &&
      url.hostname === "huggingface.co" &&
      /^\/blog\/[^/?#]+(?:\/[^/?#]+)?\/?$/.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function parseDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stripHtml(value) {
  return normalizeText(typeof value === "string" ? value.replace(/<[^>]*>/g, " ") : "");
}

export function mapFeedItems(feedItems, createHash) {
  const seen = new Set();
  const items = [];

  for (const item of feedItems ?? []) {
    const link = validArticleUrl(item.link ?? item.guid);
    if (!link || seen.has(link)) continue;

    const title = normalizeText(item.title);
    if (!title) continue;

    const published = parseDate(item.isoDate ?? item.pubDate);
    if (!published) continue;

    const author = normalizeText(item.creator ?? item.author) || undefined;
    const summary =
      normalizeText(item.contentSnippet) ||
      stripHtml(item.summary ?? item.content ?? item["content:encoded"]) ||
      undefined;

    seen.add(link);
    items.push({
      guid: createHash("sha256").update(link).digest("hex"),
      title,
      link,
      pubDate: published,
      author,
      summary,
    });
  }

  return items;
}

export async function fetchItems(_sourceId, ctx) {
  const parser = new ctx.deps.RssParser({
    timeout: 15_000,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
  });

  let feed;
  try {
    feed = await parser.parseURL(FEED_URL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[huggingface-blog] 抓取官方 RSS 失败: ${FEED_URL} (${message})`);
  }

  const items = mapFeedItems(feed.items, ctx.deps.createHash);
  if (items.length === 0) {
    throw new Error("[huggingface-blog] 官方 RSS 中未解析到有效文章");
  }
  return items;
}
