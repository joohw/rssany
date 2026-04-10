<script lang="ts">
  /// <reference path="../lucide-svelte.d.ts" />
  import { siGithub } from 'simple-icons';
  import { page } from '$app/stores';
  import Rss from 'lucide-svelte/icons/rss';
  import ScrollText from 'lucide-svelte/icons/scroll-text';
  import Puzzle from 'lucide-svelte/icons/puzzle';
  import Settings from 'lucide-svelte/icons/settings';
  import { PRODUCT_NAME, GITHUB_REPO_URL } from '$lib/brand';
  import Toast from '$lib/components/ui/Toast.svelte';
  import SourceFeedsSheet from '$lib/sources/SourceFeedsSheet.svelte';
  import { homeFeedPanelSource } from '$lib/homeFeedPanelStore';
  import '../app.css';

  const navIconSize = 18;

  /** 首页与若干后台列表页：主区域占满剩余高度，仅内部滚动 */
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

  /** 离开首页时清空 layout 层右侧条目栏选中态 */
  $: if (pathname !== '/') homeFeedPanelSource.set(null);

  $: navActive = {
    sources: pathname === '/' || pathname === '/admin/sources',
    logs: pathname === '/logs' || pathname.startsWith('/logs/'),
    plugins: pathname.startsWith('/plugins'),
    settings: pathname === '/admin' || pathname.startsWith('/admin/'),
  } as const;
</script>

