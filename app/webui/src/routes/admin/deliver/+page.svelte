<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  /** Gateway 基址，如 https://agidaily.cc/api/gateway（固定投递到 /items、/sources，测试到 /test） */
  let gateway = '';
  /** 与下游 Gateway（如 agidaily `data/token.txt`）一致：非空时带 `Authorization: Bearer` */
  let token = '';
  let loading = true;
  let saving = false;
  let testing = false;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{ gateway?: string; token?: string }>('/api/deliver');
      gateway = data?.gateway ?? '';
      token = data?.token ?? '';
    } catch {
      gateway = '';
      token = '';
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const data = await adminFetchJson<{
        ok?: boolean;
        message?: string;
        gateway?: string;
        token?: string;
      }>('/api/deliver', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gateway.trim(), token: token.trim() }),
      });
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      gateway = data?.gateway ?? gateway;
      token = data?.token ?? token;
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  async function test() {
    const g = gateway.trim();
    if (!g) {
      showToast('请先填写 Gateway 基址', 'error');
      return;
    }
    testing = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string }>('/api/deliver/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: g, token: token.trim() }),
      });
      if (data?.ok) {
        showToast('Gateway 测试投递成功（POST …/test）', 'success');
      } else {
        showToast('测试失败: ' + (data?.message ?? '未知错误'), 'error');
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
      <BackToParentRoute />
      <p class="intro">
        填写<strong>Gateway 基址</strong>（到 <code>/api/gateway</code> 为止，不要带 <code>/items</code>）。非空时：入库与 Pipeline
        完成后会 <code>POST {gateway || '…'}/items</code>（体为 <code>sourceRef</code> + <code>items</code>）；<code>sources.json</code>
        变更后会 <code>POST …/sources</code>（正文与本地信源文件一致）。下游按固定路径接收即可。
      </p>

      <section class="form-section">
        <h3 class="section-title">Gateway 基址</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="url"
            class="url-input"
            placeholder="https://agidaily.cc/api/gateway"
            bind:value={gateway}
          />
          <p class="hint">保存后生效；测试仅向 <code>…/test</code> 发一条合并的连通性请求（示例 items + 当前 sources），不写本地库。</p>
        {/if}
      </section>

      <section class="form-section">
        <h3 class="section-title">Gateway 令牌（可选）</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="password"
            class="url-input"
            placeholder="与下游 token.txt 内容一致，留空则不发送 Authorization"
            autocomplete="off"
            bind:value={token}
          />
          <p class="hint">非空时出站请求携带 Bearer。清空并保存可从配置中移除 token 字段。</p>
        {/if}
      </section>

      <section class="form-section">
        <div class="btn-row">
          <button type="button" class="btn btn-primary" on:click={save} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" class="btn btn-secondary" on:click={test} disabled={testing || loading || !gateway.trim()}>
            {testing ? '测试中…' : '测试 Gateway'}
          </button>
        </div>
      </section>
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
  .url-input {
    width: 100%;
    box-sizing: border-box;
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
    line-height: 1.45;
  }
  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
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
