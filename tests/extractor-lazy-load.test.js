import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ jsdom: 0, readability: 0 }));

vi.mock("jsdom", async (importOriginal) => {
  loads.jsdom++;
  return importOriginal();
});

vi.mock("@mozilla/readability", async (importOriginal) => {
  loads.readability++;
  return importOriginal();
});

vi.mock("../app/scraper/sources/web/fetcher/index.js", () => ({
  fetchHtml: vi.fn(),
}));

vi.mock("../app/core/logger/index.js", () => ({
  logger: { warn: vi.fn() },
}));

import { extractHtml } from "../app/scraper/sources/web/extractor/extractor.ts";

const tempRoots = [];

afterAll(async () => {
  await Promise.all(tempRoots.map((path) => rm(path, { recursive: true, force: true })));
});

describe.sequential("extractor dependency loading", () => {
  it("does not load Readability for import, disabled extraction, or a custom extractor", async () => {
    expect(loads).toEqual({ jsdom: 0, readability: 0 });
    await expect(extractHtml("<article>Ignored</article>")).resolves.toEqual({});

    const customExtractor = vi.fn(async (html, url) => ({ title: url, content: html }));
    await expect(extractHtml("<article>Custom</article>", {
      url: "https://example.com/custom",
      mode: "readability",
      customExtractor,
    })).resolves.toEqual({
      title: "https://example.com/custom",
      content: "<article>Custom</article>",
    });
    expect(customExtractor).toHaveBeenCalledOnce();
    expect(loads).toEqual({ jsdom: 0, readability: 0 });
  });

  it("returns cached Readability results without loading the parser", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "rssany-extractor-"));
    tempRoots.push(cacheDir);
    await mkdir(join(cacheDir, "extracted"));
    await writeFile(join(cacheDir, "extracted", "article.json"), JSON.stringify({
      title: "Cached article",
      content: "Cached body",
    }));

    await expect(extractHtml("", {
      url: "https://example.com/article",
      mode: "readability",
      cacheDir,
      cacheKey: "article",
    })).resolves.toMatchObject({ title: "Cached article", content: "Cached body" });
    expect(loads).toEqual({ jsdom: 0, readability: 0 });
  });

  it("loads the parser on first use and preserves article metadata and relative links", async () => {
    const paragraph = "This article explains how a subscription service collects useful information, keeps a local library, and publishes feeds for readers. ";
    const html = `<!doctype html><html><head>
      <title>Subscription research</title>
      <meta name="author" content="Example Author">
      <meta name="description" content="A practical guide to subscriptions.">
      </head><body><article><h1>Subscription research</h1>
      <p>${paragraph.repeat(5)}</p><p>${paragraph.repeat(5)}<a href="/details">Read more</a></p>
      </article></body></html>`;
    const config = { url: "https://example.com/article", mode: "readability" };
    const [first, second] = await Promise.all([
      extractHtml(html, config),
      extractHtml(html, config),
    ]);

    expect(first).toMatchObject({
      title: "Subscription research",
      author: "Example Author",
      summary: "A practical guide to subscriptions.",
    });
    expect(first.content).toContain(paragraph);
    expect(first.content).toContain('href="https://example.com/details"');
    expect(second).toEqual(first);
    expect(loads).toEqual({ jsdom: 1, readability: 1 });
  });
});
