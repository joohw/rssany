import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const puppeteer = vi.hoisted(() => ({
  launch: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("puppeteer-core", () => ({
  default: puppeteer,
}));

import {
  closeSharedBrowsers,
  getOrCreateBrowser,
  launchBrowser,
} from "../app/scraper/sources/web/fetcher/browser.ts";

const tempRoots = [];

afterEach(async () => {
  await closeSharedBrowsers();
  puppeteer.launch.mockReset();
  puppeteer.connect.mockReset();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("browser profile reuse", () => {
  it("connects to Chrome recorded by DevToolsActivePort when the profile is locked", async () => {
    const cacheDir = join(tmpdir(), `rssany-browser-${process.pid}-${Date.now()}`);
    tempRoots.push(cacheDir);
    const profileDir = join(cacheDir, "browser_data", "main");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "DevToolsActivePort"),
      "43210\n/devtools/browser/existing-browser\n",
      "utf8",
    );

    const existingBrowser = createBrowser(false);
    puppeteer.launch.mockRejectedValue(
      new Error("The browser is already running for userDataDir"),
    );
    puppeteer.connect.mockResolvedValue(existingBrowser);

    const browser = await launchBrowser({
      cacheDir,
      chromeExecutablePath: "chrome.exe",
    });

    expect(browser).toBe(existingBrowser);
    expect(puppeteer.connect).toHaveBeenCalledWith({
      browserWSEndpoint: "ws://127.0.0.1:43210/devtools/browser/existing-browser",
    });
    await browser.disconnect();
  });

  it("serializes a headless-to-headed transition for the same profile", async () => {
    const first = createBrowser(true);
    const second = createBrowser(true);
    puppeteer.launch
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const config = {
      cacheDir: join(tmpdir(), `rssany-transition-${process.pid}-${Date.now()}`),
      chromeExecutablePath: "chrome.exe",
    };
    tempRoots.push(config.cacheDir);

    await getOrCreateBrowser({ ...config, headless: true });
    const [headedA, headedB] = await Promise.all([
      getOrCreateBrowser({ ...config, headless: false }),
      getOrCreateBrowser({ ...config, headless: false }),
    ]);

    expect(headedA).toBe(second);
    expect(headedB).toBe(second);
    expect(first.close).toHaveBeenCalledOnce();
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });
});

function createBrowser(owned) {
  const disconnectedHandlers = [];
  const browser = {
    connected: true,
    process: () => owned ? ({ exitCode: null, kill: vi.fn(() => true) }) : null,
    once: vi.fn((event, handler) => {
      if (event === "disconnected") disconnectedHandlers.push(handler);
    }),
    close: vi.fn(async () => {
      browser.connected = false;
      for (const handler of disconnectedHandlers) handler();
    }),
    disconnect: vi.fn(async () => {
      browser.connected = false;
      for (const handler of disconnectedHandlers) handler();
    }),
  };
  return browser;
}
