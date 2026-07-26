import { createHash } from "node:crypto";
import RssParser from "rss-parser";
import { describe, expect, it } from "vitest";
import * as rssPlugin from "../app/plugins/builtin/rss.rssany.js";

describe("RSS plugin arXiv fallback", () => {
  it("uses the official API when a category RSS feed is valid but empty", async () => {
    const requestedUrls = [];
    class FakeRssParser {
      async parseString(xml) {
        if (xml.includes("<rss")) return { items: [] };
        return {
          items: [{
            guid: "arxiv-item",
            title: "Recent arXiv paper",
            link: "https://arxiv.org/abs/2607.00001",
            isoDate: "2026-07-23T12:00:00Z",
          }],
        };
      }
    }
    const ctx = {
      proxy: "http://test.invalid",
      deps: { RssParser: FakeRssParser, createHash },
      async fetchHtml(url) {
        requestedUrls.push(url);
        return {
          html: requestedUrls.length === 1
            ? "<?xml version=\"1.0\"?><?xml-stylesheet type=\"text/xsl\" href=\"feed.xsl\"?><rss version=\"2.0\"></rss>"
            : "<feed></feed>",
          finalUrl: url,
          status: 200,
        };
      },
    };

    const items = await rssPlugin.fetchItems("https://rss.arxiv.org/rss/cs.AI", ctx);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Recent arXiv paper");
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain("https://export.arxiv.org/api/query?");
    expect(requestedUrls[1]).toContain("search_query=cat%3Acs.AI");
  });

  it("does not fall back for a non-arXiv empty feed", async () => {
    const requestedUrls = [];
    class FakeRssParser {
      async parseString() {
        return { items: [] };
      }
    }
    const ctx = {
      proxy: "http://test.invalid",
      deps: { RssParser: FakeRssParser, createHash },
      async fetchHtml(url) {
        requestedUrls.push(url);
        return { html: "<rss version=\"2.0\"></rss>", finalUrl: url, status: 200 };
      },
    };

    const items = await rssPlugin.fetchItems("https://example.com/feed.xml", ctx);

    expect(items).toEqual([]);
    expect(requestedUrls).toEqual(["https://example.com/feed.xml"]);
  });

  it("falls back to tolerant XML parsing for malformed HTML inside an RSS item", async () => {
    const malformedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Malformed feed</title>
          <item>
            <title>Still readable</title>
            <link>https://example.com/article</link>
            <description><p>Unbalanced article HTML</description>
            <guid>article-1</guid>
          </item>
        </channel>
      </rss>`;
    const ctx = {
      proxy: "http://test.invalid",
      deps: {
        RssParser,
        createHash,
        logger: { warn() {} },
      },
      async fetchHtml(url) {
        return { html: malformedXml, finalUrl: url, status: 200 };
      },
    };

    const items = await rssPlugin.fetchItems("https://example.com/feed.xml", ctx);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Still readable");
    expect(items[0].content).toContain("Unbalanced article HTML");
  });
});
