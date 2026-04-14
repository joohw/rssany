import { writable } from 'svelte/store';

/** 与 SourcesList / getSource 一致的解析方式提示（用于右侧栏图标） */
export type HomeFeedParseHint = 'rss' | 'plugin' | 'llm' | 'email';

/** 首页右侧条目栏当前选中的信源（由 layout 渲染面板，与 shell-frame 并行） */
export type HomeFeedPanelSource = {
  ref: string;
  displayLabel: string;
  /** 展示在标题下方，替代 ref 行 */
  description?: string;
  /** 配置了单源代理时，详情标题旁显示地球图标 */
  proxy?: string;
  /** 解析方式：RSS / 插件 / LLM / 邮箱，标题旁展示对应图标 */
  parseHint?: HomeFeedParseHint | null;
};

export const homeFeedPanelSource = writable<HomeFeedPanelSource | null>(null);
