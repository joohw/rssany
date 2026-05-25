export const SITE_NAME = "rssany";

export const SITE_TAGLINE = "定制专属信息源 · 内容生产与资讯管线";

export const GITHUB_URL = (process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/joohw/rssany").trim();

export const NPM_URL = "https://www.npmjs.com/package/rssany";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** Prefer PUBLIC_SITE_URL so sitemap/robots stay stable in production. */
export function resolvePublicSiteUrl(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return getPublicSiteUrlFromRequest(host);
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!host) return "http://localhost:28473";
  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;
}

export function getSiteHost(siteUrl: string): string | undefined {
  try {
    return new URL(siteUrl).host;
  } catch {
    return undefined;
  }
}

/** @deprecated Use getHomeTitle from @/lib/seo for localized titles. */
export const HOME_TITLE = "定制专属信息源 · 内容生产与资讯管线 · rssany";

/** @deprecated Use buildPageMetadata from @/lib/seo. */
export const DEFAULT_DESCRIPTION =
  "RssAny 面向内容生产与资讯工作流，帮你定制网页、RSS、邮件等信源，定时抓取与插件解析后统一入库，再输出 RSS、JSON API 与 MCP，接入创作与分发管线。";
