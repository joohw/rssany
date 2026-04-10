<script lang="ts">
  import { untrack } from 'svelte';
  import { Dialog } from 'bits-ui';
  import X from 'lucide-svelte/icons/x';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Globe from 'lucide-svelte/icons/globe';
  import { adminFetch } from '$lib/adminAuth';
  import { refToTaskId } from '$lib/sourcePullStore.js';

  interface FeedRow {
    id: string;
    title: string | null;
    url: string;
    pub_date: string | null;
    fetched_at: string;
    summary: string | null;
  }

  interface Props {
    open?: boolean;
    sourceRef?: string;
    sourceLabel?: string;
    /** 标题下方展示（无则显示 —） */
    sourceDescription?: string;
    /** 单源代理：非空时在标题旁显示图标 */
    sourceProxy?: string;
    /** `overlay`：右侧抽屉 + 遮罩；`inline`：与信源列表并排占满主区域右侧列 */
    variant?: 'overlay' | 'inline';
    /** @param v */
    onOpenChange?: (v: boolean) => void;
  }

  let {
    open = false,
    sourceRef = '',
    sourceLabel = '',
    sourceDescription = '',
    sourceProxy = '',
    variant = 'overlay',
    onOpenChange = () => {},
  }: Props = $props();

  let items = $state<FeedRow[]>([]);
  let loading = $state(false);
  let loadError = $state('');
  let loadSeq = $state(0);

  /** 拉取任务 id 映射（runes 下需订阅 store 才能随 refToTaskId 更新） */
  let taskPullMap = $state<Record<string, string>>({});
  $effect(() => {
    const unsub = refToTaskId.subscribe((v) => {
      taskPullMap = v;
    });
    return () => unsub();
  });

  async function loadItems() {
    const ref = sourceRef.trim();
    if (!ref) {
      items = [];
      return;
    }
    loadSeq += 1;
    const seq = loadSeq;
    loading = true;
    loadError = '';
    try {
      const params = new URLSearchParams();
      params.set('ref', ref);
      params.set('limit', '100');
      params.set('offset', '0');
      const res = await adminFetch('/api/items?' + params.toString());
      if (seq !== loadSeq) return;
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const data = (await res.json()) as { items?: FeedRow[] };
      items = Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      if (seq !== loadSeq) return;
      loadError = e instanceof Error ? e.message : String(e);
      items = [];
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $effect(() => {
    if (open && sourceRef.trim()) {
      // loadItems 会同步读写 loadSeq/loading；若在 effect 追踪内执行，会把它们当成依赖并无限重跑（effect_update_depth_exceeded）。
      untrack(() => void loadItems());
    } else if (!open) {
      untrack(() => {
        loadSeq += 1;
        items = [];
        loadError = '';
        loading = false;
      });
    }
  });

  function formatWhen(iso: string | null): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  function itemTime(row: FeedRow): string {
    return formatWhen(row.pub_date || row.fetched_at);
  }

  const sublineText = $derived(sourceDescription.trim() ? sourceDescription.trim() : '—');
  const headerTitleAttr = $derived(
    [sourceLabel, sourceRef].filter(Boolean).join(' · ') || undefined,
  );

  const inlinePulling = $derived(
    variant === 'inline' && open && sourceRef.trim() !== '' && sourceRef in taskPullMap,
  );

  let prevInlinePulling = false;
  $effect(() => {
    const pulling = inlinePulling;
    if (prevInlinePulling && !pulling && open && variant === 'inline' && sourceRef.trim()) {
      untrack(() => void loadItems());
    }
    prevInlinePulling = pulling;
  });
</script>

{#if variant === 'overlay'}
  <Dialog.Root
    {open}
    onOpenChange={(v) => onOpenChange(v)}
  >
    <Dialog.Portal>
      <Dialog.Overlay class="source-sheet-overlay" />
      <Dialog.Content class="source-sheet-panel" aria-describedby={undefined}>
        <header class="source-sheet-header">
          <div class="source-sheet-title-wrap">
            <div class="source-sheet-title-row">
              <div class="source-sheet-title-cluster">
                <Dialog.Title
                  class="source-sheet-title"
                  title={headerTitleAttr}
                >{sourceLabel || sourceRef || '信源条目'}</Dialog.Title>
                {#if sourceProxy.trim()}
                  <span class="source-sheet-proxy" title="代理：{sourceProxy.trim()}" aria-label="已配置代理">
                    <Globe size={16} class="source-sheet-proxy-globe" aria-hidden="true" />
                  </span>
                {/if}
              </div>
            </div>
            <p class="source-sheet-sub source-sheet-sub-desc" title={sourceRef}>{sublineText}</p>
          </div>
          <Dialog.Close class="source-sheet-close" aria-label="关闭">
            <X size={18} />
          </Dialog.Close>
        </header>
        <div class="source-sheet-body">
          {#if loading && items.length === 0}
            <div class="source-sheet-state">加载中…</div>
          {:else if loadError}
            <div class="source-sheet-state err">{loadError}</div>
          {:else if items.length === 0}
            <div class="source-sheet-state">暂无条目</div>
          {:else}
            <ul class="source-feed-list">
              {#each items as row (row.id)}
                <li class="source-feed-row">
                  <a
                    class="source-feed-link"
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={row.summary?.trim() || row.title || row.url}
                  >
                    <span class="source-feed-title">{row.title?.trim() ? row.title : row.url}</span>
                    <span class="source-feed-meta">
                      <time datetime={row.pub_date || row.fetched_at}>{itemTime(row)}</time>
                      <span class="source-feed-ext" aria-hidden="true">
                        <ExternalLink size={12} />
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{:else}
  <aside class="source-feed-panel-inline" aria-label="信源条目列表">
    {#if open && sourceRef.trim()}
      <header class="source-sheet-header source-sheet-header-inline">
        <div class="source-sheet-title-wrap">
          <div class="source-sheet-title-row">
            <div class="source-sheet-title-cluster">
              <h2 class="source-sheet-title" title={headerTitleAttr}>
                {sourceLabel || sourceRef || '信源条目'}
              </h2>
              {#if sourceProxy.trim()}
                <span class="source-sheet-proxy" title="代理：{sourceProxy.trim()}" aria-label="已配置代理">
                  <Globe size={16} class="source-sheet-proxy-globe" aria-hidden="true" />
                </span>
              {/if}
            </div>
          </div>
          <p class="source-sheet-sub source-sheet-sub-desc" title={sourceRef}>{sublineText}</p>
        </div>
        {#if inlinePulling}
          <div class="source-sheet-pull-status" title="拉取中…" aria-live="polite">
            <RefreshCw size={18} />
          </div>
        {/if}
      </header>
      <div class="source-sheet-body">
        {#if loading && items.length === 0}
          <div class="source-sheet-state">加载中…</div>
        {:else if loadError}
          <div class="source-sheet-state err">{loadError}</div>
        {:else if items.length === 0}
          <div class="source-sheet-state">暂无条目</div>
        {:else}
          <ul class="source-feed-list">
            {#each items as row (row.id)}
              <li class="source-feed-row">
                <a
                  class="source-feed-link"
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={row.summary?.trim() || row.title || row.url}
                >
                  <span class="source-feed-title">{row.title?.trim() ? row.title : row.url}</span>
                  <span class="source-feed-meta">
                    <time datetime={row.pub_date || row.fetched_at}>{itemTime(row)}</time>
                    <span class="source-feed-ext" aria-hidden="true">
                      <ExternalLink size={12} />
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <div class="source-sheet-inline-empty">
        <p class="source-sheet-inline-empty-title">信源条目</p>
        <p class="source-sheet-inline-empty-hint">在左侧列表中点击某一信源，在此查看已拉取的条目。</p>
      </div>
    {/if}
  </aside>
{/if}

<style>
  /**
   * 动效：bits-ui Dialog 在关闭时会等节点上 CSS animation 结束再卸载（Presence + getAnimations）。
   * 使用 data-state（open / closed）区分进入、离开，无需再装 motion 库。
   */
  @keyframes source-sheet-overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes source-sheet-overlay-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes source-sheet-panel-in {
    from {
      opacity: 0.92;
      transform: translate3d(100%, 0, 0);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }
  @keyframes source-sheet-panel-out {
    from {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
    to {
      opacity: 0.92;
      transform: translate3d(100%, 0, 0);
    }
  }

  :global(.source-sheet-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 110;
  }
  :global(.source-sheet-overlay[data-state='open']) {
    animation: source-sheet-overlay-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  :global(.source-sheet-overlay[data-state='closed']) {
    animation: source-sheet-overlay-out 0.22s cubic-bezier(0.36, 0, 0.2, 1) both;
  }

  :global(.source-sheet-panel) {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(28rem, 100vw);
    max-width: 100%;
    z-index: 111;
    display: flex;
    flex-direction: column;
    background: var(--color-card-elevated);
    border-left: 1px solid var(--color-border);
    box-shadow: -8px 0 40px rgba(0, 0, 0, 0.35);
    outline: none;
    will-change: transform, opacity;
    backface-visibility: hidden;
  }
  :global(.source-sheet-panel[data-state='open']) {
    animation: source-sheet-panel-in 0.34s cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  :global(.source-sheet-panel[data-state='closed']) {
    animation: source-sheet-panel-out 0.28s cubic-bezier(0.36, 0, 0.2, 1) both;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.source-sheet-overlay[data-state='open']),
    :global(.source-sheet-overlay[data-state='closed']),
    :global(.source-sheet-panel[data-state='open']),
    :global(.source-sheet-panel[data-state='closed']) {
      animation-duration: 0.01ms;
      animation-iteration-count: 1;
    }
  }

  /* ── 内嵌右栏：外框由 layout-merged-cluster 统一；此处不再画左右边线 ───────────────── */
  .source-feed-panel-inline {
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: transparent;
    border-left: none;
    border-right: none;
  }
  .source-sheet-inline-empty {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem 1.25rem;
    text-align: center;
  }
  .source-sheet-inline-empty-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-muted-foreground-strong);
  }
  .source-sheet-inline-empty-hint {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--color-muted-foreground-soft);
    max-width: 16rem;
  }
  .source-feed-panel-inline .source-sheet-header-inline {
    padding: 0 0.85rem 0.75rem 1rem;
    align-items: flex-start;
  }
  .source-feed-panel-inline h2.source-sheet-title {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-sheet-pull-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    margin: -0.1rem 0 0;
    color: var(--color-primary);
  }
  .source-sheet-pull-status :global(svg) {
    animation: source-sheet-spin 0.8s linear infinite;
  }
  @keyframes source-sheet-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 720px) {
    .source-feed-panel-inline {
      flex: 1 1 auto;
      max-width: none;
      min-width: 0;
      min-height: 12rem;
      max-height: min(42vh, 22rem);
      border-left: none;
      border-right: none;
      border-top: none;
    }
  }

  .source-sheet-header {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1rem 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .source-sheet-title-wrap {
    flex: 1 1 auto;
    min-width: 0;
  }
  .source-sheet-title-row {
    min-width: 0;
  }
  /** 标题与代理图标同一组：图标紧贴标题末尾，而非整行两端对齐 */
  .source-sheet-title-cluster {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    max-width: 100%;
  }
  .source-sheet-title-cluster :global(.source-sheet-title),
  .source-sheet-title-cluster h2.source-sheet-title {
    flex: 1 1 0%;
    min-width: 0;
  }
  .source-sheet-proxy {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    line-height: 0;
    color: var(--color-muted-foreground-soft);
  }
  :global(.source-sheet-proxy-globe) {
    opacity: 0.9;
  }
  :global(.source-sheet-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-sheet-sub {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--color-muted-foreground-soft);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-sheet-sub.source-sheet-sub-desc {
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    word-break: break-word;
    text-overflow: unset;
  }
  :global(.source-sheet-close) {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  :global(.source-sheet-close:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .source-sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.5rem 0 1rem;
  }
  .source-sheet-body::-webkit-scrollbar {
    width: 5px;
  }
  .source-sheet-body::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 4px;
  }

  .source-sheet-state {
    padding: 2rem 1.25rem;
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
  }
  .source-sheet-state.err {
    color: var(--color-destructive);
  }

  .source-feed-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .source-feed-row {
    border-bottom: 1px solid var(--color-border-muted);
  }
  .source-feed-row:last-child {
    border-bottom: none;
  }
  .source-feed-link {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    padding: 0.65rem 1.25rem;
    min-width: 0;
    text-decoration: none;
    color: inherit;
    transition: background 0.12s;
  }
  .source-feed-link:hover {
    background: var(--color-muted);
  }
  .source-feed-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-foreground);
    line-height: 1.4;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-feed-link:hover .source-feed-title {
    color: var(--color-primary);
  }
  .source-feed-meta {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.35rem;
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--color-muted-foreground-soft);
    font-variant-numeric: tabular-nums;
  }
  .source-feed-ext {
    opacity: 0.65;
    flex-shrink: 0;
  }
</style>
