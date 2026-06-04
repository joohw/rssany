export const id = "xiaohongshu";
export const name = "Xiaohongshu";
export const listUrlPattern = /^https:\/\/(www\.)?xiaohongshu\.com\/user\/profile\/[^/?#]+\/?(?:[?#].*)?$/i;

let _deps;

// 小红书站点插件：用户主页列表抓取、笔记详情提取、认证流程



const XHS_ORIGIN = "https://www.xiaohongshu.com";
const XHS_NOTE_PATH_RE = /^\/(?:explore|discovery\/item)\/([0-9a-f]{24})\/?$/i;
const XHS_NOTE_ID_RE = /^[0-9a-f]{24}$/i;
const XHS_NOTE_ID_IN_IMG_RE = /xhscdn\.com\/\d+\/([0-9a-f]{24})/i;
const XHS_PROFILE_USER_RE = /\/user\/profile\/([0-9a-f]{24})/i;


function hashNoteGuid(noteId) {
  return _deps.createHash("sha256").update(`xhs:note:${noteId}`).digest("hex");
}


function extractProfileUserId(url) {
  const m = String(url).match(XHS_PROFILE_USER_RE);
  return m?.[1]?.toLowerCase() ?? null;
}


function buildExploreLink(noteId, origin) {
  return `${origin.replace(/\/$/, "")}/explore/${noteId}`;
}


function extractNoteIdFromSection(section, profileUserId) {
  for (const img of section.querySelectorAll('img[src*="xhscdn"]')) {
    const src = img.getAttribute("src")?.trim() ?? "";
    const fromImg = src.match(XHS_NOTE_ID_IN_IMG_RE);
    if (fromImg?.[1] && fromImg[1] !== profileUserId) return fromImg[1].toLowerCase();
  }
  const html = section.outerHTML ?? "";
  for (const match of html.match(/[0-9a-f]{24}/gi) ?? []) {
    const id = match.toLowerCase();
    if (id !== profileUserId && XHS_NOTE_ID_RE.test(id)) return id;
  }
  return null;
}


function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return XHS_ORIGIN;
  }
}


function normalizeXhsUrl(href, origin) {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"), origin);
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}


function normalizeXhsItemLink(href, origin) {
  const url = normalizeXhsUrl(href, origin);
  if (!url) return null;

  try {
    if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) return null;
    const m = url.pathname.match(XHS_NOTE_PATH_RE);
    if (!m?.[1]) return null;
    return buildExploreLink(m[1].toLowerCase(), url.origin);
  } catch {
    return null;
  }
}


function extractRedirectItemLink(href, origin) {
  const wrapper = normalizeXhsUrl(href, origin);
  if (!wrapper) return null;
  if (!/\/website-login\/error\/?$/i.test(wrapper.pathname)) return null;

  const redirectPath = wrapper.searchParams.get("redirectPath");
  if (!redirectPath) return null;
  return normalizeXhsItemLink(redirectPath, origin);
}


function extractListItemLink(section, origin, profileUserId) {
  const noteId = extractNoteIdFromSection(section, profileUserId);
  if (noteId) return buildExploreLink(noteId, origin);

  const anchors = section.querySelectorAll("a[href]");
  const candidates = [];
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href")?.trim();
    if (!href) continue;

    const direct = normalizeXhsItemLink(href, origin);
    if (direct) candidates.push(direct);

    const redirected = extractRedirectItemLink(href, origin);
    if (redirected) candidates.push(redirected);
  }
  return candidates[0] ?? null;
}


function parseListHtml(html, url) {
  const root = _deps.parseHtml(html);
  const origin = getOrigin(url);
  const profileUserId = extractProfileUserId(url);
  const feed = root.querySelector("#userPostedFeeds");
  if (!feed) return [];
  const sections = feed.querySelectorAll("section[data-index]");
  const items = [];
  const seenNoteIds = new Set();
  for (const section of sections) {
    const noteId = extractNoteIdFromSection(section, profileUserId);
    const link = noteId
      ? buildExploreLink(noteId, origin)
      : extractListItemLink(section, origin, profileUserId);
    if (!link) continue;
    const dedupeKey = noteId ?? link;
    if (seenNoteIds.has(dedupeKey)) continue;
    seenNoteIds.add(dedupeKey);
    const titleEl = section.querySelector("span[data-v-51ec0135]") ?? section.querySelector(".title span") ?? section.querySelector("span");
    const title = (titleEl?.textContent ?? "").trim() || "Note";
    const authorEl = section.querySelector('a[aria-current="page"] .name') ?? section.querySelector('a[aria-current="page"] span');
    const author = (authorEl?.textContent ?? "").trim() || undefined;
    const image = pickSectionImage(section);
    const summary = image ? undefined : title;
    const guid = noteId ? hashNoteGuid(noteId) : _deps.createHash("sha256").update(link).digest("hex");
    items.push({
      guid,
      title,
      link,
      pubDate: new Date(),
      author,
      summary,
      imageUrl: image,
      coverImg: image,
      cover_img: image,
    });
  }
  return items;
}


