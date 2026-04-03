<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { onMount } from 'svelte';
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

  onMount(loadPlugins);
</script>

<svelte:head>
  <title>插件 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="plugins-toolbar-block">
      <div class="feed-header">
        <div class="feed-header-row">
          <div class="feed-header-text">
            <h2>插件</h2>
            <p class="sub">编写插件以适配特定页面的解析规则，比 LLM 兜底更快、更稳定。</p>
          </div>
          <a class="btn-add" href="/admin/plugins/new">添加插件</a>
        </div>
      </div>
    </div>

    <div class="plugins-body-scroll">
      {#if loading}
        <div class="state">加载中…</div>
      {:else if loadError}
        <div class="state error">{loadError}</div>
      {:else if plugins.length === 0}
        <div class="state">暂无已加载插件。可打开 <a class="inline-link" href="/admin/plugins/new">添加插件</a> 从模板创建，或在 <code>plugins/</code>、<code>.rssany/plugins/sources/</code> 放置 *.rssany.js / *.rssany.ts</div>
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
    border-bottom: 1px solid var(--color-border-muted);
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

  .feed-header {
    padding: 0;
    flex-shrink: 0;
  }
  .feed-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .feed-header-text {
    min-width: 0;
    flex: 1;
  }
  .btn-add {
    flex-shrink: 0;
    padding: 0.4rem 0.85rem;
    font-size: 0.8125rem;
    border-radius: var(--radius-sm, 6px);
    font-family: inherit;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-add:hover {
    background: var(--color-primary-hover);
  }
  .inline-link {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .inline-link:hover {
    color: var(--color-primary-hover);
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
    color: var(--color-foreground);
  }
  .sub {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
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
</style>
