/** 与 `app/utils/httpSourceRef.ts` 中 `canonicalHttpSourceRef` 一致（供首页统计键与订阅 ref 对齐） */
export function canonicalHttpSourceRef(ref: string): string {
  const t = ref.trim();
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return t.toLowerCase();
  try {
    const u = new URL(t);
    const protocol = u.protocol.toLowerCase();
    const host = u.host.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    path = path.toLowerCase();
    return `${protocol}//${host}${path}${u.search}${u.hash}`;
  } catch {
    return t.toLowerCase();
  }
}
