<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  let url = '';
  let loading = true;
  let saving = false;
  let testing = false;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{ url?: string }>('/api/deliver');
      url = data?.url ?? '';
    } catch {
      url = '';
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string; url?: string }>('/api/deliver', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      url = data?.url ?? url;
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  async function test() {
    const target = url.trim();
    if (!target) {
      showToast('请先填写投递 URL', 'error');
      return;
    }
    testing = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string }>('/api/deliver/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      if (data?.ok) {
        showToast('投递测试成功', 'success');
      } else {
        showToast('投递测试失败: ' + (data?.message ?? '未知错误'), 'error');
      }
    } catch (e) {
      showToast('测试失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      testing = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>投递 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="body">
      <p class="intro">
        填写下游接收地址后，定时抓取<strong>不再写入本地条目表</strong>，仅将条目以 JSON POST（字段含
        <code>sourceRef</code>、<code>items</code>）到该 URL。留空则抓取结果正常入库。运行日志仍落库。
      </p>

      <section class="form-section">
        <h3 class="section-title">投递目标 URL</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="url"
            class="url-input"
            placeholder="https://downstream.example.com/ingest"
            bind:value={url}
          />
          <p class="hint">保存后生效；测试会发送一条示例条目，不写本地库。</p>
        {/if}
      </section>

      <section class="form-section">
        <div class="btn-row">
          <button type="button" class="btn btn-primary" on:click={save} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" class="btn btn-secondary" on:click={test} disabled={testing || loading || !url.trim()}>
            {testing ? '测试中…' : '测试投递'}
          </button>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .feed-wrap {
    width: 100%;
    max-width: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
    min-height: auto;
  }
  .feed-col {
    display: flex;
    flex-direction: column;
    overflow: visible;
    min-height: auto;
    background: transparent;
  }
  .body {
    flex: 1;
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
  .url-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  .url-input::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0.5rem 0 0;
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
  .btn-secondary {
    background: var(--color-muted);
    color: var(--color-foreground);
    border: 1px solid var(--color-border);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--color-accent);
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
