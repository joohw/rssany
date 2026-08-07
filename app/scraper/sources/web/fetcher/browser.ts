// 使用无头浏览器（Puppeteer）拉取页面，缓存逻辑在 cacher 中

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import puppeteerCore, { type Browser, type Page } from "puppeteer-core";
import { applyPurify } from "./purify.js";
import { findChromeExecutable } from "./cdp.js";
import type { AuthFlow } from "../../../auth/index.js";
import type { RequestConfig, StructuredHtmlResult } from "./types.js";
import { logger } from "../../../../core/logger/index.js";

/** 与 launchArgs / setViewport 一致；无头拉高便于长页与懒加载内容 */
const VIEWPORT_WIDTH = 1366;
const VIEWPORT_HEIGHT_HEADLESS = 5000;
const VIEWPORT_HEIGHT_HEADFUL = 1200;

/** 解析代理：显式传入的 proxy，否则 HTTP_PROXY / HTTPS_PROXY */
export function resolveProxy(config?: { proxy?: string }): string | undefined {
  return config?.proxy ?? process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY;
}

/** 从代理字符串解析出 serverUrl 和可选账号密码；支持 http://user:pass@host:port */
function parseProxy(proxy: string): { serverUrl: string; username?: string; password?: string } {
  const u = new URL(proxy);
  const serverUrl = u.port ? `${u.protocol}//${u.hostname}:${u.port}` : `${u.protocol}//${u.hostname}`;
  const username = u.username || undefined;
  const password = u.password || undefined;
  return { serverUrl, username, password };
}

/** 在 Page 上设置代理认证（与 preCheckAuth / fetchHtml 一致；需与 launchBrowser 的 proxy 同时使用） */
export async function applyProxyAuthToPage(page: Page, opts?: { proxy?: string }): Promise<void> {
  const proxy = resolveProxy(opts);
  if (!proxy) return;
  const { username, password } = parseProxy(proxy);
  if (username !== undefined || password !== undefined) {
    await page.authenticate({ username: username ?? "", password: password ?? "" });
  }
}


/** 构建 Puppeteer launch args */
function launchArgs(config?: { proxy?: string; headless?: boolean }): string[] {
  const base = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-site-isolation-trials",
    "--disable-infobars",
  ];
  const height = config?.headless !== false ? VIEWPORT_HEIGHT_HEADLESS : VIEWPORT_HEIGHT_HEADFUL;
  base.push(`--window-size=${VIEWPORT_WIDTH},${height}`);
  const proxy = resolveProxy(config);
  if (proxy) {
    const { serverUrl } = parseProxy(proxy);
    base.push(`--proxy-server=${serverUrl}`);
  }
  return base;
}


/** 获取 userDataDir：默认共享 main；不同代理使用独立 profile，避免 Chrome profile 锁冲突。 */
function proxyProfileName(proxy?: string): string {
  if (!proxy) return "main";
  const hash = createHash("sha1").update(proxy).digest("hex").slice(0, 12);
  return `main_proxy_${hash}`;
}

function getUserDataDir(cacheDir?: string, proxy?: string): string | undefined {
  if (!cacheDir) return undefined;
  return join(cacheDir, "browser_data", proxyProfileName(proxy));
}


/** 是否为「userDataDir 已被占用」的报错（上次进程未正常退出或并发启动） */
function isAlreadyRunningError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /already running/i.test(msg) && /userDataDir|user-data-dir|user data dir/i.test(msg);
}


// 注入脚本隐藏自动化特征
async function stealthPage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    /* global navigator, window */
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
    const originalQuery = window.navigator.permissions.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };
    Object.defineProperty(Notification, "permission", { get: () => "default" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (nav.getBattery) {
      nav.getBattery = () => Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 });
    }
  });
  await page.setExtraHTTPHeaders({
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  });
}


function headersToRecord(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = String(v);
  }
  return out;
}


/** 对新 Page 做通用初始化：UA、Viewport、stealth 脚本 */
async function setupPage(page: Page, headless = true): Promise<void> {
  const realUserAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  await page.setUserAgent(realUserAgent);
  await page.setViewport({
    width: VIEWPORT_WIDTH,
    height: headless ? VIEWPORT_HEIGHT_HEADLESS : VIEWPORT_HEIGHT_HEADFUL,
  });
  await stealthPage(page);
}


