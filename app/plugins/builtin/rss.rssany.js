// 内置 RSS/Atom/JSON Feed：通过浏览器（Puppeteer）拉取 Feed URL，再用 rss-parser 解析；
// 与站点插件一致走 Chrome，便于应对需浏览器环境或代理的场景；XML 使用 HTTP 响应原文（useHttpResponseBody）。

const UA = "RssAny/1.0 (+https://github.com/joohw/rssany)";

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
      const author = authorRaw ? [authorRaw] : undefined;
      const summary =
        typeof item.summary === "string" ? item.summary : typeof item.contentSnippet === "string" ? item.contentSnippet : undefined;
      const content =
        typeof item.content === "string" ? item.content : typeof item["content:encoded"] === "string" ? item["content:encoded"] : undefined;
      return {
        guid,
        title: item.title ?? "",
        link,
        pubDate,
        author,
        summary,
        content,
      };
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
