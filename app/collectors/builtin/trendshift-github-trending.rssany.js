export const id = "trendshift-github-trending";
export const name = "Trendshift GitHub Trending";
export const listUrlPattern =
  /^https:\/\/(?:www\.)?trendshift\.io\/github-trending-repositories\/?(?:\?.*)?$/i;
export const refreshInterval = "1h";

let _deps;

const REPOSITORY_PATH_RE = /^\/repositories\/\d+\/?$/;
const REPOSITORY_NAME_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

function normalizeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function hashGuid(input) {
  return _deps.createHash("sha256").update(input).digest("hex");
}

function findTrendingRow(anchor) {
  const anchorHref = anchor.getAttribute("href");
  let node = anchor.parentNode;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const repositoryLinks = node.querySelectorAll?.('a[href^="/repositories/"]') ?? [];
    const repositoryHrefs = new Set(
      repositoryLinks.map((link) => link.getAttribute("href")).filter(Boolean),
    );
    if (
      repositoryHrefs.size === 1
      && repositoryHrefs.has(anchorHref)
      && /Featured on GitHub Trending/i.test(normalizeText(node.textContent))
    ) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function extractIconMetric(row, iconClass) {
  const icon = row.querySelector(`svg.${iconClass}`);
  return normalizeText(icon?.parentNode?.textContent);
}

function extractDescription(row, repositoryName) {
  for (const paragraph of row.querySelectorAll("p")) {
    const text = normalizeText(paragraph.textContent);
    if (text && text !== repositoryName) return text;
  }
  return "";
}

function extractFeaturedText(row) {
  const text = normalizeText(row.textContent);
  const match = text.match(/Featured on GitHub Trending\s+\d+\s+times?\s+of\s+[^.]+\.?/i);
  return normalizeText(match?.[0]);
}

function extractTopics(row) {
  const topics = row
    .querySelectorAll('a[href^="/topics/"]')
    .map((anchor) => normalizeText(anchor.textContent).replace(/^#\s*/, ""))
    .filter(Boolean);
  return [...new Set(topics)];
}

export async function fetchItems(sourceId, ctx) {
  _deps = ctx.deps;
  const { html } = await ctx.fetchHtml(sourceId, {
    waitMs: 2500,
    waitForSelector: 'a[href^="/repositories/"]',
    waitForSelectorTimeoutMs: 20000,
    scrollBeforeSnapshot: {
      rounds: 6,
      pauseMs: 800,
    },
  });
  const root = _deps.parseHtml(html);
  const seen = new Set();
  const items = [];
  const observedAt = new Date();

  for (const anchor of root.querySelectorAll('a[href^="/repositories/"]')) {
    const href = anchor.getAttribute("href") ?? "";
    if (!REPOSITORY_PATH_RE.test(href)) continue;

    const repositoryName = normalizeText(anchor.textContent);
    const nameMatch = repositoryName.match(REPOSITORY_NAME_RE);
    if (!nameMatch) continue;

    const row = findTrendingRow(anchor);
    if (!row) continue;

    const repositoryKey = repositoryName.toLowerCase();
    if (seen.has(repositoryKey)) continue;
    seen.add(repositoryKey);

    const [, owner] = nameMatch;
    const stars = extractIconMetric(row, "lucide-star");
    const forks = extractIconMetric(row, "lucide-git-fork");
    const description = extractDescription(row, repositoryName);
    const featured = extractFeaturedText(row);
    const metrics = [
      stars ? `Stars: ${stars}` : "",
      forks ? `Forks: ${forks}` : "",
    ].filter(Boolean).join(" · ");
    const summary = [description, metrics, featured].filter(Boolean).join("\n");
    const topics = extractTopics(row);

    items.push({
      guid: hashGuid(`trendshift:${repositoryKey}`),
      title: repositoryName,
      link: `https://github.com/${repositoryName}`,
      pubDate: observedAt,
      author: [owner],
      summary: summary || undefined,
      categories: topics.length > 0 ? topics : undefined,
    });
  }

  if (items.length === 0) {
    throw new Error(
      "[trendshift-github-trending] 未解析到 GitHub Trending 条目，页面结构可能已变化",
    );
  }

  return items;
}