function descToMarkdown(descEl) {
  if (!descEl) return "";
  const noteText = descEl.querySelector(".note-text");
  if (!noteText) {
    return (descEl.textContent ?? "").trim();
  }
  const parts = [];
  for (const node of noteText.childNodes) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim();
      if (text) parts.push(text);
    } else if (node.nodeType === 1) {
      const el = node;
      const tagName = el.tagName?.toLowerCase();
      if (tagName === "img") {
        const alt = el.getAttribute("alt") || "";
        if (alt) parts.push(alt);
      } else if (tagName === "a" && el.classList?.contains("tag")) {
        const txt = (el.textContent ?? "").trim();
        if (txt) parts.push(txt);
      } else {
        const txt = (el.textContent ?? "").trim();
        if (txt) parts.push(txt);
      }
    }
  }
  let result = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!result) result = (descEl.textContent ?? "").trim();
  if (!result && descEl.parentNode) result = (descEl.parentNode.textContent ?? "").trim();
  return result;
}


function extractUrl(val) {
  if (!val) return null;
  const decoded = val.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const m = decoded.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/);
  if (m) {
    let url = m[1].trim();
    url = url.replace(/^["']|["']$/g, "");
    return url || null;
  }
  return null;
}


function isUsableImageUrl(url) {
  const u = (url ?? "").trim();
  if (!u) return false;
  if (u.startsWith("data:")) return false;
  if (/^blob:/i.test(u)) return false;
  return u.startsWith("http://") || u.startsWith("https://") || u.startsWith("//");
}


function normalizeImageUrl(url) {
  const u = (url ?? "").trim();
  if (!isUsableImageUrl(u)) return undefined;
  return u.startsWith("//") ? `https:${u}` : u;
}


function pickImageFromSrcset(srcset) {
  const raw = (srcset ?? "").trim();
  if (!raw) return undefined;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const candidate = parts[i]?.split(/\s+/)[0];
    const normalized = normalizeImageUrl(candidate);
    if (normalized) return normalized;
  }
  return undefined;
}


function pickSectionImage(section) {
  const imageEl = section.querySelector("img[data-xhs-img], img");
  if (imageEl) {
    const candidates = [
      imageEl.getAttribute("src"),
      imageEl.getAttribute("data-src"),
      imageEl.getAttribute("data-lazy-src"),
      imageEl.getAttribute("data-original"),
      pickImageFromSrcset(imageEl.getAttribute("srcset")),
    ];
    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) return normalized;
    }
  }
  for (const el of section.querySelectorAll("[style*='background-image']")) {
    const url = extractUrl(el.getAttribute("style") ?? "");
    const normalized = normalizeImageUrl(url);
    if (normalized && (normalized.includes("xhscdn") || normalized.includes("sns-webpic"))) return normalized;
  }
  return undefined;
}


function collectNoteImages(root) {
  const urls = [];
  const seen = new Set();
  const add = (url) => {
    const u = (url || "").trim();
    if (u && !seen.has(u) && (u.startsWith("http") || u.startsWith("//"))) {
      seen.add(u);
      urls.push(u.startsWith("//") ? "https:" + u : u);
    }
  };
  const imgs = root.querySelectorAll(".img-container img, .note-slider-img img, .note-slider img, .xhs-webplayer img, .note-content img, [class*='note-detail'] img, .media-container img, .video-player-media img");
  for (const el of imgs) {
    const src = el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-lazy-src");
    if (src) add(src);
  }
  const posterSelectors = ["xg-poster", "[class*='xgplayer-poster']", ".player-container [style*='background-image']", ".render-ssr-image [style*='background-image']", "[class*='player-container'] [style*='background-image']", ".video-player-media [style*='background-image']", ".media-container [style*='background-image']"];
  for (const sel of posterSelectors) {
    const els = root.querySelectorAll(sel);
    for (const el of els) {
      const style = el.getAttribute("style");
      const url = extractUrl(style ?? "");
      if (url) add(url);
    }
  }
  const anyBg = root.querySelectorAll("[style*='background-image']");
  for (const el of anyBg) {
    const url = extractUrl(el.getAttribute("style") ?? "");
    if (url && (url.includes("xhscdn") || url.includes("sns-webpic") || url.includes("sns-avatar"))) add(url);
  }
  return urls;
}


