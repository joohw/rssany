<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';

  interface UserChannel {
    id: string;
    title: string | null;
    description: string | null;
    sourceRefs: string[];
  }

  let content = '';
  let original = '';
  let error = '';
  let saveMsg = '';
  let loading = true;
  let saving = false;
  let unauthorized = false;

  $: dirty = content !== original;
  $: canSave = !error && dirty && !saving;

  $: {
    if (content.trim() === '') {
      error = '';
    } else {
      try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          error = '格式错误：应为数组 [{ id, title, description, sourceRefs }, ...]';
        } else {
          error = '';
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  async function load() {
    loading = true;
    unauthorized = false;
    try {
      const res = await fetch('/api/user/channels');
      if (res.status === 401) {
        unauthorized = true;
        return;
      }
      const data: UserChannel[] = await res.json();
      const formatted = JSON.stringify(Array.isArray(data) ? data : [], null, 2);
      content = formatted;
      original = formatted;
    } catch {
      content = '[]';
      original = '[]';
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    saveMsg = '';
    try {
      const channels = JSON.parse(content) as UserChannel[];
      const res = await fetch('/api/user/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      if (res.status === 401) {
        unauthorized = true;
        return;
      }
      const result = await res.json();
      if (!result.ok) throw new Error(result.message || '保存失败');
      const body = JSON.stringify(channels, null, 2);
      original = body;
      content = body;
      saveMsg = '已保存';
      setTimeout(() => { saveMsg = ''; }, 2500);
    } catch (e) {
      saveMsg = '保存失败: ' + (e instanceof Error ? e.message : String(e));
    } finally {
      saving = false;
    }
  }

  function format() {
    try {
      content = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* ignore */
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target as HTMLTextAreaElement;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      content = content.slice(0, start) + '  ' + content.slice(end);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>我的频道 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header">
      <div class="header-left">
        <h2>我的频道</h2>
        <p class="page-desc">
          每个频道可绑定多个信源，用于首页信息流分组。格式：<code>[&#123; "id", "title", "sourceRefs": ["url"] &#125;]</code>
        </p>
      </div>
      {#if !unauthorized}
        <div class="header-actions">
          <button class="btn btn-secondary" on:click={format} disabled={!!error || loading}>
            格式化
          </button>
          <button class="btn btn-primary" on:click={save} disabled={!canSave}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="state">加载中…</div>
    {:else if unauthorized}
      <div class="state unauth">
        <p>需要登录才能管理个人频道</p>
        <a class="btn btn-primary" href="/?next=/me/channels" style="text-decoration:none;margin-top:0.75rem;">去登录</a>
      </div>
    {:else}
      <div class="editor-wrap" class:has-error={!!error}>
        <textarea
          class="editor"
          bind:value={content}
          on:keydown={handleKeydown}
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
        ></textarea>
      </div>
    {/if}

    {#if !unauthorized}
      <div class="footer">
        {#if error}
          <span class="msg error">✗ {error}</span>
        {:else if saveMsg}
          <span class="msg {saveMsg.startsWith('保存失败') ? 'error' : 'success'}">
            {saveMsg.startsWith('保存失败') ? '✗' : '✓'} {saveMsg}
          </span>
        {:else if dirty}
          <span class="msg hint">未保存的更改 · Cmd/Ctrl+S 快速保存</span>
        {:else}
          <span class="msg hint">已同步</span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .feed-wrap {
    min-height: calc(100vh - var(--topbar-height));
    display: flex;
    overflow: auto;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
  }
  .feed-wrap::-webkit-scrollbar { width: 4px; }
  .feed-wrap::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

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
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.15rem;
  }

  .page-desc {
    font-size: 0.75rem;
    color: #aaa;
    margin: 0;
  }

  .page-desc code {
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 0.7rem;
    background: #f3f4f6;
    padding: 0.05em 0.3em;
    border-radius: 3px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.85rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-family: inherit;
    transition: background 0.15s;
    white-space: nowrap;
  }
  .btn-primary {
    background: var(--color-primary);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .btn-secondary {
    background: #f0f0f0;
    color: #333;
  }
  .btn-secondary:hover:not(:disabled) {
    background: #e0e0e0;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .editor-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-top: 2px solid transparent;
    transition: border-color 0.15s;
  }
  .editor-wrap.has-error {
    border-top-color: #e53e3e;
  }

  .editor {
    width: 100%;
    height: 100%;
    min-height: 320px;
    padding: 1rem 1.25rem;
    border: none;
    outline: none;
    resize: none;
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 0.8125rem;
    line-height: 1.65;
    color: #222;
    background: transparent;
    tab-size: 2;
  }
  .editor::-webkit-scrollbar { width: 4px; }
  .editor::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

  .footer {
    flex-shrink: 0;
    padding: 0.4rem 1.25rem;
    border-top: 1px solid #f0f0f0;
    min-height: 2rem;
    display: flex;
    align-items: center;
  }

  .msg { font-size: 0.75rem; }
  .msg.error { color: #e53e3e; }
  .msg.success { color: #1a7f37; }
  .msg.hint { color: #bbb; }

  .state {
    text-align: center;
    padding: 4rem;
    color: #aaa;
    font-size: 0.875rem;
  }
  .state.unauth {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  @media (max-width: 600px) {
    .feed-wrap { max-width: 100%; }
    .feed-col { border: none; }
    .feed-header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
