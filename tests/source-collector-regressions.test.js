import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import * as huggingFaceCollector from "../app/collectors/builtin/huggingface-blog.rssany.js";
import * as moonshotCollector from "../app/collectors/builtin/moonshot.rssany.js";
import * as theInformationCollector from "../app/collectors/builtin/theinformation-briefings.rssany.js";
import * as trendshiftCollector from "../app/collectors/builtin/trendshift-github-trending.rssany.js";

const deps = { createHash, parseHtml: parse };

describe("source collector regressions", () => {
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

    const items = await huggingFaceCollector.fetchItems("https://huggingface.co/blog", {
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
        <article>
          <a href="/articles/ai-financing-gets-creative">
            <h2>AI Financing Gets Creative</h2>
            <p>Dealmakers are finding new ways to finance the AI buildout.</p>
          </a>
          <div>By <a href="/u/theinformationstaff">The Information Staff</a></div>
          <time datetime="2026-07-26T18:00:43+00:00">11:00am GMT-7</time>
        </article>
        <div>
          <a href="/briefings/deepseek-puts-current-funding-round-hold">
            <h3>DeepSeek Puts Current Funding Round on Hold</h3>
            <div>The pause follows a recent investor call transcript leak.</div>
          </a>
          <time datetime="2026-07-26T05:36:43+00:00">Jul 25, 2026</time>
        </div>
        <a href="/features/artificial-intelligence">Artificial Intelligence</a>
      </main>
      <script
        type="application/json"
        class="js-react-on-rails-component"
        data-component-name="Home"
      >${JSON.stringify({
        latest: [
          {
            slug: "deepseek-puts-current-funding-round-hold",
            authors: [{ name: "Qianer Liu" }, { name: "Juro Osawa" }],
            publishedAt: "2026-07-26T05:36:43+00:00",
            dek: "The pause follows a recent investor call transcript leak.",
          },
        ],
      })}</script>
    `;
    const items = await theInformationCollector.fetchItems("https://www.theinformation.com/", {
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
    expect(items.find((item) => item.title === "AI Financing Gets Creative")?.author)
      .toEqual(["The Information Staff"]);
    expect(items.find((item) => item.title === "AI Financing Gets Creative")?.pubDate.toISOString())
      .toBe("2026-07-26T18:00:43.000Z");
    expect(items.find((item) => item.title === "DeepSeek Puts Current Funding Round on Hold")?.author)
      .toEqual(["Qianer Liu", "Juro Osawa"]);
    expect(items.find((item) => item.title === "DeepSeek Puts Current Funding Round on Hold")?.pubDate.toISOString())
      .toBe("2026-07-26T05:36:43.000Z");
  });

  it("hydrates a The Information author from the detail page when homepage metadata omits it", async () => {
    const homepage = `
      <main>
        <a href="/articles/clos-atms-wall-street-finds-ways-fund-ai">
          <h2>From CLOs to ATMs, Wall Street Finds More Ways to Fund AI</h2>
          <p>Wall Street is finding more ways to fund the AI buildout.</p>
        </a>
      </main>
    `;
    const detail = `
      <main>
        <section>
          <h1>From CLOs to ATMs, Wall Street Finds More Ways to Fund AI</h1>
          <div>By <a href="/u/theinformationstaff">The Information Staff</a></div>
          <time datetime="2026-07-26T17:30:00+00:00">Jul 26, 2026</time>
        </section>
      </main>
    `;
    const requested = [];
    const items = await theInformationCollector.fetchItems("https://www.theinformation.com/", {
      deps,
      async fetchHtml(url) {
        requested.push(url);
        return {
          html: url === "https://www.theinformation.com/" ? homepage : detail,
          finalUrl: url,
          status: 200,
        };
      },
    });

    expect(requested).toEqual([
      "https://www.theinformation.com/",
      "https://www.theinformation.com/articles/clos-atms-wall-street-finds-ways-fund-ai",
    ]);
    expect(items[0].author).toEqual(["The Information Staff"]);
    expect(items[0].pubDate.toISOString()).toBe("2026-07-26T17:30:00.000Z");
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
    const items = await moonshotCollector.fetchItems("https://www.moonshot.ai/", {
      deps,
      async fetchHtml() {
        return { html, finalUrl: "https://www.moonshot.ai/", status: 200 };
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Kimi K3");
    expect(items[0].pubDate.toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("parses Trendshift ranking cards without including sidebar mentions", async () => {
    const html = `
      <aside>
        <a href="/repositories/999">sidebar/mention</a>
      </aside>
      <main>
        <div class="ranking-row">
          <a href="/repositories/15069">permissionlesstech/bitchat</a>
          <a href="/repositories/15069"><img alt="" /></a>
          <span><svg class="lucide lucide-star"></svg>30.4k</span>
          <span><svg class="lucide lucide-git-fork"></svg>4.7k</span>
          <div>Featured on GitHub Trending 1 times of today.</div>
          <p>bluetooth mesh chat, IRC vibes</p>
          <a href="/topics/bluetooth">Bluetooth</a>
        </div>
        <div class="ranking-row">
          <a href="/repositories/42334">citrolabs/ego-lite</a>
          <span><svg class="lucide lucide-star"></svg>5.2k</span>
          <span><svg class="lucide lucide-git-fork"></svg>420</span>
          <div>Featured on GitHub Trending 2 times of today.</div>
          <p>Local-first personal AI assistant.</p>
          <a href="/topics/self-hosted">Self-hosted</a>
        </div>
      </main>
    `;
    const items = await trendshiftCollector.fetchItems(
      "https://trendshift.io/github-trending-repositories?trending-range=1",
      {
        deps,
        async fetchHtml() {
          return {
            html,
            finalUrl: "https://trendshift.io/github-trending-repositories?trending-range=1",
            status: 200,
          };
        },
      },
    );

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual([
      "permissionlesstech/bitchat",
      "citrolabs/ego-lite",
    ]);
    expect(items[0].link).toBe("https://github.com/permissionlesstech/bitchat");
    expect(items[0].author).toEqual(["permissionlesstech"]);
    expect(items[0].summary).toContain("Stars: 30.4k · Forks: 4.7k");
    expect(items[0].summary).toContain("Featured on GitHub Trending 1 times of today.");
    expect(items[0].categories).toEqual(["Bluetooth"]);
    expect(items[0].guid).toBe(
      createHash("sha256")
        .update("trendshift:permissionlesstech/bitchat")
        .digest("hex"),
    );
  });
});
