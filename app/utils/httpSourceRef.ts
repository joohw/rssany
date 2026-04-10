/**
 * HTTP(S) 信源 ref 入库与查询统一：去掉 path 末尾多余 `/`，避免与订阅里写法不一致。
 * 非 http(s) 协议原样返回。
 */
export function canonicalHttpSourceRef(ref: string): string {
  const t = ref.trim();
  if (!/^https?:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${u.origin}${path}${u.search}${u.hash}`;
  } catch {
    return t;
  }
}