<div class="layout-outer">
  <div class="layout-app">
    <!-- 左导航 | 中间主内容 |（首页）右条目：同一外框合并为一整块 -->
    <div
      id="layout-inner-scroll"
      class="layout-merged-cluster"
    >
      <aside class="layout-nav-rail" aria-label="主导航">
        <nav class="nav-rail-links">
          <div class="nav-rail-cluster">
            <a
              href="/"
              class="nav-rail-link"
              class:active={navActive.sources}
              title="信源"
              aria-label="信源"
            >
              <Rss size={navIconSize} />
            </a>
            <a
              href="/logs"
              class="nav-rail-link"
              class:active={navActive.logs}
              title="日志"
              aria-label="日志"
            >
              <ScrollText size={navIconSize} />
            </a>
            <a
              href="/plugins"
              class="nav-rail-link"
              class:active={navActive.plugins}
              title="插件"
              aria-label="插件"
            >
              <Puzzle size={navIconSize} />
            </a>
            <a
              href="/admin"
              class="nav-rail-link"
              class:active={navActive.settings}
              title="设置"
              aria-label="设置"
            >
              <Settings size={navIconSize} />
            </a>
          </div>
        </nav>
        <div class="nav-rail-footer">
          <a
            class="nav-rail-github"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在 GitHub 打开源码仓库"
            title="GitHub"
          >
            <svg class="nav-rail-github-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="currentColor" d={siGithub.path} />
            </svg>
          </a>
          <span class="nav-rail-brand" title={PRODUCT_NAME}>{PRODUCT_NAME}</span>
        </div>
      </aside>

      <div class="shell-frame" class:shell-frame--with-feed-rail={pathname === '/'}>
        <main class="main shell" class:main-fill={mainFillHeight}>
          <slot />
        </main>
      </div>

      {#if pathname === '/'}
        <div class="layout-feed-rail layout-feed-rail--home">
          <SourceFeedsSheet
            variant="inline"
            open={$homeFeedPanelSource != null}
            sourceRef={$homeFeedPanelSource?.ref ?? ''}
            sourceLabel={$homeFeedPanelSource?.displayLabel ?? ''}
            sourceDescription={$homeFeedPanelSource?.description ?? ''}
            sourceProxy={$homeFeedPanelSource?.proxy?.trim() ?? ''}
            onOpenChange={(v) => {
              if (!v) homeFeedPanelSource.set(null);
            }}
          />
        </div>
      {/if}
    </div>
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
    --home-feed-rail-width: 36rem;
    --nav-rail-width: 3rem;
  }

  /**
   * 单页三列合并：外层一块矩形边框，列间仅细分隔线。
   */
  .layout-app {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: stretch;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    padding-inline: var(--shell-gutter);
  }

  .layout-merged-cluster {
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex: 0 1 var(--layout-max-width);
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    width: min(100%, var(--layout-max-width));
    max-width: min(100%, var(--layout-max-width));
    margin-inline: auto;
    border: 1px solid var(--color-border-muted);
    border-radius: 0;
    overflow: hidden;
    background: var(--color-card);
    box-shadow: var(--shadow-panel);
  }

  .layout-nav-rail {
    flex: 0 0 var(--nav-rail-width);
    width: var(--nav-rail-width);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: stretch;
    flex-shrink: 0;
    background: transparent;
    border-right: 1px solid var(--color-border-muted);
    z-index: 30;
  }

  .nav-rail-links {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 0.75rem 0.35rem;
    flex: 1;
    min-height: 0;
  }

  /** 四个入口贴合成一组（外框已由 layout-merged-cluster 提供） */
  .nav-rail-cluster {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    max-width: 2.35rem;
    border-radius: 0;
    overflow: hidden;
    background: var(--color-muted);
  }

  .nav-rail-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.65rem;
    padding: 0.4rem 0.25rem;
    color: var(--color-muted-foreground-strong);
    text-decoration: none;
    border-radius: 0;
    border-bottom: 1px solid var(--color-border-muted);
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .nav-rail-link:last-child {
    border-bottom: none;
  }

  .nav-rail-link :global(svg) {
    flex-shrink: 0;
  }

  .nav-rail-link:hover:not(.active) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .nav-rail-link.active {
    color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .nav-rail-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.2rem 0.75rem;
    border-top: 1px solid var(--color-border-muted);
    background: transparent;
  }

  .nav-rail-github {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem;
    color: var(--color-muted-foreground);
    border-radius: 6px;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .nav-rail-github:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .nav-rail-github-icon {
    width: 18px;
    height: 18px;
    display: block;
  }

  .nav-rail-brand {
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--color-muted-foreground-soft);
    writing-mode: vertical-rl;
    text-orientation: mixed;
    letter-spacing: 0.06em;
    max-height: 6.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
    user-select: none;
  }

  .shell {
    box-sizing: border-box;
    width: 100%;
    max-width: min(var(--content-max), 100%);
    margin-left: auto;
    margin-right: auto;
    padding-inline: var(--shell-gutter);
  }

  .shell-frame {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    max-width: none;
    border: none;
    background: transparent;
  }

  .shell-frame--with-feed-rail {
    border-right: none;
  }

  .layout-feed-rail {
    box-sizing: border-box;
    flex: 0 0 var(--home-feed-rail-width);
    width: var(--home-feed-rail-width);
    display: flex;
    flex-direction: column;
    min-height: 0;
    align-self: stretch;
    border-left: 1px solid var(--color-border-muted);
    background: transparent;
  }
  /** 与中间列信源工具条一致：`main-padding-top` + `.feed-header` 上内边距，使详情标题顶与过滤框顶对齐 */
  .layout-feed-rail--home {
    padding-top: calc(var(--main-padding-top) + 0.75rem);
  }

  .layout-feed-rail :global(.source-feed-panel-inline) {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    max-width: none;
    height: 100%;
  }

  @media (max-width: 720px) {
    .layout-app {
      padding-inline: 0;
    }

    .layout-merged-cluster {
      flex-direction: column;
      width: 100% !important;
      border-radius: 0;
      border-left: none;
      border-right: none;
      box-shadow: none;
    }

    .layout-nav-rail {
      flex: 0 0 auto;
      width: 100%;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      border-right: none;
      border-bottom: 1px solid var(--color-border-muted);
    }

    .nav-rail-links {
      flex-direction: row;
      justify-content: center;
      padding: 0.4rem 0.5rem;
    }

    .nav-rail-cluster {
      flex-direction: row;
      max-width: none;
      width: auto;
    }

    .nav-rail-link {
      min-height: 0;
      min-width: 2.65rem;
      padding: 0.45rem 0.5rem;
      border-bottom: none;
      border-right: 1px solid var(--color-border-muted);
    }

    .nav-rail-link:last-child {
      border-right: none;
    }

    .nav-rail-footer {
      flex-direction: row;
      border-top: none;
      padding: 0.35rem 0.5rem;
      gap: 0.5rem;
    }

    .nav-rail-brand {
      writing-mode: horizontal-tb;
      max-height: none;
      font-size: 0.65rem;
      max-width: 5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .shell-frame--with-feed-rail {
      border-right: none;
    }

    .layout-feed-rail {
      flex: 1 1 auto;
      width: 100%;
      max-width: none;
      max-height: min(42vh, 22rem);
      min-height: 12rem;
      border-left: none;
      border-top: 1px solid var(--color-border-muted);
    }
    .layout-feed-rail--home {
      padding-top: 0;
    }
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
