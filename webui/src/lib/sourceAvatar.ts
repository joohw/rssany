/**
 * FeedCard 等：按 sourceRef（及条目 link、作者）解析站点 hostname、favicon URL、字母回退与稳定背景色。
 * favicon 实际加载失败需在 UI 层用 onerror 置位后再用 letter + avatarBg。
 */

export function firstLetterFromName(name: string): string {
  const t = name.trim();
  if (!t) return '';
  const ch = t.charAt(0);
  return /[a-z0-9\u4e00-\u9fff]/i.test(ch) ? ch.toUpperCase() : '';
}

/** 从条目链接或 sourceRef（可为站点 URL）解析站点 hostname，供 favicon / 首字母 */
export function siteHostnameFromItem(articleLink: string, ref?: string): string {
  const tryOne = (raw: string): string => {
    const s = raw?.trim();
    if (!s) return '';
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      const h = u.hostname.replace(/^www\./i, '');
      return h || '';
    } catch {
      return '';
    }
  };
  return tryOne(articleLink) || tryOne(ref || '');
}

function firstLetterFromHostname(hostname: string): string {
  if (!hostname) return '';
  const c = hostname.charAt(0);
  return /[a-z0-9\u4e00-\u9fff]/i.test(c) ? c.toUpperCase() : '';
}

/**
 * 字母回退：站点域名首字 → 作者；再无则 sourceRef 首字
 */
export function letterAvatar(
  articleLink: string,
  ref: string | undefined,
  authorsList: { name: string }[] | undefined,
  authorName: string | undefined,
): string {
  const host = siteHostnameFromItem(articleLink, ref);
  const fromSite = firstLetterFromHostname(host);
  if (fromSite) return fromSite;
  if (authorsList && authorsList.length > 0) {
    const L = firstLetterFromName(authorsList[0].name);
    if (L) return L;
  }
  if (authorName) {
    const L = firstLetterFromName(authorName);
    if (L) return L;
  }
  const s = (ref || '').trim();
  if (s) {
    const ch = s.charAt(0);
    return /[a-z0-9\u4e00-\u9fff]/i.test(ch) ? ch.toUpperCase() : '?';
  }
  return '?';
}

/** 经本站 /api/feed-favicon：服务端缓存站点图标 */
export function faviconUrlForHost(hostname: string): string {
  if (!hostname) return '';
  return `/api/feed-favicon?domain=${encodeURIComponent(hostname)}`;
}

/** 稳定哈希 → 随机色相；背景固定饱和度与明度 */
export function avatarBgFromSeed(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const hue = u % 360;
  return `hsl(${hue} 46% 46%)`;
}

export type SourceAvatarInput = {
  sourceRef?: string;
  /** 条目链接，优先用于解析站点域名 */
  link?: string;
  author?: string;
  authors?: { name: string }[];
  /** 用于 avatarSeed 稳定性 */
  guid?: string;
  title?: string;
};

export type SourceAvatarResult = {
  siteHost: string;
  faviconSrc: string;
  letter: string;
  avatarSeed: string;
  avatarBg: string;
};

/**
 * 根据 sourceRef（及 link、作者等）计算头像展示用数据：favicon URL、字母回退、背景 seed 色。
 * 是否显示图标由调用方根据图片 onerror 等决定。
 */
export function getAvatarBySourceRef(input: SourceAvatarInput): SourceAvatarResult {
  const link = input.link || '';
  const sourceRef = input.sourceRef;
  const { author, authors, guid, title } = input;

  const siteHost = siteHostnameFromItem(link, sourceRef);
  const faviconSrc = faviconUrlForHost(siteHost);
  const letter = letterAvatar(link, sourceRef, authors, author);

  const avatarSeed = (
    guid ||
    [link, sourceRef, title, author, authors?.map((a) => a.name).join('|')]
      .filter(Boolean)
      .join('|') ||
    letter
  ).trim();

  const avatarBg = avatarBgFromSeed(avatarSeed || 'feed');

  return {
    siteHost,
    faviconSrc,
    letter,
    avatarSeed,
    avatarBg,
  };
}
