// 内置 RSS/Atom/JSON Feed：通过浏览器（Puppeteer）拉取 Feed URL，再用 rss-parser 解析；
// 与站点插件一致走 Chrome，便于应对需浏览器环境或代理的场景；XML 使用 HTTP 响应原文（useHttpResponseBody）。
export const id = "__rss__";
export const name = "RSS Feed";
export const pattern = /^https:\/\//;
export const match = looksLikeFeed;
export const priority = 20;
export const refreshInterval = "1h";

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
  if (fromHtml && /^https:\/\//i.test(fromHtml)) {
    return fromHtml;
  }

  return undefined;
}

function firstImgSrcFromHtml(html) {
  if (typeof html !== "string" || !html) return undefined;
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? trimUrl(m[1]) : undefined;
}

function looksLikeFeedDocument(text) {
  return /^\s*(?:<\?[\s\S]*?\?>\s*)*(?:<!DOCTYPE[^>]*>\s*)?<(?:rss|feed|rdf:RDF)\b/i.test(text);
}

async function fetchFeedXml(url, ctx) {
  // 无代理时优先直接请求 Feed 原文，避免 Chrome 把 XML 渲染成预览页或长期等待 load。
  if (!ctx.proxy && typeof fetch === "function") {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: "application/rss+xml,application/atom+xml,application/json,application/xml,text/xml,*/*",
        },
      });
      if (response.ok) {
        const raw = await response.text();
        if (looksLikeFeedDocument(raw)) return raw;
      }
    } catch {
      // 直接请求失败后仍走浏览器路径，保留 cookies 与站点兼容能力。
    }
  }

  const fetchHtml = ctx.fetchHtml;
  if (typeof fetchHtml !== "function") {
    throw new Error("RSS 插件需要 ctx.fetchHtml（请通过 feeder / buildSourceContext 调用）");
  }
  const { html } = await fetchHtml(url, {
    waitMs: 800,
    purify: false,
    useHttpResponseBody: true,
  });
  if (looksLikeFeedDocument(html)) {
    return html;
  }

  return html;
}

/** arXiv 的分类 RSS 在周末/无新增日会返回合法但无 item 的 Feed；此时从官方 API 补最近投稿。 */
function arxivApiFallbackUrl(sourceId) {
  try {
    const url = new URL(sourceId);
    if (url.hostname !== "rss.arxiv.org") return null;
    const match = url.pathname.match(/^\/rss\/([a-z-]+\.[a-z-]+)$/i);
    if (!match) return null;
    const category = match[1];
    const query = new URLSearchParams({
      search_query: `cat:${category}`,
      start: "0",
      max_results: "50",
      sortBy: "submittedDate",
      sortOrder: "descending",
    });
    return `https://export.arxiv.org/api/query?${query.toString()}`;
  } catch {
    return null;
  }
}

function parserOptions(xml2js) {
  return {
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
    ...(xml2js ? { xml2js } : {}),
  };
}

/** 默认严格解析；仅 XML 格式错误时用 sax 宽松模式重试，兼容正文 HTML 标签不平衡的 Feed。 */
async function parseFeedXml(xml, sourceId, deps) {
  try {
    return await new deps.RssParser(parserOptions()).parseString(xml);
  } catch (strictError) {
    deps.logger?.warn?.("scraper", "RSS 严格 XML 解析失败，尝试宽松模式", {
      source_url: sourceId,
      err: strictError instanceof Error ? strictError.message : String(strictError),
    });
    const looseOptions = {
      strict: false,
      normalizeTags: true,
      attrNameProcessors: [(name) => name.toLowerCase()],
    };
    try {
      return await new deps.RssParser(parserOptions(looseOptions)).parseString(xml);
    } catch (looseError) {
      throw new Error(
        `RSS 解析失败（严格与宽松模式均失败）: ${
          looseError instanceof Error ? looseError.message : String(looseError)
        }`,
        { cause: strictError },
      );
    }
  }
}

export async function fetchItems(sourceId, ctx) {
    const { deps } = ctx;
    const xml = await fetchFeedXml(sourceId, ctx);
    let feed = await parseFeedXml(xml, sourceId, deps);
    if ((feed.items?.length ?? 0) === 0) {
      const fallbackUrl = arxivApiFallbackUrl(sourceId);
      if (fallbackUrl) {
        const fallbackXml = await fetchFeedXml(fallbackUrl, ctx);
        feed = await parseFeedXml(fallbackXml, fallbackUrl, deps);
      }
    }
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
  }

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
