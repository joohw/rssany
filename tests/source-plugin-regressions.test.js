import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import * as huggingFacePlugin from "../app/plugins/builtin/huggingface-blog.rssany.js";
import * as moonshotPlugin from "../app/plugins/builtin/moonshot.rssany.js";
import * as theInformationPlugin from "../app/plugins/builtin/theinformation-briefings.rssany.js";

const deps = { createHash, parseHtml: parse };

describe("source plugin regressions", () => {
  it("uses Hugging Face's official RSS instead of generic LLM parsing", async () => {
    let requestedUrl;
    class FakeRssParser {
      async parseURL(url) {
        requestedUrl = url;
        return {
          items: [
            {
              title: "A deterministic Hugging Face post",
              link: "https://huggingface.co/blog/deterministic-post",
              pubDate: "Thu, 23 Jul 2026 00:00:00 GMT",
            },
            {
              title: "Community post",
              link: "https://huggingface.co/blog/example/community-post",
              isoDate: "2026-07-22T12:00:00Z",
              creator: "example",
            },
          ],
        };
      }
    }

    const items = await huggingFacePlugin.fetchItems("https://huggingface.co/blog", {
      deps: { RssParser: FakeRssParser, createHash },
    });

    expect(requestedUrl).toBe("https://huggingface.co/blog/feed.xml");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("A deterministic Hugging Face post");
    expect(items[0].pubDate.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(items[1].author).toBe("example");
  });

  it("parses The Information's current homepage cards", async () => {
    const html = `
      <main>
        <a href="/articles/ai-financing-gets-creative">
          <h2>AI Financing Gets Creative</h2>
          <p>Dealmakers are finding new ways to finance the AI buildout.</p>
        </a>
        <a href="/briefings/deepseek-puts-current-funding-round-hold">
          <h3>DeepSeek Puts Current Funding Round on Hold</h3>
          <div>The pause follows a recent investor call transcript leak.</div>
        </a>
        <a href="/features/artificial-intelligence">Artificial Intelligence</a>
      </main>
    `;
    const items = await theInformationPlugin.fetchItems("https://www.theinformation.com/", {
      deps,
      async fetchHtml() {
        return { html, finalUrl: "https://www.theinformation.com/", status: 200 };
      },
    });

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining([
      "AI Financing Gets Creative",
      "DeepSeek Puts Current Funding Round on Hold",
    ]));
    expect(items.find((item) => item.title === "AI Financing Gets Creative")?.summary)
      .toContain("finance the AI buildout");
  });

  it("parses Moonshot cards that use h3 titles and span dates", async () => {
    const html = `
      <section>
        <h2>Latest Research</h2>
        <a href="https://www.kimi.com/blog/kimi-k3">
          <span class="cardDate">2026-07-16</span>
          <h3 class="cardTitle">Kimi K3</h3>
        </a>
      </section>
    `;
    const items = await moonshotPlugin.fetchItems("https://www.moonshot.ai/", {
      deps,
      async fetchHtml() {
        return { html, finalUrl: "https://www.moonshot.ai/", status: 200 };
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Kimi K3");
    expect(items[0].pubDate.toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });
});
