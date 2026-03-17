<script lang="ts">
  import { fetchJson } from '$lib/fetchJson.js';

  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  /** 选择某个标签时调用（如跳转到 /feeds?tags=xxx），随后会关闭 overlay */
  export let onSelect: ((tag: string) => void) | undefined = undefined;

  interface TagStat {
    name: string;
    count: number;
    hotness: number;
  }

  let tags: string[] = [];
  let stats: TagStat[] = [];
  let suggestedTags: TagStat[] = [];
  let loading = true;

  async function load() {
    if (!open) return;
    loading = true;
    try {
      const data = await fetchJson<{ tags?: string[]; stats?: TagStat[]; suggestedTags?: TagStat[] }>('/api/tags');
      tags = data?.tags ?? [];
      stats = data?.stats ?? [];
      suggestedTags = data?.suggestedTags ?? [];
    } catch {
      tags = [];
      stats = [];
      suggestedTags = [];
    } finally {
      loading = false;
    }
  }

  function getStat(name: string): TagStat | undefined {
    return stats.find((s) => s.name.toLowerCase() === name.toLowerCase());
  }

  /** 当前标签按热度降序 */
  $: sortedTags = [...tags].sort((a, b) => {
    const ha = getStat(a)?.hotness ?? 0;
    const hb = getStat(b)?.hotness ?? 0;
    return hb - ha;
  });

  /** 建议标签按热度降序 */
  $: sortedSuggestedTags = [...suggestedTags].sort((a, b) => b.hotness - a.hotness);

  function selectTag(tag: string) {
    onSelect?.(tag);
    onClose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('overlay-backdrop')) onClose?.();
  }

  let wasOpen = false;
  $: {
    if (open && !wasOpen) load();
    wasOpen = open;
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && onClose?.()} />

{#if open}
  <div
    class="overlay-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="标签"
    tabindex="-1"
    on:click={handleBackdropClick}
    on:keydown={(e) => e.key === 'Escape' && onClose?.()}
  >
    <div class="overlay-panel">
      <div class="overlay-header">
        <h2>标签</h2>
        <p class="overlay-desc">点击标签可筛选 Feeds</p>
        <button type="button" class="overlay-close" on:click={onClose} aria-label="关闭">×</button>
      </div>
      <div class="overlay-body">
        {#if loading}
          <div class="state">加载中…</div>
        {:else}
          <div class="tags-section">
            <h3 class="section-title">当前标签 ({tags.length})</h3>
            {#if tags.length === 0}
              <p class="empty-hint">暂无标签。</p>
            {:else}
              <div class="tag-list">
                {#each sortedTags as tag}
                  {@const stat = getStat(tag)}
                  <button
                    type="button"
                    class="tag-badge"
                    on:click={() => selectTag(tag)}
                  >
                    <span class="tag-name">{tag}</span>
                    {#if stat}
                      <span class="tag-meta">{stat.count} 篇 · 热度 {stat.hotness}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          {#if suggestedTags.length > 0}
            <div class="suggested-section">
              <h3 class="section-title">建议添加（文章中出现但未在系统标签库中）</h3>
              <div class="tag-list">
                {#each sortedSuggestedTags as s}
                  <button
                    type="button"
                    class="tag-badge suggested"
                    on:click={() => selectTag(s.name)}
                  >
                    <span class="tag-name">{s.name}</span>
                    <span class="tag-meta">{s.count} 篇 · 热度 {s.hotness}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .overlay-panel {
    width: 100%;
    max-width: 480px;
    max-height: min(85vh, 520px);
    display: flex;
    flex-direction: column;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .overlay-header {
    position: relative;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border-muted, #eee);
    flex-shrink: 0;
  }
  .overlay-header h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.2rem;
  }
  .overlay-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
  }
  .overlay-close {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 1.25rem;
    line-height: 1;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .overlay-close:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .overlay-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
  }
  .overlay-body::-webkit-scrollbar {
    width: 4px;
  }
  .overlay-body::-webkit-scrollbar-thumb {
    background: #ddd;
    border-radius: 2px;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground-strong);
    margin: 0 0 0.5rem;
  }

  .tags-section,
  .suggested-section {
    margin-bottom: 1.25rem;
  }
  .suggested-section:last-child {
    margin-bottom: 0;
  }

  .empty-hint {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    background: var(--color-muted);
    border: none;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--color-foreground);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .tag-badge:hover {
    background: var(--color-primary-light, #e5e7eb);
    color: var(--color-primary);
  }

  .tag-name {
    font-weight: 500;
  }

  .tag-meta {
    font-size: 0.7rem;
    color: var(--color-muted-foreground-soft);
  }

  .tag-badge.suggested {
    background: #fef3c7;
  }
  .tag-badge.suggested:hover {
    background: #fde68a;
    color: #92400e;
  }

  .state {
    text-align: center;
    padding: 2rem;
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
  }
</style>