// ─── 浏览器：共享实例模式 ─────────────────────────────────────────────────────
// 同一 launch 桶复用 Chrome 进程；每次请求只创建并关闭自己的 Tab。

/** 是否为「frame 已分离」类错误（页面发生客户端导航/重定向导致主 frame 失效） */
function isFrameDetachedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /detached|Navigating frame was detached|Session closed/i.test(msg);
}


type BrowserLaunchConfig = {
  headless?: boolean;
  cacheDir?: string;
  proxy?: string;
  chromeExecutablePath?: string;
};

type SharedBrowserSlot = {
  browser?: Browser;
  promise?: Promise<Browser>;
  headless?: boolean;
};

const sharedBrowsers = new Map<string, SharedBrowserSlot>();
const browserTransitions = new Map<string, Promise<void>>();
const FORCE_CLOSE_TIMEOUT_MS = 3_000;

function browserKey(config: BrowserLaunchConfig): string {
  const executablePath = config.chromeExecutablePath ?? process.env.CHROME_PATH ?? findChromeExecutable() ?? "";
  const proxy = resolveProxy(config) ?? "";
  const userDataDir = getUserDataDir(config.cacheDir, proxy);
  return JSON.stringify({
    userDataDir: userDataDir ? resolve(userDataDir) : "",
    proxy,
    executablePath,
  });
}

function isBrowserConnected(browser: Browser | undefined): browser is Browser {
  return !!browser && browser.connected !== false;
}

function isOwnedBrowser(browser: Browser): boolean {
  return browser.process() != null;
}

async function closeOrDisconnectBrowser(browser: Browser): Promise<void> {
  if (isOwnedBrowser(browser)) {
    await browser.close().catch(() => {});
    return;
  }
  await browser.disconnect().catch(() => {});
}

async function connectToProfileBrowser(userDataDir: string | undefined): Promise<Browser | null> {
  if (!userDataDir) return null;
  try {
    const raw = await readFile(join(userDataDir, "DevToolsActivePort"), "utf8");
    const [portLine, endpointLine] = raw.split(/\r?\n/);
    const port = Number(portLine?.trim());
    const endpoint = endpointLine?.trim();
    if (!Number.isInteger(port) || port <= 0 || !endpoint?.startsWith("/devtools/browser/")) {
      return null;
    }
    return await puppeteerCore.connect({
      browserWSEndpoint: `ws://127.0.0.1:${port}${endpoint}`,
    });
  } catch {
    return null;
  }
}

async function withBrowserTransition<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = browserTransitions.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const tail = previous.catch(() => {}).then(() => gate);
  browserTransitions.set(key, tail);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (browserTransitions.get(key) === tail) {
      browserTransitions.delete(key);
    }
  }
}

/**
 * 启动新的 Chrome 实例；无头模式遇到已占用 profile 时会连接现有 Chrome。
 * 调用方须在 `finally` 中关闭自行启动的实例，或断开复用实例的 CDP 连接。
 */
export async function launchBrowser(config: BrowserLaunchConfig): Promise<Browser> {
  const wantHeadless = config.headless !== false;
  const executablePath = config.chromeExecutablePath ?? process.env.CHROME_PATH ?? findChromeExecutable();
  if (!executablePath) {
    throw new Error("未找到 Chrome 可执行文件，请安装 Google Chrome 或设置 CHROME_PATH 环境变量");
  }
  const proxy = resolveProxy(config);
  const userDataDir = getUserDataDir(config.cacheDir, proxy);
  const maxRetries = 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const waitMs = attempt * 2000;
        logger.info("scraper", "browser_data 正被使用，等待现有浏览器释放后重试", { waitMs, attempt });
        await new Promise((r) => setTimeout(r, waitMs));
      }
      return await puppeteerCore.launch({
        headless: wantHeadless,
        args: launchArgs({ proxy, headless: wantHeadless }),
        userDataDir,
        executablePath,
        ignoreDefaultArgs: ["--enable-automation"],
      });
    } catch (e) {
      lastErr = e;
      if (isAlreadyRunningError(e)) {
        const existing = wantHeadless
          ? await connectToProfileBrowser(userDataDir)
          : null;
        if (existing) {
          logger.info("scraper", "已连接正在使用 browser_data 的 Chrome", { userDataDir });
          return existing;
        }
        if (attempt < maxRetries) {
          continue;
        }
        const dir = userDataDir ?? "browser_data/main";
        throw new Error(
          `Chrome 的 profile 目录正被另一个 RssAny/Chrome 实例使用（${dir}）。为避免误关正在浏览或抓取的页面，RssAny 不会强制结束该进程。请关闭对应实例后重试，或为并行实例配置不同的 CACHE_DIR。`
        );
      }
      throw e;
    }
  }
  throw lastErr;
}


