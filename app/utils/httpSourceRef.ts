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

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * 将 GROUP BY source_url 的统计按 canonical 合并（库中可能同时存在 /feed 与 /feed/ 等写法）。
 */
export function mergeSourceStatsRows(
  rows: { source_url: string; count: number; latest_at: string | null }[],
): { source_url: string; count: number; latest_at: string | null }[] {
  const map = new Map<string, { count: number; latest_at: string | null }>();
  for (const row of rows) {
    const k = canonicalHttpSourceRef(row.source_url);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { count: row.count, latest_at: row.latest_at });
    } else {
      map.set(k, {
        count: prev.count + row.count,
        latest_at: maxIso(prev.latest_at, row.latest_at),
      });
    }
  }
  return [...map.entries()]
    .map(([source_url, v]) => ({ source_url, count: v.count, latest_at: v.latest_at }))
    .sort((a, b) => b.count - a.count);
}
