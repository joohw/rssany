import { expect, it, vi } from "vitest";

const puppeteer = vi.hoisted(() => ({
  initialized: vi.fn(),
  launch: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("puppeteer-core", () => {
  puppeteer.initialized();
  return { default: puppeteer };
});

import { launchBrowser } from "../app/scraper/sources/web/fetcher/browser.ts";
import { launchBrowser as launchCdpBrowser } from "../app/scraper/sources/web/fetcher/cdp.ts";

it("defers Puppeteer initialization until a browser is requested", async () => {
  expect(puppeteer.initialized).not.toHaveBeenCalled();

  const browser = { close: vi.fn(async () => {}) };
  puppeteer.launch.mockResolvedValue(browser);

  expect(await launchBrowser({ chromeExecutablePath: "chrome.exe" })).toBe(browser);
  expect(puppeteer.initialized).toHaveBeenCalledOnce();
  expect(puppeteer.launch).toHaveBeenLastCalledWith(expect.objectContaining({
    executablePath: "chrome.exe",
    headless: true,
  }));

  const connected = await launchCdpBrowser({ executablePath: "chrome.exe", headless: false });
  expect(connected.browser).toBe(browser);
  expect(puppeteer.initialized).toHaveBeenCalledOnce();
  expect(puppeteer.launch).toHaveBeenLastCalledWith(expect.objectContaining({
    executablePath: "chrome.exe",
    headless: false,
  }));
  await connected.cleanup();
  expect(browser.close).toHaveBeenCalledOnce();
});