/**
 * Get a reusable browser for crawler requests.
 *
 * Proxy is a Chrome launch option, so reuse is bucketed by userDataDir/proxy/executablePath.
 * Requests in the same bucket share one browser and only create/close their own pages.
 */
export async function getOrCreateBrowser(config: BrowserLaunchConfig): Promise<Browser> {
  const normalizedConfig = { ...config, proxy: resolveProxy(config) };
  const key = browserKey(normalizedConfig);
  return withBrowserTransition(key, async () => {
    const wantHeadless = normalizedConfig.headless !== false;
    const current = sharedBrowsers.get(key);
    if (current?.promise) {
      const browser = await current.promise;
      if (isBrowserConnected(browser) && (wantHeadless || current.headless === false)) {
        return browser;
      }
      if (isBrowserConnected(browser)) {
        if (!isOwnedBrowser(browser)) {
          throw new Error("当前 profile 由其他 RssAny/Chrome 实例以无头模式管理，无法安全切换为有头模式");
        }
        await closeOrDisconnectBrowser(browser);
      }
      if (sharedBrowsers.get(key) === current) {
        sharedBrowsers.delete(key);
      }
    } else if (isBrowserConnected(current?.browser)) {
      if (wantHeadless || current.headless === false) {
        return current.browser;
      }
      if (!isOwnedBrowser(current.browser)) {
        throw new Error("当前 profile 由其他 RssAny/Chrome 实例以无头模式管理，无法安全切换为有头模式");
      }
      await closeOrDisconnectBrowser(current.browser);
      if (sharedBrowsers.get(key) === current) {
        sharedBrowsers.delete(key);
      }
    }

    const slot: SharedBrowserSlot = {};
    const promise = launchBrowser(normalizedConfig).then((browser) => {
      slot.browser = browser;
      slot.promise = undefined;
      slot.headless = wantHeadless;
      browser.once("disconnected", () => {
        if (sharedBrowsers.get(key)?.browser === browser) {
          sharedBrowsers.delete(key);
        }
      });
      return browser;
    }).catch((err) => {
      if (sharedBrowsers.get(key) === slot) {
        sharedBrowsers.delete(key);
      }
      throw err;
    });

    slot.promise = promise;
    sharedBrowsers.set(key, slot);
    return promise;
  });
}

/** 主动关闭当前进程创建的共享浏览器，供测试或优雅停机使用。 */
export async function closeSharedBrowsers(): Promise<void> {
  await Promise.all([...browserTransitions.values()].map((transition) => transition.catch(() => {})));
  const slots = [...sharedBrowsers.values()];
  sharedBrowsers.clear();
  const browsers = await Promise.all(
    slots.map(async (slot) => slot.browser ?? await slot.promise?.catch(() => undefined)),
  );
  await Promise.all(
    [...new Set(browsers.filter((browser): browser is Browser => isBrowserConnected(browser)))]
      .map((browser) => closeOrDisconnectBrowser(browser)),
  );
}

export interface ForceCloseSharedBrowsersResult {
  found: number;
  closed: number;
  terminated: number;
  failed: number;
}

/**
 * 强制关闭当前 RssAny 进程管理的全部共享 Chrome。
 *
 * 先给 Puppeteer 一个短暂的正常关闭窗口；若浏览器仍连接，则终止本进程启动的
 * Chrome 子进程。该函数不会扫描或结束其他 RssAny/Chrome 进程。
 */
