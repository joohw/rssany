<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { showToast } from '$lib/toastStore.js';
  import PluginCodeEditor from '$lib/components/PluginCodeEditor.svelte';

  function goBack() {
    if (browser) history.back();
  }

  $: pluginId = $page.params.id ? decodeURIComponent($page.params.id) : '';

  let filePath = '';
  let content = '';
  let loading = true;
  let saving = false;
  let loadError = '';
  let dirty = false;

  async function load() {
    if (!pluginId) return;
    loading = true;
    loadError = '';
    try {
      const res = await adminFetch('/api/plugins/' + encodeURIComponent(pluginId));
      if (!res.ok) {
        const txt = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(txt) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          if (txt.trim()) msg = txt;
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { filePath?: string; content?: string };
      filePath = data.filePath ?? '';
      content = data.content ?? '';
      dirty = false;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      filePath = '';
      content = '';
    } finally {
      loading = false;
    }
  }

  $: if (pluginId) load();

  function onEditorInput() {
    dirty = true;
  }

  async function save() {
    if (!pluginId || saving) return;
    saving = true;
    try {
      const res = await adminFetch('/api/plugins/' + encodeURIComponent(pluginId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const txt = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(txt) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          if (txt.trim()) msg = txt;
        }
        throw new Error(msg);
      }
      dirty = false;
      showToast('已保存并重新加载插件', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>{pluginId ? `${pluginId} · 插件` : '插件'} — {PRODUCT_NAME}</title>
</svelte:head>

<div class="page">
  <header class="toolbar">
    <div class="toolbar-left">
      <button type="button" class="back" onclick={goBack}>← 返回</button>
      {#if pluginId}
        <span class="id-label">{pluginId}</span>
      {/if}
    </div>
    {#if pluginId && !loading && !loadError}
      <button type="button" class="btn primary" disabled={saving || !dirty} onclick={save}>
        {saving ? '保存中…' : '保存'}
      </button>
    {/if}
  </header>

  <div class="plugin-body-scroll">
    {#if !pluginId}
      <div class="state">缺少插件 id</div>
    {:else if loading}
      <div class="state">加载中…</div>
    {:else if loadError}
      <div class="state err">{loadError}</div>
    {:else}
      {#if filePath}
        <p class="path" title={filePath}>{filePath}</p>
      {/if}
      <div class="editor-wrap">
        {#key pluginId}
          <PluginCodeEditor
            bind:content={content}
            typescript={filePath.endsWith('.ts')}
            onedit={onEditorInput}
          />
        {/key}
      </div>
    {/if}
  </div>
</div>

<style>
  /**
   * 与首页信源列表一致：对消 main padding，工具条固定在顶栏下；仅 `.plugin-body-scroll` 内滚动。
   */
  .page {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 960px;
    margin-left: auto;
    margin-right: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: nowrap;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
    padding-inline: 0;
    border-bottom: 1px solid var(--color-border-muted);
    background: var(--color-background);
  }
  .plugin-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: nowrap;
    min-width: 0;
    flex: 1;
  }
  .back {
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .back:hover {
    color: var(--color-primary);
  }
  .id-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    margin: 0.75rem 0 0;
    flex-shrink: 0;
    font-size: 0.72rem;
    font-family: ui-monospace, monospace;
    color: var(--color-muted-foreground-soft);
    word-break: break-all;
  }
  .editor-wrap {
    margin-top: 0.75rem;
    flex-shrink: 0;
  }
  .toolbar .btn {
    flex-shrink: 0;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.65rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-muted);
    color: var(--color-foreground);
    font-family: inherit;
    white-space: nowrap;
  }
  .btn.primary {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
  }
  .btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
    opacity: 0.95;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .state.err {
    color: var(--color-destructive);
  }
</style>
