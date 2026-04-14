// 内置 RSS/Atom/JSON Feed：通过浏览器（Puppeteer）拉取 Feed URL，再用 rss-parser 解析；
// 与站点插件一致走 Chrome，便于应对需浏览器环境或代理的场景；XML 使用 HTTP 响应原文（useHttpResponseBody）。

const UA = "RssAny/1.0 (+https://github.com/joohw/rssany)";

const IMAGE_TYPE_RE = /^image\//i;
const IMAGE_EXT_IN_PATH_RE = /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|#|$)/i;

function trimUrl(s) {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t || undefined;
}

/** rss-parser 常把多位作者压成一段逗号（或中文逗号）分隔文本，拆成数组入库。 */
function authorsFromCommaText(authorRaw) {
  if (typeof authorRaw !== "string") return undefined;
  const parts = authorRaw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/** 从 rss-parser 条目上尽量取出配图 URL（入库用 imageUrl，与 Gateway 的 cover_img 对齐）。 */
function extractItemImageUrl(item) {
  const enc = item.enclosure;
  if (enc && typeof enc.url === "string") {
    const u = trimUrl(enc.url);
    const t = typeof enc.type === "string" ? enc.type : "";
    if (u && (IMAGE_TYPE_RE.test(t) || (!t && IMAGE_EXT_IN_PATH_RE.test(u)))) {
      return u;
    }
  }

  const itunesImg = item.itunes && typeof item.itunes.image === "string" ? item.itunes.image : undefined;
  const fromItunes = trimUrl(itunesImg);
  if (fromItunes) return fromItunes;

  const thumbs = item.mediaThumbnail;
  if (Array.isArray(thumbs) && thumbs[0]?.$) {
    const u = trimUrl(thumbs[0].$.url ?? thumbs[0].$.href);
    if (u) return u;
  }

  const mediaBlocks = item.mediaContent;
  if (Array.isArray(mediaBlocks)) {
    for (const block of mediaBlocks) {
      const $ = block && block.$;
      if (!$ || typeof $.url !== "string") continue;
      const medium = $.medium;
      const ctype = typeof $.type === "string" ? $.type : "";
      if (medium === "image" || IMAGE_TYPE_RE.test(ctype)) {
        const u = trimUrl($.url);
        if (u) return u;
      }
    }
  }

  const atomLinks = item.atomLinks;
  if (Array.isArray(atomLinks)) {
    for (const l of atomLinks) {
      const $ = l && l.$;
      if (!$ || typeof $.href !== "string") continue;
      const rel = String($.rel || "").toLowerCase();
      const ctype = String($.type || "").toLowerCase();
      if (rel === "enclosure" && ctype.startsWith("image/")) {
        const u = trimUrl($.href);
        if (u) return u;
      }
    }
  }

  const fromHtml =
    firstImgSrcFromHtml(item.content) ||
    firstImgSrcFromHtml(item.summary) ||
    firstImgSrcFromHtml(item["content:encoded"]) ||
    firstImgSrcFromHtml(item.contentSnippet);
  if (fromHtml && /^https?:\/\//i.test(fromHtml)) {
    return fromHtml;
  }

  return undefined;
}

function firstImgSrcFromHtml(html) {
  if (typeof html !== "string" || !html) return undefined;
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? trimUrl(m[1]) : undefined;
}

async function fetchFeedXml(url, ctx) {
  const fetchHtml = ctx.fetchHtml;
  if (typeof fetchHtml !== "function") {
    throw new Error("RSS 插件需要 ctx.fetchHtml（请通过 feeder / buildSourceContext 调用）");
  }
  const { html } = await fetchHtml(url, {
    waitMs: 800,
    purify: false,
    useHttpResponseBody: true,
  });
  return html;
}

export default {
  id: "__rss__",
  pattern: /^https?:\/\//,
  match: looksLikeFeed,
  priority: 20,
  refreshInterval: "1h",
  async fetchItems(sourceId, ctx) {
    const { deps } = ctx;
    const xml = await fetchFeedXml(sourceId, ctx);
    const parser = new deps.RssParser({
      timeout: 30_000,
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/atom+xml,application/json,application/xml,text/xml,*/*",
      },
      customFields: {
        item: [
          ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
          ["media:content", "mediaContent", { keepArray: true }],
          ["link", "atomLinks", { keepArray: true }],
        ],
      },
    });
    const feed = await parser.parseString(xml);
    return (feed.items ?? []).map((item) => {
      const link = item.link ?? item.guid ?? sourceId;
      const guid = item.guid ?? deps.createHash("sha256").update(link).digest("hex");
      const pubDate =
        item.pubDate != null
          ? new Date(item.pubDate)
          : item.isoDate != null
            ? new Date(item.isoDate)
            : new Date();
      const authorRaw =
        typeof item.creator === "string" ? item.creator : typeof item.author === "string" ? item.author : undefined;
      const author = authorsFromCommaText(authorRaw);
      const summary =
        typeof item.summary === "string" ? item.summary : typeof item.contentSnippet === "string" ? item.contentSnippet : undefined;
      const content =
        typeof item.content === "string" ? item.content : typeof item["content:encoded"] === "string" ? item["content:encoded"] : undefined;
      const imageUrl = extractItemImageUrl(item);
      const base = {
        guid,
        title: item.title ?? "",
        link,
        pubDate,
        author,
        summary,
        content,
      };
      if (!imageUrl) return base;
      return { ...base, imageUrl, cover_img: imageUrl };
    });
  },
};

function looksLikeFeed(url) {
  const lower = url.toLowerCase();
  return (
    lower.includes("/feed") ||
    lower.includes("/rss") ||
    lower.includes("/atom") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".rss") ||
    lower.endsWith(".atom") ||
    lower.includes("format=rss") ||
    lower.includes("format=atom") ||
    lower.includes("output=rss")
  );
}
