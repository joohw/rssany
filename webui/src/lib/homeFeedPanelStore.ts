import { writable } from 'svelte/store';

/** 首页右侧条目栏当前选中的信源（由 layout 渲染面板，与 shell-frame 并行） */
export type HomeFeedPanelSource = {
  ref: string;
  displayLabel: string;
  /** 展示在标题下方，替代 ref 行 */
  description?: string;
  /** 配置了单源代理时，详情标题旁显示地球图标 */
  proxy?: string;
};

export const homeFeedPanelSource = writable<HomeFeedPanelSource | null>(null);
