let _deps;

// X (Twitter) 站点插件：用户主页列表抓取与解析



const X_ORIGIN = "https://x.com";


function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return X_ORIGIN;
  }
}


function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}


function statusPathFromHref(href) {
  if (!href) return null;
  try {
    const normalized = href.startsWith("http") ? new URL(href).pathname : href.split("?")[0];
    const m = normalized.match(/^\/([A-Za-z0-9_]{1,32})\/status\/(\d+)/);
    if (!m) return null;
    return `/${m[1]}/status/${m[2]}`;
  } catch {
    return null;
  }
}


/** 非推文正文链接：头像区、分析页、单张图/视频子路径等，避免误当作主帖 ID */
function isAuxStatusSubpath(href) {
  return /\/status\/\d+\/(photo|video|analytics|likes|retweets|quotes)\b/i.test(href || "");
}


/**
 * 主帖路径：优先取时间戳旁 permalink（与 UI 一致），避免首条任意 /status/ 链到引用帖或图集子链。
 */
function extractPrimaryStatusPath(article) {
  const timeEl = article.querySelector("time[datetime]");
  if (timeEl) {
    const a = timeEl.closest("a[href*='/status/']");
    if (a) {
      const href = a.getAttribute("href") || "";
      if (!isAuxStatusSubpath(href)) {
        const p = statusPathFromHref(href);
        if (p) return p;
      }
    }
  }
  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    const href = a.getAttribute("href") || "";
    if (isAuxStatusSubpath(href)) continue;
    const p = statusPathFromHref(href);
    if (p) return p;
  }
  return null;
}


/** 引用/转推卡片内层 article 再解析会重复 guid，只处理时间轴最外层 tweet */
function isNestedTweetArticle(article) {
  let p = article.parentElement;
  while (p) {
    if (p.matches?.("article[data-testid='tweet']")) return true;
    p = p.parentElement;
  }
  return false;
}


function extractSocialContext(article) {
  const el = article.querySelector('[data-testid="socialContext"]');
  return normalizeText(el?.textContent);
}


/** 时间轴上「转推/转发」帖：socialContext 含 Repost/Retweet 或中文 */
function isRepostArticle(article) {
  const ctx = extractSocialContext(article);
  if (!ctx) return false;
  if (/reposted?|retweet/i.test(ctx)) return true;
  if (/转推|转发/.test(ctx)) return true;
  return false;
}


function normalizeTwimgUrl(src) {
  if (!src || typeof src !== "string") return src;
  try {
    const u = new URL(src, X_ORIGIN);
    if (u.hostname.includes("twimg.com") && u.pathname.includes("/media/")) {
      u.searchParams.set("format", "jpg");
      u.searchParams.set("name", "small");
    }
    return u.href;
  } catch {
    return src;
  }
}


/** 链接预览卡大图（card_img），与推文配图 /media/ 不同 */
function normalizeCardImgUrl(src) {
  if (!src || typeof src !== "string") return src;
  try {
    const u = new URL(src, X_ORIGIN);
    if (u.hostname.includes("twimg.com") && /\/card_img\//.test(u.pathname)) {
      if (!u.searchParams.has("format")) u.searchParams.set("format", "jpg");
      if (!u.searchParams.has("name")) u.searchParams.set("name", "small");
    }
    return u.href;
  } catch {
    return src;
  }
}


/**
 * 无 tweetText 时：从链接卡 aria-label（"domain.com 标题…"）或 small 卡正文取一行摘要
 */
