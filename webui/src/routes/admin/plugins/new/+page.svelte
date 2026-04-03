<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { goto } from '$app/navigation';
  import { showToast } from '$lib/toastStore.js';

  let newPluginId = '';
  let busy = false;

  async function submit(e: Event) {
    e.preventDefault();
    const id = newPluginId.trim();
    if (!id) {
      showToast('请填写插件 id', 'error');
      return;
    }
    busy = true;
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
        await goto('/admin/plugins/' + encodeURIComponent(id));
      }
    } catch (err) {
      showToast('请求失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>新建插件 — {PRODUCT_NAME}</title>
</svelte:head>

<div class="page">
  <header class="toolbar">
    <div class="toolbar-left">
      <a class="back" href="/admin/plugins">← 返回</a>
      <span class="id-label">新建插件</span>
    </div>
  </header>

  <div class="plugin-body-scroll">
  <div class="body">
    <p class="hint">
      基于仓库模板 <code>plugins/templates/site.rssany.js</code> 生成
      <code>.rssany/plugins/sources/&lt;id&gt;.rssany.ts</code>。id 须字母开头，仅字母数字、下划线、连字符；路由
      <code>/admin/plugins/new</code> 为新建页，不能使用 id <code>new</code>。
    </p>

    <form class="form" onsubmit={submit}>
      <label class="label">
        插件 id
        <input
          class="input"
          type="text"
          name="pluginId"
          bind:value={newPluginId}
          placeholder="例如 my-site"
          autocomplete="off"
          spellcheck={false}
        />
      </label>
      <div class="actions">
        <a class="btn ghost" href="/admin/plugins">取消</a>
        <button type="submit" class="btn primary" disabled={busy}>{busy ? '创建中…' : '创建并打开编辑'}</button>
      </div>
    </form>
  </div>
  </div>
</div>

<style>
  /**
   * 与首页 / plugins/[id] 一致：main-fill 下工具条固定，仅 `.plugin-body-scroll` 内滚动
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
  }
  .back {
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    text-decoration: none;
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
  }
  .body {
    padding: 1rem 0 1.5rem;
    box-sizing: border-box;
  }
  .hint {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--color-muted-foreground-soft);
  }
  .hint code {
    font-size: 0.68rem;
    word-break: break-all;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 28rem;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
  }
  .input {
    padding: 0.5rem 0.65rem;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-border);
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: ui-monospace, monospace;
    font-size: 0.875rem;
  }
  .input:focus {
    outline: none;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
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
    font-family: inherit;
    text-decoration: none;
    border: 1px solid var(--color-border);
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
  .btn.primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.ghost {
    background: var(--color-muted);
    color: var(--color-foreground);
  }
  .btn.ghost:hover {
    background: var(--color-accent);
  }
</style>
