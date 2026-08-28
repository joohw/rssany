export const id = "theinformation";
export const name = "Theinformation";
export const listUrlPattern = /^https:\/\/(www\.)?theinformation\.com\/(?:(?:briefings|features\/[^/]+)\/?)?(\?.*)?$/i;
export const refreshInterval = "1h";

let _deps;

// The Information — AI Agenda 和 Briefings 列表页
// 当前结构：.article.feed-item，标题 h3.title a，分类 .category-content a，作者 .authors，摘要 .recent-excerpt .long-excerpt

const ORIGIN = "https://www.theinformation.com";

function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}


function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}


function authorNames(value) {
  const candidates = Array.isArray(value?.authors)
    ? value.authors
    : value?.author != null
      ? [value.author]
      : [];
  return [...new Set(
    candidates
      .map((author) => typeof author === "string" ? author : author?.name)
      .map(normalizeText)
      .filter(Boolean)
  )];
}


/** 从 React props 一次性提取文章/Briefing 的作者与发布时间。 */
function parseEmbeddedMetadata(root) {
  const metadata = new Map();
  const seen = new Set();

  function visit(value) {
    if (value == null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const slug = typeof value.slug === "string" ? value.slug.trim() : "";
    if (slug) {
      const authors = authorNames(value);
      const pubDate = parseDate(value.publishedAt ?? value.published_at);
      const summary = normalizeText(value.dek ?? value.freeBlurb ?? value.summary ?? "") || undefined;
      const previous = metadata.get(slug);
      metadata.set(slug, {
        authors: authors.length > 0 ? authors : previous?.authors,
        pubDate: pubDate ?? previous?.pubDate,
        summary: summary ?? previous?.summary,
      });
    }
    Object.values(value).forEach(visit);
  }

  for (const script of root.querySelectorAll(
    "script.js-react-on-rails-component[type='application/json']"
  )) {
    try {
      visit(JSON.parse(script.textContent));
    } catch {
      // 页面仍可回退到可见 DOM 卡片解析。
    }
  }
  return metadata;
}


function findCardRoot(anchor) {
  let node = anchor;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentNode) {
    if (node.tagName?.toLowerCase() === "article") return node;
    if (node !== anchor && node.querySelector?.("time")) return node;
  }
  return anchor;
}


function cardAuthors(card) {
  return [...new Set(
    card
      .querySelectorAll("a[href^='/u/']")
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean)
  )];
}


function contentSlug(link) {
  try {
    return decodeURIComponent(new URL(link).pathname.replace(/\/+$/, "").split("/").pop() ?? "");
  } catch {
    return "";
  }
}


function metadataNearHeading(root) {
  let node = root.querySelector("h1");
  for (let depth = 0; node && depth < 8; depth++, node = node.parentNode) {
    const authors = cardAuthors(node);
    if (authors.length > 0) {
      return {
        authors,
        pubDate: parseDate(node.querySelector("time[datetime]")?.getAttribute("datetime")),
      };
    }
  }
  return {};
}


async function hydrateMissingAuthors(items, ctx) {
  const missing = items.filter((item) => !item.author?.length);
  let cursor = 0;

  async function worker() {
    while (cursor < missing.length) {
      const item = missing[cursor++];
      try {
        const { html } = await ctx.fetchHtml(item.link, {
          waitMs: 1500,
          waitForSelector: "h1",
          waitForSelectorTimeoutMs: 15_000,
        });
        const root = _deps.parseHtml(html);
        const metadata = parseEmbeddedMetadata(root).get(contentSlug(item.link));
        const nearby = metadataNearHeading(root);
        const authors = metadata?.authors?.length ? metadata.authors : nearby.authors;
        if (authors?.length) item.author = authors;
        const pubDate = metadata?.pubDate ?? nearby.pubDate;
        if (pubDate) item.pubDate = pubDate;
      } catch {
        // 单条详情补全失败不影响其余首页条目。
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(3, missing.length) }, () => worker())
  );
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
  const homeMetadata = parseEmbeddedMetadata(root);
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

  // 2026 首页使用 Tailwind/React 组件，不再包含旧版 `.article.feed-item`。
  // 只收录明确的内容路径，并从链接内部的标题与摘要节点提取，避免交给 LLM 解析超大首页。
  for (const anchor of root.querySelectorAll("a[href]")) {
    const rawHref = anchor.getAttribute("href");
    const link = toAbsoluteHttpUrl(rawHref, pageUrl);
    if (!link || seen.has(link)) continue;

    let pathname;
    try {
      pathname = new URL(link).pathname;
    } catch {
      continue;
    }
    if (
      !/^\/articles\/[^/]+\/?$/i.test(pathname) &&
      !/^\/briefings\/[^/]+\/?$/i.test(pathname) &&
      !/^\/newsletters\/[^/]+\/[^/]+\/?$/i.test(pathname)
    ) {
      continue;
    }

    const heading = anchor.querySelector("h1, h2, h3, h4");
    const title = normalizeText(heading?.textContent ?? anchor.textContent);
    if (!title || /^on(?:…|\.\.\.)\s/i.test(title)) continue;

    const summary = anchor
      .querySelectorAll("p, div")
      .map((node) => normalizeText(node.textContent))
      .find((text) => text.length >= 20 && text !== title && !text.startsWith(title));
    const card = findCardRoot(anchor);
    const slug = contentSlug(link);
    const metadata = homeMetadata.get(slug);
    const authors = cardAuthors(card);
    const cardDate = parseDate(card.querySelector("time[datetime]")?.getAttribute("datetime"));

    seen.add(link);
    items.push({
      guid: hashGuid(link),
      title,
      link,
      pubDate: cardDate ?? metadata?.pubDate ?? new Date(),
      author: authors.length > 0 ? authors : metadata?.authors,
      summary: summary || metadata?.summary,
    });
  }

  return items;
}


export async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html, finalUrl, status } = await ctx.fetchHtml(sourceId, {
    waitMs: 5000,
    waitForSelector: ".article.feed-item, a[href^='/articles/'], a[href^='/briefings/']",
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

  await hydrateMissingAuthors(items, ctx);
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  return items;
}
