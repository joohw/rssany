<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { page } from '$app/stores';
  import { showToast } from '$lib/toastStore.js';
  import PluginCodeEditor from '$lib/components/PluginCodeEditor.svelte';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';

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

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-toolbar-block plugin-detail-toolbar">
      <div class="admin-feed-header">
        <div class="admin-feed-header__left">
          <h2>{pluginId || '插件'}</h2>
          <p class="admin-feed-header__desc plugin-path">
            {#if !pluginId}
              缺少插件 id
            {:else if loading}
              加载中…
            {:else if loadError}
              {loadError}
            {:else if filePath}
              {filePath}
            {:else}
              —
            {/if}
          </p>
        </div>
        <div class="admin-feed-header__actions">
          {#if pluginId}
            <BackToParentRoute />
          {/if}
          {#if pluginId && !loading && !loadError}
            <button
              type="button"
              class="admin-toolbar-btn admin-toolbar-btn--primary"
              disabled={saving || !dirty}
              on:click={save}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          {/if}
        </div>
      </div>
    </div>

    <div class="feed-body-scroll">
      {#if !pluginId}
        <div class="state">缺少插件 id</div>
      {:else if loading}
        <div class="state">加载中…</div>
      {:else if loadError}
        <div class="state err">{loadError}</div>
      {:else}
        <div class="plugin-editor-area">
          <div class="editor-wrap">
            {#key pluginId}
              <PluginCodeEditor
                bind:content={content}
                typescript={filePath.endsWith('.ts')}
                onedit={onEditorInput}
              />
            {/key}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /**
   * 与标签 / 日志一致：`main.main-fill` 不滚动，仅 `.feed-body-scroll` 内滚动；顶栏为 admin-feed-header。
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

  /** BackToParentRoute 默认带下边距，顶栏横向排列时去掉 */
  .plugin-detail-toolbar :global(.back-to-parent) {
    margin: 0;
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

  /** 路径：等宽、可换行，与描述区区分 */
  .plugin-path {
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.72rem;
    word-break: break-all;
  }

  .plugin-editor-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 1rem 0;
    box-sizing: border-box;
  }

  .editor-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
