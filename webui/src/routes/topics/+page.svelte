<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Dialog } from 'bits-ui';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import { fetchJson } from '$lib/fetchJson.js';

  interface TopicStat {
    title: string;
    tags?: string[];
    prompt?: string;
    description?: string;
    refresh?: number;
    count: number;
    hotness: number;
  }

  const REFRESH_OPTIONS = [1, 3, 7, 14, 30];

  interface TopicCard {
    title: string;
    tags: string[];
    prompt: string;
    description: string;
    refresh: number;
    count: number;
    hotness: number;
    articleHref: string;
  }

  let cards: TopicCard[] = [];
  let loading = true;
  let loadError = '';
  let showAddForm = false;
  let showEditForm = false;
  let editTarget: TopicCard | null = null;
  let newTitle = '';
  let newPrompt = '';
  let newDescription = '';
  let newRefresh = 1;
  let saving = false;
  let saveMsg = '';
  let contextMenu: { x: number; y: number; topicTitle: string } | null = null;

  async function load() {
    loading = true;
    loadError = '';
    try {
      const data = await fetchJson<{ stats?: TopicStat[] }>('/api/topics');
      const list = data?.stats ?? [];
      cards = list.map((s) => ({
        title: s.title,
        tags: s.tags ?? [],
        prompt: s.prompt ?? '',
        description: s.description ?? '',
        refresh: s.refresh ?? 1,
        count: s.count,
        hotness: s.hotness,
        articleHref: '/topics/' + encodeURIComponent(s.title),
      }));
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      cards = [];
    } finally {
      loading = false;
    }
  }

  function getTopicsPayload(): Array<{ title: string; tags: string[]; prompt: string; description: string; refresh: number }> {
    return cards.map((c) => ({
      title: c.title,
      tags: c.tags,
      prompt: c.prompt,
      description: c.description,
      refresh: c.refresh,
    }));
  }

  async function save(topics: Array<{ title: string; tags: string[]; prompt: string; description: string; refresh: number }>) {
    saving = true;
    saveMsg = '';
    try {
      const data = await fetchJson<{ ok?: boolean; message?: string }>('/api/topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics }),
      });
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      await load();
      saveMsg = '已保存';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  function addTopic() {
    const title = newTitle.trim();
    if (!title || saving) return;
    if (cards.some((c) => c.title === title)) {
      saveMsg = '话题已存在';
      setTimeout(() => { saveMsg = ''; }, 1500);
      return;
    }
    const topic = {
      title,
      tags: [] as string[],
      prompt: newPrompt.trim(),
      description: newDescription.trim(),
      refresh: newRefresh,
    };
    closeAddModal();
    save([...getTopicsPayload(), topic]);
  }

  function openEditModal(card: TopicCard) {
    editTarget = card;
    newTitle = card.title;
    newPrompt = card.prompt;
    newDescription = card.description;
    newRefresh = card.refresh;
    showEditForm = true;
    contextMenu = null;
  }

  function saveEdit() {
    if (!editTarget || saving) return;
    const title = newTitle.trim();
    if (!title) return;
    if (title !== editTarget.title && cards.some((c) => c.title === title)) {
      saveMsg = '话题已存在';
      setTimeout(() => { saveMsg = ''; }, 1500);
      return;
    }
    const next = cards.map((c) =>
      c.title === editTarget!.title
        ? { ...c, title, tags: editTarget!.tags, prompt: newPrompt.trim(), description: newDescription.trim(), refresh: newRefresh }
        : c
    );
    closeEditModal();
    save(next.map((c) => ({ title: c.title, tags: c.tags, prompt: c.prompt, description: c.description, refresh: c.refresh })));
  }

  function removeTopic(title: string) {
    if (saving) return;
    const next = cards.filter((c) => c.title !== title);
    save(next.map((c) => ({ title: c.title, tags: c.tags, prompt: c.prompt, description: c.description, refresh: c.refresh })));
    contextMenu = null;
  }

  function showContextMenu(e: MouseEvent, topicTitle: string) {
    if (saving) return;
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, topicTitle };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function closeAddModal() {
    showAddForm = false;
    newTitle = '';
    newPrompt = '';
    newDescription = '';
    newRefresh = 1;
  }

  function closeEditModal() {
    showEditForm = false;
    editTarget = null;
    newTitle = '';
    newPrompt = '';
    newDescription = '';
    newRefresh = 1;
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
  <title>话题 - RssAny</title>
</svelte:head>

<svelte:window on:keydown={(e) => {
  if (e.key === 'Escape') {
    if (showAddForm) closeAddModal();
    else if (showEditForm) closeEditModal();
  }
}} />

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header">
      <div class="header-left">
        <h2>话题</h2>
        <p class="sub">话题只需要简短的描述，添加话题后，Agent 会持续追踪该话题并定期输出文章。</p>
      </div>
      <div class="header-right">
        {#if saveMsg}
          <span class="save-msg">{saveMsg}</span>
        {/if}
        <button
          type="button"
          class="add-btn"
          title="添加话题"
          aria-label="添加话题"
          on:click={() => { showAddForm = true; newTitle = ''; newPrompt = ''; newDescription = ''; newRefresh = 1; }}
          disabled={loading || saving}
        >
          +
        </button>
      </div>
    </div>

    {#if loading}
      <div class="state">加载中…</div>
    {:else if loadError}
      <div class="state error">{loadError}</div>
    {:else if cards.length === 0}
      <div class="state">暂无话题。点击「添加话题」创建，需填写标题（必填），可选填关键词和描述。</div>
    {:else}
      <div class="list">
        {#each cards as card (card.title)}
          <div
            class="card"
            role="button"
            tabindex="0"
            title="{card.title}。点击查看最新报告"
            on:click={() => goto(card.articleHref)}
            on:keydown={(e) => e.key === 'Enter' && goto(card.articleHref)}
          >
            <div class="card-main">
              <span class="card-label">{card.title}</span>
              {#if card.description}
                <span class="card-prompt">{card.description}</span>
              {/if}
              {#if card.tags.length > 0}
                <div class="card-tags-wrap">
                  {#each card.tags as tag}
                    <a
                      href="/feeds?tags={encodeURIComponent(tag)}"
                      class="card-tag-badge"
                      title="按标签筛选文章"
                      on:click|stopPropagation
                    >{tag}</a>
                  {/each}
                </div>
              {/if}
            </div>
            <button
              type="button"
              class="card-more-btn"
              title="编辑或删除"
              aria-label="更多操作"
              on:click|stopPropagation={(e) => showContextMenu(e, card.title)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- 添加话题弹窗 -->
<Dialog.Root
  open={showAddForm}
  onOpenChange={(open) => { showAddForm = open; if (!open) closeAddModal(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content" aria-describedby={undefined}>
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">添加话题</Dialog.Title>
        <Dialog.Close class="dialog-close" aria-label="关闭">×</Dialog.Close>
      </div>
      <div class="dialog-body">
        <div class="form-row">
          <label for="new-title">标题 <span class="required">*</span></label>
          <input
            id="new-title"
            type="text"
            placeholder="简短描述，如：A2A协议"
            bind:value={newTitle}
            on:keydown={(e) => e.key === 'Enter' && addTopic()}
          />
        </div>
        <div class="form-row">
          <label for="new-description">描述</label>
          <p class="field-hint">卡片上展示的简短概念，便于阅读时识别，不提供给 AI。</p>
          <input
            id="new-description"
            type="text"
            placeholder="如：A2A 协议与多智能体通信"
            bind:value={newDescription}
          />
        </div>
        <div class="form-row">
          <label for="new-prompt">AI 提示词</label>
          <p class="field-hint">主导报告生成逻辑，供 Agent 参考。若有 tags 会作为搜索提示插入；无 tags 时 agent 可自行选择获取方式（如日报用 get_channel_feeds 获取全部文章）。</p>
          <textarea
            id="new-prompt"
            placeholder="如：关注谷歌、OpenAI 等在 Agent-to-Agent 通信领域的最新进展"
            bind:value={newPrompt}
            rows="5"
          ></textarea>
        </div>
        <div class="form-row form-actions">
          <select bind:value={newRefresh} title="刷新周期（天）">
            {#each REFRESH_OPTIONS as d}
              <option value={d}>{d} 天</option>
            {/each}
          </select>
          <button type="button" on:click={addTopic} disabled={!newTitle.trim() || saving}>
            添加
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

{#if contextMenu}
  {@const card = cards.find((c) => c.title === contextMenu!.topicTitle)}
  <div
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    {#if card}
      <button
        type="button"
        class="context-menu-item"
        on:click={() => openEditModal(card)}
      >
        编辑
      </button>
      <button
        type="button"
        class="context-menu-item"
        on:click={() => removeTopic(contextMenu!.topicTitle)}
      >
        删除
      </button>
    {/if}
  </div>
{/if}

<!-- 编辑话题弹窗 -->
<Dialog.Root
  open={showEditForm}
  onOpenChange={(open) => { showEditForm = open; if (!open) closeEditModal(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content" aria-describedby={undefined}>
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">编辑话题</Dialog.Title>
        <Dialog.Close class="dialog-close" aria-label="关闭">×</Dialog.Close>
      </div>
      <div class="dialog-body">
        <div class="form-row">
          <label for="edit-title">标题 <span class="required">*</span></label>
          <input
            id="edit-title"
            type="text"
            placeholder="简短描述，如：A2A协议"
            bind:value={newTitle}
            on:keydown={(e) => e.key === 'Enter' && saveEdit()}
          />
        </div>
        <div class="form-row">
          <label for="edit-description">描述</label>
          <p class="field-hint">卡片上展示的简短概念，便于阅读时识别，不提供给 AI。</p>
          <input
            id="edit-description"
            type="text"
            placeholder="如：A2A 协议与多智能体通信"
            bind:value={newDescription}
          />
        </div>
        <div class="form-row">
          <label for="edit-prompt">AI 提示词</label>
          <p class="field-hint">主导报告生成逻辑，供 Agent 参考。</p>
          <textarea
            id="edit-prompt"
            placeholder="如：关注谷歌、OpenAI 等在 Agent-to-Agent 通信领域的最新进展"
            bind:value={newPrompt}
            rows="5"
          ></textarea>
        </div>
        <div class="form-row form-actions">
          <select bind:value={newRefresh} title="刷新周期（天）">
            {#each REFRESH_OPTIONS as d}
              <option value={d}>{d} 天</option>
            {/each}
          </select>
          <button type="button" on:click={saveEdit} disabled={!newTitle.trim() || saving}>
            保存
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .feed-wrap {
    height: 100vh;
    display: flex;
    overflow: hidden;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
  }
  .feed-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
  }

  .feed-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #f0f0f0;
    flex-shrink: 0;
  }
  .header-left {
    flex: 1;
    min-width: 0;
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
  }
  .sub {
    font-size: 0.75rem;
    color: #aaa;
    margin: 0;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .add-btn {
    padding: 0.4rem 0.5rem;
    min-width: 2rem;
    font-size: 1rem;
    line-height: 1;
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .add-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .save-msg {
    font-size: 0.75rem;
    color: #059669;
  }

  /* bits-ui Dialog 通过 Portal 渲染，需 :global 使样式生效 */
  :global(.dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.35);
  }
  :global(.dialog-content) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    max-width: 560px;
    width: calc(100% - 2rem);
    max-height: 90vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  :global(.dialog-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  :global(.dialog-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
  }
  :global(.dialog-close) {
    font-size: 1.25rem;
    line-height: 1;
    padding: 0.2rem;
    color: #6b7280;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 4px;
  }
  :global(.dialog-close:hover) {
    color: #111;
    background: #f0f0f0;
  }
  :global(.dialog-body) {
    padding: 1rem 1.25rem;
  }
  .form-row {
    margin-bottom: 0.5rem;
  }
  .form-row:last-of-type {
    margin-bottom: 0;
  }
  .form-row label {
    display: block;
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.2rem;
  }
  .required {
    color: #c53030;
  }
  .form-row input,
  .form-row textarea {
    width: 100%;
    padding: 0.4rem 0.6rem;
    font-size: 0.875rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-sizing: border-box;
  }
  .form-row textarea {
    resize: vertical;
    min-height: 6rem;
  }
  .field-hint {
    font-size: 0.7rem;
    color: #9ca3af;
    margin: 0 0 0.35rem;
    line-height: 1.4;
  }
  .form-row input:focus,
  .form-row textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .form-actions select {
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
  }
  .form-actions button {
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .form-actions button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .form-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem;
    color: #888;
    font-size: 0.875rem;
  }
  .state.error {
    color: #c53030;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding-bottom: 200px;
  }
  .list::-webkit-scrollbar { width: 4px; }
  .list::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

  .card {
    background: #fff;
    border: none;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    transition: background 0.15s;
    flex-shrink: 0;
    cursor: pointer;
  }
  .card:last-child {
    border-bottom: none;
  }
  .card:hover {
    background: #fafafa;
  }

  .card-more-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    margin: -0.25rem 0;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
  }
  .card-more-btn:hover {
    background: #e5e7eb;
    color: #111;
  }

  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .card-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: #111;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card:hover .card-label {
    color: var(--color-primary);
  }
  .card-tags-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.2rem;
  }
  .card-tag-badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 4px;
    text-decoration: none;
    cursor: pointer;
  }
  .card-tag-badge:hover {
    background: #e5e7eb;
    color: #374151;
  }
  .card-prompt {
    font-size: 0.72rem;
    color: #9ca3af;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-menu {
    position: fixed;
    z-index: 100;
    min-width: 100px;
    padding: 0.25rem 0;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .context-menu-item {
    display: block;
    width: 100%;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    text-align: left;
    color: #111;
    background: none;
    border: none;
    cursor: pointer;
  }
  .context-menu-item:hover {
    background: #f3f4f6;
  }

  @media (max-width: 600px) {
    .feed-wrap { max-width: 100%; }
    .feed-col { border: none; }
  }
</style>
