/**
 * 信源 ref 入库与查询统一键（规范化存储）：
 * - http(s)：scheme、host（含端口）小写；pathname 小写并去掉非根路径末尾 `/`；query、hash 保持原样（避免破坏带大小写的查询参数）。
 * - 非 http(s)：trim 后全串小写。
 */
export function canonicalHttpSourceRef(ref: string): string {
  const t = ref.trim();
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return t.toLowerCase();
  try {
    const u = new URL(t);
    const protocol = u.protocol.toLowerCase();
    const host = u.host.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    path = path.toLowerCase();
    return `${protocol}//${host}${path}${u.search}${u.hash}`;
  } catch {
    return t.toLowerCase();
  }
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * 将 GROUP BY source_url 的统计按规范化键合并（兼容迁移前旧数据或异常重复写法）。
 */
export function mergeSourceStatsRows(
  rows: { source_url: string; count: number; count_7d: number; latest_at: string | null }[],
): { source_url: string; count: number; count_7d: number; latest_at: string | null }[] {
  const map = new Map<string, { count: number; count_7d: number; latest_at: string | null }>();
  for (const row of rows) {
    const k = canonicalHttpSourceRef(row.source_url);
    const prev = map.get(k);
    const count7 = row.count_7d ?? 0;
    if (!prev) {
      map.set(k, { count: row.count, count_7d: count7, latest_at: row.latest_at });
    } else {
      map.set(k, {
        count: prev.count + row.count,
        count_7d: prev.count_7d + count7,
        latest_at: maxIso(prev.latest_at, row.latest_at),
      });
    }
  }
  return [...map.entries()]
    .map(([source_url, v]) => ({ source_url, count: v.count, count_7d: v.count_7d, latest_at: v.latest_at }))
    .sort((a, b) => b.count - a.count);
}
