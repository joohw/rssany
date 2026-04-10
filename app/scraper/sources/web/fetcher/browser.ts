// 使用无头浏览器（Puppeteer）拉取页面，缓存逻辑在 cacher 中

import { exec } from "node:child_process";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import puppeteerCore, { type Browser, type Page } from "puppeteer-core";
import { applyPurify } from "./purify.js";
import { findChromeExecutable } from "./cdp.js";
import type { AuthFlow } from "../../../auth/index.js";
import type { RequestConfig, StructuredHtmlResult } from "./types.js";
import { logger } from "../../../../core/logger/index.js";

const execAsync = promisify(exec);

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


/** 获取 userDataDir：统一使用 main 目录，所有站点共享同一浏览器 profile */
function getUserDataDir(cacheDir?: string): string | undefined {
  if (!cacheDir) return undefined;
  return join(cacheDir, "browser_data", "main");
}


/** 是否为「userDataDir 已被占用」的报错（上次进程未正常退出或并发启动） */
function isAlreadyRunningError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /already running/i.test(msg) && /userDataDir|user-data-dir|user data dir/i.test(msg);
}


/**
 * 强制结束占用指定 userDataDir 的 Chrome/Chromium 进程（上次未正常退出时残留）。
 * 仅在 darwin/linux 下执行；启动前调用以释放 profile 锁。
 */
async function killStaleChromeProcesses(absUserDataDir: string): Promise<void> {
  const plat = platform();
  if (plat !== "darwin" && plat !== "linux") {
    return;
  }
  try {
    // 匹配命令行中包含该 userDataDir 的进程（Chrome 使用 --user-data-dir=/path）
    const psCmd = plat === "darwin"
      ? `ps -eww -o pid= -o args= 2>/dev/null`
      : `ps -eo pid,args --no-headers 2>/dev/null`;
    const { stdout } = await execAsync(psCmd, { maxBuffer: 4 * 1024 * 1024 });
    const pids = new Set<number>();
    const lineRegex = /^\s*(\d+)\s+/;
    for (const line of stdout.split("\n")) {
      if (!line.includes(absUserDataDir)) continue;
      const m = line.match(lineRegex);
      if (m) pids.add(parseInt(m[1], 10));
    }
    if (pids.size === 0) return;
    logger.info("scraper", "发现占用 browser_data 的 Chrome 进程，正在结束", { pids: [...pids], userDataDir: absUserDataDir });
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // 进程可能已退出
      }
    }
    await new Promise((r) => setTimeout(r, 800));
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    logger.warn("scraper", "结束残留 Chrome 进程时出错", { err: err instanceof Error ? err.message : String(err) });
  }
}


// 注入脚本隐藏自动化特征
async function stealthPage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    /* global navigator, window, document */
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


// ─── 浏览器：单发模式 ─────────────────────────────────────────────────────────
// 每次任务独立启动 Chrome，用毕在调用方 `browser.close()`；不保留全局单例，不跨请求复用 Tab。

/** 是否为「frame 已分离」类错误（页面发生客户端导航/重定向导致主 frame 失效） */
function isFrameDetachedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /detached|Navigating frame was detached|Session closed/i.test(msg);
}


/**
 * 启动新的 Chrome 实例（不缓存、不复用）。调用方须在 `finally` 中 `await browser.close()`。
 */
export async function launchBrowser(config: {
  headless?: boolean;
  cacheDir?: string;
  proxy?: string;
  chromeExecutablePath?: string;
}): Promise<Browser> {
  const wantHeadless = config.headless !== false;
  const executablePath = config.chromeExecutablePath ?? process.env.CHROME_PATH ?? findChromeExecutable();
  if (!executablePath) {
    throw new Error("未找到 Chrome 可执行文件，请安装 Google Chrome 或设置 CHROME_PATH 环境变量");
  }
  const userDataDir = getUserDataDir(config.cacheDir);
  const maxRetries = 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 0 && userDataDir) {
        const absUserDataDir = resolve(userDataDir);
        await killStaleChromeProcesses(absUserDataDir);
      }
      if (attempt > 0) {
        const waitMs = attempt * 2000;
        logger.info("scraper", "userDataDir 曾被占用，等待后重试", { waitMs, attempt });
        await new Promise((r) => setTimeout(r, waitMs));
      }
      return await puppeteerCore.launch({
        headless: wantHeadless,
        args: launchArgs({ proxy: config.proxy, headless: wantHeadless }),
        userDataDir,
        executablePath,
        ignoreDefaultArgs: ["--enable-automation"],
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries && isAlreadyRunningError(e)) {
        continue;
      }
      if (isAlreadyRunningError(e)) {
        const dir = userDataDir ?? "browser_data/main";
        throw new Error(
          `Chrome 的 profile 目录已被占用（${dir}）。通常是因为上次未正常退出或同时运行了多个本服务实例。请关闭占用该目录的 Chrome 进程后重试，或设置环境变量 CACHE_DIR 使用不同缓存目录。`
        );
      }
      throw e;
    }
  }
  throw lastErr;
}


/** @deprecated 使用 `launchBrowser`；行为与单发启动一致，不再复用全局实例 */
export const getOrCreateBrowser = launchBrowser;


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
  const browser = await launchBrowser({
    headless: isHeadless,
    cacheDir,
    proxy: resolveProxy(opts),
  });
  try {
    const page = await browser.newPage();
    try {
      await setupPage(page, isHeadless);
      await applyProxyAuthToPage(page, opts);
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await checkAuth(page, page.url());
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}


// 执行认证流程：单发有头浏览器打开登录页，等待用户完成登录后关闭进程
export async function ensureAuth(
  authFlow: AuthFlow,
  cacheDir: string,
  opts?: { proxy?: string }
): Promise<void> {
  const { checkAuth, loginUrl, loginTimeoutMs = 60 * 1000, pollIntervalMs = 2000 } = authFlow;
  const browser = await launchBrowser({ headless: false, cacheDir, proxy: resolveProxy(opts) });
  try {
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
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}


// 单发浏览器：本次任务内最多开两个 Tab（frame 分离时重试一次），结束后关闭 Chrome
// 若发生「Navigating frame was detached」等 frame 分离错误（常见于 SPA 客户端跳转），会换新 Tab 重试一次，并用 domcontentloaded 尽快取 HTML
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
    useHttpResponseBody,
  } = config;
  const isHeadless = headless !== false;
  const browser = await launchBrowser({
    headless: isHeadless,
    cacheDir,
    proxy: resolveProxy(config),
    chromeExecutablePath: config.chromeExecutablePath,
  });
  const navigationTimeout = timeoutMs ?? 60000;
  const maxAttempts = 2;
  let lastError: unknown;

  try {
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
        await page.close().catch(() => {});
        return { finalUrl, status, statusText, headers: normalizedHeaders, body };
      } catch (e) {
        lastError = e;
        await page.close().catch(() => {});
        if (isRetry || !isFrameDetachedError(e)) {
          throw e;
        }
        logger.warn("scraper", "fetchHtml 因 frame 分离重试", { url, attempt: attempt + 1, err: e instanceof Error ? e.message : String(e) });
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw lastError;
  } finally {
    await browser.close().catch(() => {});
  }
}
