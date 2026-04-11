/**
 * 系统内部统一的 Feed Item 定义
 * 插件 → Normalizer → RSS Generator
 * 自包含：携带 sourceRef 后，入库 / Signal 投递等无需再单独传 ref。
 */

/** 单语种译文字段（key 为 BCP 47，如 zh-CN、en） */
export interface ItemTranslationFields {
    title?: string;
    summary?: string;
    content?: string;
}

/** 带可选 translations 的条目视图（FeedItem 或 DB 行 + translations 等） */
export interface ItemWithOptionalTranslations {
    title: string;
    summary?: string;
    content?: string;
    translations?: Record<string, ItemTranslationFields>;
}

/**
 * 根据 lng 取条目的「有效」标题/摘要/正文：有 translations[lng] 则优先用译文，否则用原文。
 * 路由层传 lng 时用此结果生成 RSS 或 API 响应。
 */
export function getEffectiveItemFields(
    item: ItemWithOptionalTranslations,
    lng?: string | null,
): { title: string; summary: string; content: string } {
    const raw = lng && lng !== "" ? item.translations?.[lng] : undefined;
    const t = raw && typeof raw === "object" ? raw : undefined;
    return {
        title: (t?.title != null && t.title !== "" ? t.title : item.title) ?? "",
        summary: (t?.summary != null && t.summary !== "" ? t.summary : item.summary) ?? "",
        content: (t?.content != null && t.content !== "" ? t.content : item.content) ?? "",
    };
}

/** 将发布时间转为 ISO 字符串供入库/序列化；Invalid Date 返回 null（避免 toISOString 抛 RangeError） */
export function pubDateToIsoOrNull(pubDate: unknown): string | null {
    if (pubDate == null) return null;
    if (pubDate instanceof Date) {
        const ms = pubDate.getTime();
        return Number.isNaN(ms) ? null : pubDate.toISOString();
    }
    if (typeof pubDate === "string") {
        const s = pubDate.trim();
        return s || null;
    }
    return null;
}

/** 将 author 规范为 string[]，兼容 string 输入（插件等） */
export function normalizeAuthor(author: string | string[] | null | undefined): string[] | undefined {
    if (author == null) return undefined;
    if (Array.isArray(author)) return author.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
    const s = String(author).trim();
    return s ? [s] : undefined;
}

/** 将 author 转为显示用字符串（逗号分隔） */
export function authorToDisplay(author: string | string[] | null | undefined): string {
    const arr = normalizeAuthor(author);
    return arr?.join(", ") ?? "";
}

export interface FeedItem {
    /** 全局唯一标识，link 或稳定 hash */
    guid: string;
    /** 标题 */
    title: string;
    /** 原文链接 */
    link: string;
    /** 发布时间 */
    pubDate: Date;
    /** 作者列表 */
    author?: string[];
    /** 简要描述（纯文本，适合 RSS description） */
    summary?: string;
    /** 详情正文（输出到 RSS description） */
    content?: string;
    /** 条目配图 URL，输出为 RSS 2.0 <enclosure type="image/..."> */
    imageUrl?: string;
    /**
     * 封面图：支持 http(s) URL、data URL，或裸 base64（可规范为 data:image/jpeg;base64,...）。
     * Gateway JSON 字段名 `cover_img`。
     */
    cover_img?: string;
    /** RSS 来源分类（直接来自 feed 的 <category> 字段） */
    categories?: string[];
    /** 系统 / pipeline 生成的标签（从用户管理的标签库中匹配） */
    tags?: string[];
    /** 信源标识（列表页 URL 或 imap 等），入库与按 ref 筛选用；设后则 upsertItems 等无需再传 ref */
    sourceRef?: string;
    /**
     * 多语种译文。key 为 BCP 47（如 zh-CN、en），路由支持 lng 参数时可据此返回对应译文。
     * 由 pipeline（如 translator）写入。
     */
    translations?: Record<string, ItemTranslationFields>;
    /**
     * 扩展字段，给插件留后门。
     * 框架保留键：`_rssanyPipelineDrop` 为 true 表示 pipeline 质量过滤丢弃，feeder 会删库并移出 RSS。
     */
    extra?: Record<string, unknown>;
  }

/** Pipeline 质量过滤等步骤标记的丢弃键（写入 item.extra） */
export const PIPELINE_DROP_EXTRA_KEY = "_rssanyPipelineDrop";

export function markPipelineDrop(item: FeedItem): FeedItem {
  item.extra = { ...item.extra, [PIPELINE_DROP_EXTRA_KEY]: true };
  return item;
}

export function isPipelineDroppedItem(item: FeedItem): boolean {
  return item.extra?.[PIPELINE_DROP_EXTRA_KEY] === true;
}