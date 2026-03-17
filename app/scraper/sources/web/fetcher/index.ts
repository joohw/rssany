// 使用无头浏览器（Puppeteer）拉取页面
export { fetchHtml, ensureAuth, preCheckAuth, getOrCreateBrowser } from "./browser.js";
export { cacheKey, cacheKeyFromCron, readProfile, writeProfile } from "../../../../core/cacher/index.js";
export type { AuthProfile } from "../../../../core/cacher/index.js";
export type { CheckAuthFn, AuthFlow } from "../../../auth/index.js";
// 类型定义
export type { CacheKeyStrategy, RequestConfig, StructuredHtmlResult } from "./types.js";
