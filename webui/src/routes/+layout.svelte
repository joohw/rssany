<script lang="ts">
  /// <reference path="../lucide-svelte.d.ts" />
  import Settings from 'lucide-svelte/icons/settings';
  import { siGithub } from 'simple-icons';
  import { page } from '$app/stores';
  import { PRODUCT_NAME, GITHUB_REPO_URL } from '$lib/brand';
  import Toast from '$lib/components/ui/Toast.svelte';
  import '../app.css';

  /** 首页与若干后台列表页：主区域占满顶栏下剩余高度，仅内部滚动 */
  function isMainFillRoute(pathname: string): boolean {
    if (pathname === '/' || pathname === '/admin') return true;
    if (
      pathname === '/admin/sources' ||
      pathname === '/admin/tags' ||
      pathname === '/plugins' ||
      pathname === '/logs'
    ) {
      return true;
    }
    if (pathname.startsWith('/plugins/') || pathname.startsWith('/logs/')) return true;
    return false;
  }

  $: pathname = $page.url.pathname;
  $: mainFillHeight = isMainFillRoute(pathname);

  $: navActive = {
    logs: pathname === '/logs' || pathname.startsWith('/logs/'),
    plugins: pathname.startsWith('/plugins'),
    tags: pathname === '/admin/tags' || pathname.startsWith('/admin/tags/'),
  } as const;
</script>

<div class="layout-outer">
  <div id="layout-inner-scroll" class="layout-inner">
    <header class="topbar">
      <div class="shell topbar-row">
        <div class="topbar-left">
          <a href="/" class="topbar-brand">{PRODUCT_NAME}</a>
          <a
            class="github-link"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在 GitHub 打开源码仓库"
            title="GitHub"
          >
            <svg class="github-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="currentColor" d={siGithub.path} />
            </svg>
          </a>
        </div>
        <div class="topbar-end">
          <nav class="topbar-quick" aria-label="后台快捷入口">
            <a
              href="/logs"
              class="topbar-quick-link"
              class:active={navActive.logs}
              title="运行日志"
            >日志</a>
            <a
              href="/plugins"
              class="topbar-quick-link"
              class:active={navActive.plugins}
              title="信源与扩展插件"
            >插件</a>
            <a
              href="/admin/tags"
              class="topbar-quick-link"
              class:active={navActive.tags}
              title="标签与分类"
            >标签</a>
          </nav>
          <a href="/admin" class="topbar-right" title="管理后台" aria-label="管理后台">
            <span class="topbar-icon"><Settings size={20} /></span>
          </a>
        </div>
      </div>
    </header>
    <main class="main shell" class:main-fill={mainFillHeight}>
      <slot />
    </main>
  </div>
</div>
<Toast />

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(button:not([class])),
  :global(button[class='']) {
    font: inherit;
    cursor: pointer;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm, 6px);
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  :global(button:not([class]):hover:not(:disabled)),
  :global(button[class='']:hover:not(:disabled)) {
    background: var(--color-accent);
    border-color: var(--color-border);
  }
  :global(button:not([class]):disabled),
  :global(button[class='']:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .layout-outer {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /**
   * 与主内容共用同一滚动条与同一列宽，避免顶栏与正文因滚动条占位不对齐。
   * shell：统一 max-width + 水平留白（略收紧顶栏上下内边距）
   */
  .shell {
    box-sizing: border-box;
    width: 100%;
    max-width: var(--content-max);
    margin-left: auto;
    margin-right: auto;
    padding-inline: var(--shell-gutter);
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    flex-shrink: 0;
    width: 100%;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }
  .topbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 1rem;
    padding-bottom: 0.5rem;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    min-width: 0;
  }
  .topbar-brand {
    display: inline-flex;
    align-items: center;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--color-foreground);
    text-decoration: none;
  }
  .topbar-brand:hover {
    color: var(--color-primary);
  }
  .github-link {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--color-muted-foreground);
    text-decoration: none;
    padding: 0.25rem;
    margin: -0.25rem;
    border-radius: 6px;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }
  .github-link:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .github-icon {
    width: 18px;
    height: 18px;
    display: block;
    opacity: 0.92;
  }
  .topbar-end {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }
  .topbar-quick {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    margin-right: 0.35rem;
  }
  .topbar-quick-link {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-muted-foreground-strong);
    text-decoration: none;
    padding: 0.35rem 0.55rem;
    border-radius: 6px;
    transition:
      color 0.15s ease,
      background 0.15s ease;
    white-space: nowrap;
  }
  .topbar-quick-link:hover:not(.active) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .topbar-quick-link.active {
    color: var(--color-primary);
  }
  .layout-inner {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-foreground);
    padding: 0.5rem;
    border-radius: 8px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar-right:hover {
    color: var(--color-primary);
    background: var(--color-muted);
  }
  .topbar-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }
  .topbar-icon :global(svg) {
    width: 20px;
    height: 20px;
  }
  .main {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding-top: var(--main-padding-top);
    padding-bottom: 1.5rem;
  }
  .main.main-fill {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
