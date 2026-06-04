/** 条目封面 URL：浏览器直连 + no-referrer（服务端代理对部分 CDN 无效） */
export function coverImageSrc(url: string | undefined | null): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  return u;
}
