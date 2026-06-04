<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  let globalProxy = '';
  let loading = true;
  let saving = false;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{ globalProxy?: string }>('/api/proxy');
      globalProxy = typeof data?.globalProxy === 'string' ? data.globalProxy : '';
    } catch {
      globalProxy = '';
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; globalProxy?: string }>('/api/proxy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalProxy: globalProxy.trim() }),
      });
      if (!data?.ok) throw new Error('保存失败');
      globalProxy = typeof data.globalProxy === 'string' ? data.globalProxy : '';
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>代理 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="body">
      <BackToParentRoute />
      <p class="intro">
        写入 <code>.rssany/config.json</code> 的 <code>globalProxy</code>。抓取与站点登录时，若未在
        <code>sources.json</code> 或插件中指定单源代理，则使用此处；未填写时仍可使用环境变量
        <code>HTTP_PROXY</code> / <code>HTTPS_PROXY</code>。
      </p>

      <section class="form-section">
        <h3 class="section-title">全局 HTTP(S) 代理</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="text"
            class="text-input"
            placeholder="http://127.0.0.1:7890"
            bind:value={globalProxy}
            autocomplete="off"
          />
          <p class="hint">留空表示不在配置中设置全局代理（可继续用环境变量）。支持带账号：<code>http://user:pass@host:port</code></p>
        {/if}
      </section>

      <div class="btn-row">
        <button type="button" class="btn btn-primary" disabled={loading || saving} onclick={save}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .feed-wrap {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 42rem;
  }
  .feed-col {
    padding: 0;
  }
  .body {
    overflow: visible;
    padding: 1rem 0;
  }
  .intro {
    color: var(--color-muted-foreground-strong);
    margin: 0 0 1.25rem;
    line-height: 1.5;
    font-size: 0.875rem;
  }
  .intro code {
    font-size: 0.8125rem;
  }
  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.5rem;
  }
  .form-section {
    margin-bottom: 1.25rem;
  }
  .text-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  .text-input::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0.5rem 0 0;
    line-height: 1.45;
  }
  .btn-row {
    display: flex;
    gap: 0.75rem;
  }
  .btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border-radius: 6px;
    cursor: pointer;
    border: none;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
