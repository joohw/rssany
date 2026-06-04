/**
 * 首页信源列表：从 http(s) ref 解析 hostname；图标由后端 `/api/feed-favicon` 拉取并磁盘缓存。
 */

/** 仅从 http(s) URL 信源得到 hostname（去 www.）；其它协议返回 null */
export function hostnameFromHttpSourceRef(ref: string): string | null {
  const t = ref.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    const h = u.hostname.replace(/^www\./i, '');
    return h || null;
  } catch {
    return null;
  }
}

/** 本站缓存型 favicon（与 agidaily 同源逻辑：先读 ~/.rssany/cache/feed-favicons） */
export function faviconUrlForHostname(hostname: string): string {
  return `/api/feed-favicon?domain=${encodeURIComponent(hostname)}`;
}
