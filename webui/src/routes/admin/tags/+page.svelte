<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  interface TagStat {
    name: string;
    count: number;
    hotness: number;
  }

  let tags: string[] = [];
  let stats: TagStat[] = [];
  let suggestedTags: TagStat[] = [];
  let loading = true;
  let saving = false;
  let newTag = '';
  let contextMenu: { x: number; y: number; tag: string } | null = null;
  let removingFromItems = false;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{ tags?: string[]; stats?: TagStat[]; suggestedTags?: TagStat[] }>('/api/tags');
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

  async function save(newTags: string[]) {
    saving = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string; tags?: string[]; stats?: TagStat[]; suggestedTags?: TagStat[] }>(
        '/api/tags',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: newTags }),
        }
      );
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      tags = data?.tags ?? newTags;
      stats = data?.stats ?? [];
      suggestedTags = data?.suggestedTags ?? [];
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  function addTag() {
    const t = newTag.trim();
    if (!t || saving) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      showToast('标签已存在', 'error');
      return;
    }
    newTag = '';
    save([...tags, t]);
  }

  function removeTag(name: string) {
    if (saving) return;
    save(tags.filter((t) => t !== name));
  }

  function addSuggested(name: string) {
    if (saving) return;
    if (tags.some((x) => x.toLowerCase() === name.toLowerCase())) return;
    save([...tags, name]);
  }

  function showContextMenu(e: MouseEvent, tag: string) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, tag };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function removeTagFromItems(tag: string) {
    if (removingFromItems) return;
    removingFromItems = true;
    contextMenu = null;
    try {
      const data = await adminFetchJson<{
        ok?: boolean;
        message?: string;
        removedCount?: number;
        tags?: string[];
        stats?: TagStat[];
        suggestedTags?: TagStat[];
      }>('/api/tags/remove-from-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      if (!data?.ok) throw new Error(data?.message ?? '操作失败');
      tags = data?.tags ?? tags;
      stats = data?.stats ?? stats;
      suggestedTags = data?.suggestedTags ?? suggestedTags;
      showToast(`已从 ${data?.removedCount ?? 0} 篇文章中移除该标签`, 'success');
    } catch (e) {
      showToast('操作失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      removingFromItems = false;
    }
  }

  onMount(() => {
    load();
    const handleClick = () => closeContextMenu();
    const handleContextMenu = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  });
</script>

<svelte:head>
  <title>标签 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-toolbar-block">
      <div class="admin-feed-header">
        <div class="admin-feed-header__left">
          <h2>系统标签</h2>
          <p class="admin-feed-header__desc">
            系统标签库，新入库条目会由 LLM 自动匹配打标签。
          </p>
        </div>
        <div class="admin-feed-header__actions">
          <input
            type="text"
            class="admin-toolbar-input"
            placeholder="输入新标签，回车添加"
            bind:value={newTag}
            on:keydown={(e) => e.key === 'Enter' && addTag()}
          />
          <button type="button" class="admin-toolbar-btn admin-toolbar-btn--primary" on:click={addTag} disabled={!newTag.trim() || saving}>
            添加
          </button>
        </div>
      </div>
    </div>

    <div class="feed-body-scroll">
    {#if loading}
      <div class="state">加载中…</div>
    {:else}
      <div class="body">
        <div class="tags-section">
          <h3 class="section-title">当前标签 ({tags.length})</h3>
          {#if tags.length === 0}
            <p class="empty-hint">暂无标签。添加后，pipeline 会对新入库条目自动打标签。</p>
          {:else}
            <div class="tag-list">
              {#each tags as tag}
                {@const stat = getStat(tag)}
                <div
                  class="tag-badge"
                  on:contextmenu={(e) => showContextMenu(e, tag)}
                >
                  <span class="tag-name">{tag}</span>
                  {#if stat}
                    <span class="tag-meta">{stat.count} 篇 · 热度 {stat.hotness}</span>
                  {/if}
                  <button
                    type="button"
                    class="tag-remove"
                    title="从系统标签中删除"
                    on:click|stopPropagation={() => removeTag(tag)}
                    disabled={saving}
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if suggestedTags.length > 0}
          <div class="suggested-section">
            <h3 class="section-title">建议添加（文章中出现但未在系统标签库中）</h3>
            <div class="tag-list">
              {#each suggestedTags as s}
                <div
                  class="tag-badge suggested"
                  on:contextmenu={(e) => showContextMenu(e, s.name)}
                >
                  <span class="tag-name">{s.name}</span>
                  <span class="tag-meta">{s.count} 篇 · 热度 {s.hotness}</span>
                  <button
                    type="button"
                    class="tag-add"
                    title="添加到系统标签"
                    on:click|stopPropagation={() => addSuggested(s.name)}
                    disabled={saving}
                  >
                    +
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
    </div>
  </div>
</div>

{#if contextMenu}
  <div
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    <button
      type="button"
      class="context-menu-item"
      on:click={() => removeTagFromItems(contextMenu!.tag)}
      disabled={removingFromItems}
    >
      从所有文章中移除该标签
    </button>
  </div>
{/if}

<style>
  /**
   * 与信源列表等页一致：`main.main-fill` 不滚动，仅 `.feed-body-scroll` 内滚动，标题栏固定在上。
   */
  .feed-wrap {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .feed-col {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .feed-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
  }

  .feed-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .body {
    flex: 1;
    overflow: visible;
    padding: 1rem 0;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.5rem;
  }

  .tags-section,
  .suggested-section {
    margin-bottom: 1.25rem;
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
    padding: 0.25rem 0.5rem;
    background: var(--color-muted);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
  }

  .tag-name {
    color: var(--color-foreground);
    text-decoration: none;
  }
  .tag-name:hover {
    color: var(--color-primary);
  }

  .tag-meta {
    font-size: 0.7rem;
    color: var(--color-muted-foreground-soft);
  }

  .tag-remove,
  .tag-add {
    padding: 0 0.2rem;
    font-size: 1rem;
    line-height: 1;
    color: var(--color-muted-foreground-soft);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 2px;
  }
  .tag-remove:hover:not(:disabled),
  .tag-add:hover:not(:disabled) {
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 16%, transparent);
  }
  .tag-add:hover:not(:disabled) {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success) 18%, transparent);
  }

  .tag-badge.suggested {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  }

  .context-menu {
    position: fixed;
    z-index: 100;
    min-width: 180px;
    padding: 0.25rem 0;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-panel);
  }

  .context-menu-item {
    display: block;
    width: 100%;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    text-align: left;
    color: var(--color-foreground);
    background: none;
    border: none;
    cursor: pointer;
  }
  .context-menu-item:hover:not(:disabled) {
    background: var(--color-muted);
  }
  .context-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .state {
    text-align: center;
    padding: 4rem;
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
