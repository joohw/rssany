<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Dialog } from 'bits-ui';
  import { showToast } from '$lib/toastStore.js';

  interface Plugin {
    id: string;
    listUrlPattern: string;
    hasEnrich: boolean;
    hasAuth: boolean;
    /** Site 与 Source 类插件（非 Site 的 pattern 匹配） */
    kind?: 'site' | 'source';
  }

  let plugins: Plugin[] = [];
  let loadError = '';
  let loading = true;

  let showAddDialog = false;
  let newPluginId = '';
  let addBusy = false;

  function openAddDialog() {
    newPluginId = '';
    showAddDialog = true;
  }

  function onAddDialogOpenChange(open: boolean) {
    showAddDialog = open;
    if (!open) newPluginId = '';
  }

  async function submitNewPlugin(e: Event) {
    e.preventDefault();
    const id = newPluginId.trim();
    if (!id) {
      showToast('请填写插件 id', 'error');
      return;
    }
    addBusy = true;
    try {
      const res = await adminFetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const txt = await res.text();
      let j: { error?: string; ok?: boolean } = {};
      try {
        j = txt ? (JSON.parse(txt) as { error?: string; ok?: boolean }) : {};
      } catch {
        j = {};
      }
      if (!res.ok) {
        showToast(j.error || txt || `HTTP ${res.status}`, 'error');
        return;
      }
      if (j.ok) {
        showToast('已创建插件文件', 'success');
        showAddDialog = false;
        newPluginId = '';
        await loadPlugins();
        await goto('/admin/plugins/' + encodeURIComponent(id));
      }
    } catch (err) {
      showToast('请求失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      addBusy = false;
    }
  }

  async function loadPlugins() {
    loading = true;
    loadError = '';
    try {
      const res = await adminFetch('/api/plugins');
      const list = await res.json() as Plugin[];
      // 需要登录的放前面
      plugins = [...list].sort((a, b) => (b.hasAuth ? 1 : 0) - (a.hasAuth ? 1 : 0));
    } catch (err) {
      loadError = '加载失败: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      loading = false;
    }
  }

  async function checkAuth(plugin: Plugin, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await adminFetch(`/auth/check?siteId=${encodeURIComponent(plugin.id)}`);
      const result = await res.json();
      if (result.ok) {
        showToast(`${plugin.id}：${result.authenticated ? '✓ 已登录' : '✗ 未登录'}`, result.authenticated ? 'success' : 'error');
      } else {
        showToast(result.message || '检查失败', 'error');
      }
    } catch (err) {
      showToast('请求失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }

  async function openLogin(plugin: Plugin, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await adminFetch(`/auth/open?siteId=${encodeURIComponent(plugin.id)}`, { method: 'POST' });
      const result = await res.json();
      if (result.ok) {
        showToast(result.message || '已打开登录页面', 'success');
      } else {
        showToast(result.message || '打开失败', 'error');
      }
    } catch (err) {
      showToast('请求失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }

  onMount(() => {
    loadPlugins();
    const url = get(page).url;
    if (url.searchParams.get('openAdd') === '1') {
      newPluginId = '';
      showAddDialog = true;
      goto('/admin/plugins', { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>插件 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="plugins-toolbar-block">
      <div class="admin-feed-header">
        <div class="admin-feed-header__left">
          <h2>插件</h2>
          <p class="admin-feed-header__desc">编写插件以适配特定页面的解析规则，比 LLM 兜底更快、更稳定。</p>
        </div>
        <div class="admin-feed-header__actions">
          <button type="button" class="admin-toolbar-btn admin-toolbar-btn--primary" onclick={openAddDialog}>添加插件</button>
        </div>
      </div>
    </div>

    <div class="plugins-body-scroll">
      {#if loading}
        <div class="state">加载中…</div>
      {:else if loadError}
        <div class="state error">{loadError}</div>
      {:else if plugins.length === 0}
        <div class="state">
          暂无已加载插件。可
          <button type="button" class="link-btn" onclick={openAddDialog}>添加插件</button>
          从模板创建，或在 <code>plugins/</code>、<code>.rssany/plugins/sources/</code> 放置 *.rssany.js / *.rssany.ts
        </div>
      {:else}
        <div class="list">
          {#each plugins as plugin (plugin.id)}
            <div class="row">
              <div class="row-main">
                <div class="row-title">
                  <a class="row-id" href="/admin/plugins/{encodeURIComponent(plugin.id)}">{plugin.id}</a>
                  {#if plugin.kind === 'source'}
                    <span class="kind-badge">Source</span>
                  {/if}
                </div>
                <span class="row-pattern" title={plugin.listUrlPattern}>{plugin.listUrlPattern}</span>
              </div>
              {#if plugin.hasAuth}
                <div class="row-actions">
                  <button type="button" class="btn btn-secondary" onclick={(e) => checkAuth(plugin, e)}>检查登录</button>
                  <button type="button" class="btn btn-primary" onclick={(e) => openLogin(plugin, e)}>打开登录页</button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<Dialog.Root open={showAddDialog} onOpenChange={onAddDialogOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" aria-describedby={undefined}>
      <div class="modal-header">
        <Dialog.Title class="modal-title">添加插件</Dialog.Title>
        <Dialog.Close class="modal-close" aria-label="关闭">✕</Dialog.Close>
      </div>
      <form class="modal-body" onsubmit={submitNewPlugin}>
        <p class="add-hint">
          基于仓库模板 <code>plugins/templates/site.rssany.js</code> 生成
          <code>.rssany/plugins/sources/&lt;id&gt;.rssany.ts</code>。id 须字母开头，仅字母数字、下划线、连字符；不能使用 id
          <code>new</code>。
        </p>
        <div class="field">
          <span class="field-label">插件 id</span>
          <input
            class="field-input"
            type="text"
            name="pluginId"
            bind:value={newPluginId}
            placeholder="例如 my-site"
            autocomplete="off"
            spellcheck={false}
          />
        </div>
        <div class="modal-footer">
          <div class="modal-footer-right">
            <Dialog.Close class="btn-cancel" disabled={addBusy} type="button">取消</Dialog.Close>
            <button type="submit" class="btn-save" disabled={addBusy}>{addBusy ? '创建中…' : '创建并打开编辑'}</button>
          </div>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /**
   * 与首页信源列表一致：对消 main padding；标题区固定；仅 `.plugins-body-scroll` 内滚动。
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

  .plugins-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
    background: var(--color-background);
  }

  .plugins-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .plugins-body-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .plugins-body-scroll::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--color-primary);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    font-size: inherit;
  }
  .link-btn:hover {
    color: var(--color-primary-hover);
  }
  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .state.error {
    color: var(--color-destructive);
  }

  .list {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-card);
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row:hover {
    background: var(--color-muted);
  }

  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .row-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .kind-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-muted-foreground-strong);
    border: 1px solid var(--color-border-muted);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
  }
  .row-id {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    text-decoration: none;
  }
  .row-id:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .row-pattern {
    font-size: 0.78rem;
    font-family: monospace;
    color: var(--color-muted-foreground-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .btn {
    padding: 0.35rem 0.7rem;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    transition: background 0.15s;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .btn-primary:hover {
    background: var(--color-primary-hover);
  }
  .btn-secondary {
    background: var(--color-muted);
    color: var(--color-foreground);
    border: 1px solid var(--color-border);
  }
  .btn-secondary:hover {
    background: var(--color-accent);
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
    .row {
      flex-wrap: wrap;
    }
    .row-pattern {
      display: none;
    }
  }

  /* bits-ui Dialog Portal */
  :global(.modal-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
  }
  :global(.modal) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--color-card-elevated);
    border-radius: 10px;
    width: calc(100% - 2rem);
    max-width: 520px;
    box-shadow: var(--shadow-panel);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 101;
  }
  :global(.modal) .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--color-border-muted);
  }
  :global(.modal-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
  }
  :global(.modal-close) {
    background: none;
    border: none;
    padding: 0.25rem;
    font-size: 1rem;
    color: var(--color-muted-foreground);
    cursor: pointer;
    line-height: 1;
    border-radius: 4px;
  }
  :global(.modal-close:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .modal-body {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .add-hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--color-muted-foreground-soft);
  }
  .add-hint code {
    font-size: 0.68rem;
    word-break: break-all;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field-label {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
  }
  .field-input {
    padding: 0.5rem 0.65rem;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-input);
    background: var(--color-card);
    color: var(--color-foreground);
    font-family: ui-monospace, monospace;
    font-size: 0.875rem;
    width: 100%;
    outline: none;
  }
  .field-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.25rem;
    border-top: none;
  }
  .modal-footer-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  :global(.btn-cancel) {
    padding: 0.4rem 1rem;
    font-size: 0.875rem;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.btn-cancel:hover:not(:disabled)) {
    background: var(--color-accent);
  }
  .btn-save {
    padding: 0.4rem 1.2rem;
    font-size: 0.875rem;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-save:hover:not(:disabled) {
    opacity: 0.85;
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
