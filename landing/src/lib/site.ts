export const SITE_NAME = "rssany";

export const SITE_TAGLINE = "自托管订阅管线 · 把任何信息变成 RSS";

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function getPublicSiteUrlFromRequest(host?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!host) return "http://localhost:28473";
  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;
}

/** @deprecated Use getHomeTitle from @/lib/seo for localized titles. */
export const HOME_TITLE = "自托管 RSS 订阅管线 · 网页 / RSS / 邮件统一入库 · rssany";

/** @deprecated Use buildPageMetadata from @/lib/seo. */
export const DEFAULT_DESCRIPTION =
  "RssAny 把网页列表、RSS/Atom、邮件等信源通过定时抓取与插件解析，变成统一条目库，再输出 RSS XML、JSON API，并可选 MCP 消费。";