export async function forceCloseSharedBrowsers(): Promise<ForceCloseSharedBrowsersResult> {
  await Promise.all([...browserTransitions.values()].map((transition) => transition.catch(() => {})));
  const slots = [...sharedBrowsers.values()];
  sharedBrowsers.clear();
  const browsers = await Promise.all(
    slots.map(async (slot) => slot.browser ?? await slot.promise?.catch(() => undefined)),
  );
  const uniqueBrowsers = [...new Set(
    browsers.filter((browser): browser is Browser => browser != null),
  )];
  const result: ForceCloseSharedBrowsersResult = {
    found: uniqueBrowsers.length,
    closed: 0,
    terminated: 0,
    failed: 0,
  };

  await Promise.all(uniqueBrowsers.map(async (browser) => {
    const closedNormally = await Promise.race([
      browser.close().then(() => true).catch(() => false),
      new Promise<false>((resolveTimeout) => {
        setTimeout(() => resolveTimeout(false), FORCE_CLOSE_TIMEOUT_MS);
      }),
    ]);
    if (closedNormally || !isBrowserConnected(browser)) {
      result.closed++;
      return;
    }

    const chromeProcess = browser.process();
    const terminated = chromeProcess != null
      && chromeProcess.exitCode == null
      && chromeProcess.kill();
    await browser.disconnect().catch(() => {});
    if (terminated) {
      result.terminated++;
    } else {
      result.failed++;
    }
  }));

  logger.warn("scraper", "已执行共享浏览器强制关闭", { ...result });
  return result;
}

/** 只关闭当前任务明确创建的页面；不按 URL、空白状态或延时猜测其他页面是否可关闭。 */
async function closeTaskPage(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page.close().catch(() => {});
}


// ─── 对外 API ─────────────────────────────────────────────────────────────────

/** 预检认证：单发浏览器（新开 Tab）检查是否已登录；opts 与 fetchHtml 一致（代理、有头/无头） */
export async function preCheckAuth(
  authFlow: AuthFlow,
  cacheDir: string,
  opts?: { proxy?: string; headless?: boolean }
): Promise<boolean> {
  const { checkAuth, loginUrl, domain } = authFlow;
  if (domain == null || !cacheDir) return true;
  const isHeadless = opts?.headless !== false;
  const browser = await getOrCreateBrowser({
    headless: isHeadless,
    cacheDir,
    proxy: resolveProxy(opts),
  });
  const page = await browser.newPage();
  try {
      await setupPage(page, isHeadless);
      await applyProxyAuthToPage(page, opts);
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await checkAuth(page, page.url());
  } finally {
    await closeTaskPage(page);
  }
}


// 执行认证流程：单发有头浏览器打开登录页，等待用户完成登录后关闭进程
export async function ensureAuth(
  authFlow: AuthFlow,
  cacheDir: string,
  opts?: { proxy?: string }
): Promise<void> {
  const { checkAuth, loginUrl, loginTimeoutMs = 60 * 1000, pollIntervalMs = 2000 } = authFlow;
  const browser = await getOrCreateBrowser({ headless: false, cacheDir, proxy: resolveProxy(opts) });
  const page = await browser.newPage();
  try {
      await setupPage(page, false);
      await applyProxyAuthToPage(page, opts);
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const authenticated = await checkAuth(page, page.url());
      if (authenticated) return;
      const startTime = Date.now();
      while (Date.now() - startTime < loginTimeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const authenticated = await checkAuth(page, page.url());
        if (authenticated) return;
      }
      throw new Error(`登录超时（${loginTimeoutMs}ms）`);
  } finally {
    await closeTaskPage(page);
  }
}


/**
 * Open a user-visible page in the same shared browser pool used by crawlers.
 *
 * The page stays open for manual debugging/login. If opening fails, only this
 * page is closed; the shared browser remains available for later crawler work.
 */
export async function openBrowserPage(
  url: string,
  cacheDir: string,
  opts?: { proxy?: string }
): Promise<Page> {
  const browser = await getOrCreateBrowser({ headless: false, cacheDir, proxy: resolveProxy(opts) });
  const page = await browser.newPage();
  try {
    await setupPage(page, false);
    await applyProxyAuthToPage(page, opts);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return page;
  } catch (err) {
    await closeTaskPage(page);
    throw err;
  }
}

