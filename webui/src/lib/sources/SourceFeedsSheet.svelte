<script lang="ts">
  import { Dialog } from 'bits-ui';
  import X from 'lucide-svelte/icons/x';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import { adminFetch } from '$lib/adminAuth';

  interface FeedRow {
    id: string;
    title: string | null;
    url: string;
    pub_date: string | null;
    fetched_at: string;
    summary: string | null;
  }

  export let open = false;
  export let sourceRef = '';
  export let sourceLabel = '';
  /** @param v */
  export let onOpenChange: (v: boolean) => void = () => {};

  let items: FeedRow[] = [];
  let loading = false;
  let loadError = '';
  let loadSeq = 0;

  async function loadItems() {
    const ref = sourceRef.trim();
    if (!ref) {
      items = [];
      return;
    }
    const seq = ++loadSeq;
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

  $: {
    if (open && sourceRef.trim()) {
      loadItems();
    } else if (!open) {
      loadSeq++;
      items = [];
      loadError = '';
      loading = false;
    }
  }

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
</script>

<Dialog.Root
  {open}
  onOpenChange={(v) => onOpenChange(v)}
>
  <Dialog.Portal>
    <Dialog.Overlay class="source-sheet-overlay" />
    <Dialog.Content class="source-sheet-panel" aria-describedby={undefined}>
      <header class="source-sheet-header">
        <div class="source-sheet-title-wrap">
          <Dialog.Title class="source-sheet-title">{sourceLabel || sourceRef || '信源条目'}</Dialog.Title>
          <p class="source-sheet-sub" title={sourceRef}>{sourceRef}</p>
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
    min-width: 0;
  }
  :global(.source-sheet-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
    line-height: 1.35;
    word-break: break-word;
  }
  .source-sheet-sub {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--color-muted-foreground-soft);
    word-break: break-all;
    line-height: 1.35;
    max-height: 3.2em;
    overflow: hidden;
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
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.65rem 1.25rem;
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
    word-break: break-word;
  }
  .source-feed-link:hover .source-feed-title {
    color: var(--color-primary);
  }
  .source-feed-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: var(--color-muted-foreground-soft);
    font-variant-numeric: tabular-nums;
  }
  .source-feed-ext {
    opacity: 0.65;
    flex-shrink: 0;
  }
</style>
