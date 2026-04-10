/** 与 `app/utils/httpSourceRef.ts` 中 `canonicalHttpSourceRef` 一致（供首页统计键对齐） */
export function canonicalHttpSourceRef(ref: string): string {
  const t = ref.trim();
  if (!/^https?:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.origin}${path}${u.search}${u.hash}`;
  } catch {
    return t;
  }
}