function parseNoteDate(dateEl) {
  const text = (dateEl?.textContent ?? "").trim();
  if (!text) return undefined;
  const now = new Date();
  const published = text.match(/发布于\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (published) {
    const [, y, m, d] = published;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00.000Z`);
  }
  const edited = text.match(/编辑于\s*(\d{1,2})-(\d{1,2})/);
  if (edited) {
    const [, m, d] = edited;
    let year = now.getFullYear();
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    const built = new Date(year, month - 1, day);
    if (built > now) year -= 1;
    return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`);
  }
  const relativeMatch = text.match(/(编辑于|发布于)\s*(\d+)\s*(分钟|小时|天|周|个月)前/);
  if (relativeMatch) {
    const [, , amount, unit] = relativeMatch;
    const num = parseInt(amount, 10);
    const msMap = { 分钟: 60_000, 小时: 3_600_000, 天: 86_400_000, 周: 604_800_000, 个月: 2_592_000_000 };
    return new Date(now.getTime() - (num * (msMap[unit] ?? 0)));
  }
  return undefined;
}


function extractDetailHtml(html) {
  const root = _deps.parseHtml(html);
  // 作者
  let authorEl = null;
  const authorSelectors = [
    ".author .info a.name .username",
    ".info a.name .username",
    ".info .username",
    "a.name .username",
    ".author-container .username",
    ".author .username",
  ];
  for (const sel of authorSelectors) {
    authorEl = root.querySelector(sel);
    if (authorEl) break;
  }
  if (!authorEl) {
    const containers = root.querySelectorAll(".author, .author-container, .interaction-container, .info");
    for (const c of containers) {
      const u = c.querySelector("a.name .username") ?? c.querySelector(".username");
      if (u) { authorEl = u; break; }
    }
  }
  if (!authorEl) {
    for (const u of root.querySelectorAll(".username")) {
      let p = u.parentNode ?? null;
      for (let i = 0; i < 5 && p; i++) {
        const cls = p.getAttribute?.("class") || "";
        if (typeof cls === "string" && (cls.includes("name") || cls.includes("info") || cls.includes("author"))) {
          authorEl = u; break;
        }
        p = p.parentNode ?? null;
      }
      if (authorEl) break;
    }
  }
  const author = (authorEl?.textContent ?? "").trim() || undefined;
  // 标题
  const titleEl = root.querySelector("#detail-title") ?? root.querySelector(".note-content .title") ?? root.querySelector("h1.title");
  const title = (titleEl?.textContent ?? "").trim() || undefined;
  // 正文
  const descEl = root.querySelector("#detail-desc") ?? root.querySelector(".note-content .desc") ?? root.querySelector(".desc");
  const descText = descToMarkdown(descEl);
  const imgUrls = collectNoteImages(root);
  const imgMd = imgUrls.length > 0 ? imgUrls.map((u) => `\n\n![](${u})`).join("") : "";
  let content = (descText + imgMd).trim() || title || imgMd.trim() || undefined;
  // 发布时间
  let dateEl = root.querySelector(".bottom-container span.date") ?? root.querySelector(".bottom-container .date");
  if (!dateEl) {
    for (const span of root.querySelectorAll("span")) {
      if (/(编辑于|发布于)/.test(span.textContent ?? "")) { dateEl = span; break; }
    }
  }
  const pubDate = parseNoteDate(dateEl);
  return { author, title, content, pubDate };
}


export async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
    waitMs: 3000,
    waitForSelector: "#userPostedFeeds",
    waitForSelectorTimeoutMs: 15000,
    scrollBeforeSnapshot: { selector: "#userPostedFeeds", rounds: 8, pauseMs: 900 },
  });
  return parseListHtml(html, finalUrl);
}


async function enrichItem(item, ctx) {
  const { html } = await ctx.fetchHtml(item.link);
  const detail = extractDetailHtml(html);
  const imgUrls = collectNoteImages(_deps.parseHtml(html));
  const imageUrl = item.imageUrl ?? imgUrls[0];
  return {
    ...item,
    author: detail.author ?? item.author,
    title: detail.title ?? item.title,
    content: detail.content ? `<p>${detail.content.replace(/\n\n/g, "</p><p>")}</p>` : undefined,
    pubDate: detail.pubDate ?? item.pubDate,
    imageUrl,
    coverImg: imageUrl,
    cover_img: imageUrl,
  };
}
