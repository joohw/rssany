import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import * as moonshotPlugin from "../app/plugins/builtin/moonshot.rssany.js";
import * as theInformationPlugin from "../app/plugins/builtin/theinformation-briefings.rssany.js";

const deps = { createHash, parseHtml: parse };

describe("source plugin regressions", () => {
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