// 共享浏览器：本次任务内最多开两个 Tab（frame 分离时重试一次），任务结束后关闭自己的 Page。
// 若发生「Navigating frame was detached」等 frame 分离错误（常见于 SPA 客户端跳转），会换新 Tab 重试一次，并用 domcontentloaded 尽快取 HTML。
export async function fetchHtml(url: string, config: RequestConfig = {}): Promise<StructuredHtmlResult> {
  const {
    timeoutMs,
    headers,
    cookies,
    cacheDir,
    checkAuth,
    authFlow,
    purify,
    headless,
    waitAfterLoadMs,
    waitForSelector,
    waitForSelectorTimeoutMs,
    scrollBeforeSnapshot,
    useHttpResponseBody,
  } = config;
  const isHeadless = headless !== false;
  const browser = await getOrCreateBrowser({
    headless: isHeadless,
    cacheDir,
    proxy: resolveProxy(config),
    chromeExecutablePath: config.chromeExecutablePath,
  });
  const navigationTimeout = timeoutMs ?? 60000;
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const page = await browser.newPage();
    const isRetry = attempt === 1;
      // 重试时用 domcontentloaded 尽快取 HTML，减少 SPA 客户端跳转在取 content 前发生的概率
      const waitUntil = isRetry ? "domcontentloaded" : "load";
      const extraWaitMs = isRetry ? Math.min(500, Math.max(0, waitAfterLoadMs ?? 2000)) : Math.max(0, waitAfterLoadMs ?? 2000);
      try {
        if (config.browserContext) {
          await config.browserContext(page.browserContext());
        }
        await setupPage(page, isHeadless);
        const extraHeaders: Record<string, string> = { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", ...(headers ?? {}) };
        if (cookies != null && cookies !== "") {
          extraHeaders.cookie = cookies;
        }
        await page.setExtraHTTPHeaders(extraHeaders);
        const proxy = resolveProxy(config);
        if (proxy) {
          const { username, password } = parseProxy(proxy);
          if (username !== undefined || password !== undefined) {
            await page.authenticate({ username: username ?? "", password: password ?? "" });
          }
        }
        if (timeoutMs != null) {
          await page.setDefaultNavigationTimeout(timeoutMs);
        }
        const response = await page.goto(url, { waitUntil, timeout: navigationTimeout });
        if (extraWaitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, extraWaitMs));
        }
        if (waitForSelector != null && waitForSelector !== "" && !isRetry) {
          const selectorTimeout = waitForSelectorTimeoutMs ?? 20000;
          await page.waitForSelector(waitForSelector, { timeout: selectorTimeout });
        }
        if (scrollBeforeSnapshot && !isRetry) {
          const scrollSelector = scrollBeforeSnapshot.selector ?? null;
          const rounds = scrollBeforeSnapshot.rounds ?? 6;
          const pauseMs = scrollBeforeSnapshot.pauseMs ?? 800;
          for (let i = 0; i < rounds; i++) {
            const before = await page.evaluate((sel) => {
              const target = sel ? document.querySelector(sel) : null;
              const el = target ?? document.scrollingElement ?? document.documentElement;
              return el?.scrollHeight ?? 0;
            }, scrollSelector);
            await page.evaluate((sel) => {
              const target = sel ? document.querySelector(sel) : null;
              const el = target ?? document.scrollingElement ?? document.documentElement;
              if (!el) return;
              el.scrollTop = el.scrollHeight;
              window.scrollBy(0, window.innerHeight);
            }, scrollSelector);
            await new Promise((resolve) => setTimeout(resolve, pauseMs));
            const after = await page.evaluate((sel) => {
              const target = sel ? document.querySelector(sel) : null;
              const el = target ?? document.scrollingElement ?? document.documentElement;
              return el?.scrollHeight ?? 0;
            }, scrollSelector);
            if (after <= before && i >= 2) break;
          }
        }
        if (checkAuth != null || authFlow != null) {
          const authCheck = checkAuth ?? authFlow?.checkAuth;
          if (authCheck != null) {
            const ok = await authCheck(page, url);
            if (!ok) {
              throw new Error("checkAuth failed: 未通过认证检查，请先调用 ensureAuth 进行预处理登录");
            }
          }
        }
        let rawBody: string;
        if (useHttpResponseBody === true && response != null) {
          try {
            rawBody = await response.text();
          } catch {
            rawBody = await page.content();
          }
        } else {
          rawBody = await page.content();
        }
        const finalUrl = response?.url() ?? page.url() ?? String(url);
        const status = response?.status() ?? 0;
        const statusText = response?.statusText() ?? "";
        const rawHeaders = response?.headers() ?? {};
        const normalizedHeaders = headersToRecord(rawHeaders);
        const body = applyPurify(rawBody, purify);
        return { finalUrl, status, statusText, headers: normalizedHeaders, body };
      } catch (e) {
        lastError = e;
        if (isRetry || !isFrameDetachedError(e)) {
          throw e;
        }
        logger.warn("scraper", "fetchHtml 因 frame 分离重试", { url, attempt: attempt + 1, err: e instanceof Error ? e.message : String(e) });
        await new Promise((r) => setTimeout(r, 800));
      } finally {
        await closeTaskPage(page);
      }
    }
  throw lastError;
}
