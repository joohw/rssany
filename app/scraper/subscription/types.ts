// 订阅配置类型：一个订阅由多个信源组成，支持网页、RSS、邮件、API 等多种类型

import type { RefreshInterval } from "../../utils/refreshInterval.js";


/** 信源类型枚举 */
export type SourceType = "web" | "rss" | "email";

/** 信源代理策略：默认直连；仅显式选择 default/custom 时使用代理。 */
export type SourceProxyMode = "none" | "default" | "custom";


/**
 * 单个信源配置
 *
 * ref 格式示例：
 *   web / rss  →  https://sspai.com/feed
 *              →  https://xiaohongshu.com/user/profile/xxx
 *   email      →  imaps://user:password@imap.gmail.com:993/INBOX
 *              →  imap://user:password@imap.qq.com:143/INBOX
 *              →  imaps://me%40gmail.com:app-password@imap.gmail.com/INBOX
 *              （用户名含 @ 时用 %40 编码；Gmail 需使用「应用专用密码」）
 */
export interface SubscriptionSource {
  /** 信源标识符：HTTP(S) URL、imaps?:// 连接串、或采集器自定义协议（如 lingowhale://） */
  ref: string;
  /** 信源类型（省略时由 getSource 自动识别） */
  type?: SourceType;
  /** 显示名称，用于界面展示和报错信息（省略则显示 ref） */
  label?: string;
  /** 简短描述，用于界面展示信源用途或内容说明 */
  description?: string;
  /** 分组路径；每个元素是一层目录，空数组或省略均表示根路径 */
  group?: string[];
  /** 单源有效时间窗口覆盖：优先级高于 Collector 声明；不填则使用 Collector 声明 */
  refresh?: RefreshInterval;
  /** 单源 cron 表达式（如 "0 9 * * *" 每天 9:00）；有值时优先于 refresh */
  cron?: string;
  /** 代理策略；省略时兼容旧配置：有 proxy 视为 custom，否则视为 none。 */
  proxyMode?: SourceProxyMode;
  /** proxyMode=custom 时使用的代理地址。 */
  proxy?: string;
  /** 信源权重，用于排序与优先级控制；默认 0，值越大优先级越高 */
  weight?: number;
}


/** config.json 的 sources 标准格式：信源保持扁平存储，通过 group 路径表达分组与嵌套 */
export interface SourcesFile {
  /** 所有要抓取的信源 */
  sources: SubscriptionSource[];
}

/** 由信源 group 路径聚合出的只读分组树。 */
export interface SourceGroupTreeNode {
  name: string;
  path: string[];
  /** 当前节点及全部子节点包含的信源总数。 */
  sourceCount: number;
  children: SourceGroupTreeNode[];
}

/** 规范化分组路径；旧配置未提供 group 时落在根路径。 */
export function normalizeSourceGroup(group: unknown): string[] {
  if (!Array.isArray(group)) return [];
  return group
    .filter((segment): segment is string => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** 规范化代理策略，同时兼容只有 proxy 字段的旧配置。 */
export function normalizeSourceProxyMode(mode: unknown, proxy?: unknown): SourceProxyMode {
  if (mode === "none" || mode === "default") return mode;
  if (mode === "custom") return typeof proxy === "string" && proxy.trim() ? "custom" : "none";
  return typeof proxy === "string" && proxy.trim() ? "custom" : "none";
}


/** 从旧格式（{ url }）或新格式（{ ref }）中提取信源标识符，确保向后兼容 */
export function resolveRef(src: SubscriptionSource | { url?: string; ref?: string }): string {
  return (src as SubscriptionSource).ref ?? (src as { url?: string }).url ?? "";
}