function extractLinkCardSummary(article) {
  const a = article.querySelector('[data-testid="card.wrapper"] a[aria-label]');
  if (a) {
    const label = a.getAttribute("aria-label") || "";
    const idx = label.indexOf(" ");
    if (idx > 0) {
      const rest = normalizeText(label.slice(idx + 1));
      if (rest) return rest;
    }
  }
  const detail = article.querySelector('[data-testid="card.layoutSmall.detail"]');
  if (detail) {
    for (const el of detail.querySelectorAll(':scope > div[dir="auto"]')) {
      const t = normalizeText(el.textContent);
      if (t && t.length > 8 && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return t;
    }
  }
  return "";
}


/**
 * 首图：推文配图 > 视频 poster（blob 源无法持久化，仅 poster 可作缩略图）
 */
function extractMediaUrl(article) {
  for (const img of article.querySelectorAll('[data-testid="tweetPhoto"] img[src]')) {
    const src = img.getAttribute("src");
    if (!src || /profile_images/i.test(src)) continue;
    if (/pbs\.twimg\.com\/media/i.test(src) || /twimg\.com\/media/i.test(src)) {
      return normalizeTwimgUrl(src);
    }
  }
  const video = article.querySelector("video[poster]");
  if (video) {
    const poster = video.getAttribute("poster");
    if (poster && /^https?:\/\//i.test(poster)) return poster;
  }
  for (const img of article.querySelectorAll(
    '[data-testid="card.wrapper"] img[src*="twimg.com/card_img"], [data-testid="card.wrapper"] img[src*="pbs.twimg.com/card_img"]',
  )) {
    const src = img.getAttribute("src");
    if (src && /^https?:\/\//i.test(src) && !/profile_images/i.test(src)) {
      return normalizeCardImgUrl(src);
    }
  }
  for (const img of article.querySelectorAll('img[src*="pbs.twimg.com/media"], img[src*="twimg.com/media"]')) {
    const src = img.getAttribute("src");
    if (src && !/profile_images/i.test(src) && !img.closest('[data-testid="User-Name"]')) {
      return normalizeTwimgUrl(src);
    }
  }
  return undefined;
}


function extractAuthor(article, statusPath) {
  const nameBlock = article.querySelector('[data-testid="User-Name"]');
  if (nameBlock) {
    const profileAnchors = nameBlock.querySelectorAll('a[href^="/"]');
    for (const a of profileAnchors) {
      const href = a.getAttribute("href") || "";
      if (/^\/[A-Za-z0-9_]{1,32}$/.test(href)) return href.slice(1);
    }
    const text = normalizeText(nameBlock.textContent);
    const mention = text.match(/@([A-Za-z0-9_]{1,32})/);
    if (mention) return mention[1];
  }
  if (statusPath) {
    const m = statusPath.match(/^\/([A-Za-z0-9_]{1,32})\/status\/\d+$/);
    if (m) return m[1];
  }
  return undefined;
}


function extractTweetText(article) {
  const nodes = article.querySelectorAll('[data-testid="tweetText"]');
  const parts = [];
  for (const node of nodes) {
    const t = normalizeText(node.textContent);
    if (t) parts.push(t);
  }
  let body = parts.length ? parts.join("\n\n") : "";
  const hasShowMore = !!article.querySelector('[data-testid="tweet-text-show-more-link"]');
  if (!body) {
    body = extractLinkCardSummary(article);
  }
  if (!body) {
    body = hasShowMore ? "推文内容较长，请打开原文查看" : "";
  } else if (hasShowMore) {
    body = `${body} ...`;
  }
  if (!body) {
    const fallback = article.querySelector("[lang]");
    body = normalizeText(fallback?.textContent) || "";
  }
  return normalizeText(body);
}


function parseArticles(root, origin) {
  const entries = [];
  const seen = new Set();
  let articles = root.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length === 0) {
    articles = root.querySelectorAll('article[role="article"]');
  }
  for (const article of articles) {
    if (isNestedTweetArticle(article)) continue;
    const statusPath = extractPrimaryStatusPath(article);
    if (!statusPath || seen.has(statusPath)) continue;
    seen.add(statusPath);
    const link = new URL(statusPath, origin).href;
    const text = extractTweetText(article);
    const author = extractAuthor(article, statusPath);
    const pubDate = article.querySelector("time[datetime]")?.getAttribute("datetime") || undefined;
    const imageUrl = extractMediaUrl(article);
    const isRepost = isRepostArticle(article);
    entries.push({ link, text, author, pubDate, imageUrl, isRepost });
  }
  return entries;
}


function extractEntriesFromJson(data, origin) {
  if (typeof data !== "object" || data == null) return [];
  const entries = [];
  const str = JSON.stringify(data);
  const seen = new Set();
  const matches = str.match(/\/([A-Za-z0-9_]{1,32})\/status\/(\d+)/g) || [];
  for (const raw of matches) {
    const m = raw.match(/^\/([A-Za-z0-9_]{1,32})\/status\/(\d+)$/);
    if (!m) continue;
    const statusPath = `/${m[1]}/status/${m[2]}`;
    if (seen.has(statusPath)) continue;
    seen.add(statusPath);
    entries.push({ link: new URL(statusPath, origin).href, text: "", author: m[1], pubDate: undefined });
  }
  return entries;
}


function entriesToFeedItems(entries) {
  return entries.map(({ link, text, author, pubDate, imageUrl, isRepost }) => {
    const item = {
      guid: _deps.createHash("sha256").update(link).digest("hex"),
      /** 转发帖显示标题 Repost；其余不展示标题 */
      title: isRepost ? "Repost" : "",
      link,
      pubDate: pubDate ? new Date(pubDate) : new Date(),
      author,
      summary: text || undefined,
    };
    if (imageUrl) {
      item.imageUrl = imageUrl;
      item.cover_img = imageUrl;
    }
    return item;
  });
}


async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, { waitMs: 6000 });
  const root = _deps.parseHtml(html);
  const origin = getOrigin(finalUrl);

  let entries = parseArticles(root, origin);
  if (entries.length > 0) return entriesToFeedItems(entries);

  const scripts = root.querySelectorAll('script[type="application/json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "");
      const fromJson = extractEntriesFromJson(data, origin);
      if (fromJson.length > 0) {
        entries = fromJson;
        break;
      }
    } catch {
      // ignore broken JSON blocks
    }
  }
  if (entries.length > 0) return entriesToFeedItems(entries);

  const bodyText = normalizeText(root.textContent).toLowerCase();
  const isErrorPage = bodyText.includes("something went wrong") || bodyText.includes("try again");
  const message = isErrorPage
    ? "X 页面暂不可用（可能被风控或需登录），请稍后重试或切换为有头模式并确认登录态"
    : "未解析到推文条目，可能被风控或需登录";
  throw new Error(`[X] ${message}`);
}


export default {
  id: "x",
  listUrlPattern: "https://x.com/{username}",
  fetchItems,
};
