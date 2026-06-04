<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  let baseUrl = '';
  let model = '';
  /** 新 Key；留空表示不修改已保存的 Key */
  let apiKeyInput = '';
  let hasApiKey = false;
  let apiKeyInFile = false;
  let loading = true;
  let saving = false;
  let testing = false;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{
        baseUrl?: string;
        model?: string;
        hasApiKey?: boolean;
        apiKeyInFile?: boolean;
      }>('/api/llm');
      baseUrl = data?.baseUrl ?? '';
      model = data?.model ?? '';
      hasApiKey = !!data?.hasApiKey;
      apiKeyInFile = !!data?.apiKeyInFile;
      apiKeyInput = '';
    } catch {
      baseUrl = '';
      model = '';
      hasApiKey = false;
      apiKeyInFile = false;
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const body: Record<string, unknown> = {
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      };
      const trimmed = apiKeyInput.trim();
      if (trimmed) body.apiKey = trimmed;

      const data = await adminFetchJson<{
        ok?: boolean;
        message?: string;
        baseUrl?: string;
        model?: string;
        hasApiKey?: boolean;
        apiKeyInFile?: boolean;
      }>('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      baseUrl = data?.baseUrl ?? baseUrl;
      model = data?.model ?? model;
      hasApiKey = !!data?.hasApiKey;
      apiKeyInFile = !!data?.apiKeyInFile;
      apiKeyInput = '';
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  async function test() {
    testing = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string; reply?: string }>('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (data?.ok) {
        const r = typeof data.reply === 'string' ? data.reply.trim() : '';
        showToast(r ? `连接成功：${r.slice(0, 120)}${r.length > 120 ? '…' : ''}` : '连接成功', 'success');
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
  <title>LLM - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="body">
      <BackToParentRoute />
      <p class="intro">
        与 OpenAI 兼容的 Chat Completions API，用于列表解析、正文提取、Pipeline 打标签与翻译等。
      </p>

      <section class="form-section">
        <h3 class="section-title">API Base URL</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="url"
            class="text-input"
            placeholder="https://api.openai.com/v1"
            bind:value={baseUrl}
            autocomplete="off"
          />
        {/if}
      </section>

      <section class="form-section">
        <h3 class="section-title">模型</h3>
        {#if !loading}
          <input
            type="text"
            class="text-input"
            placeholder="gpt-4o-mini"
            bind:value={model}
            autocomplete="off"
            spellcheck={false}
          />
        {/if}
      </section>

      <section class="form-section">
        <h3 class="section-title">API Key</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <input
            type="password"
            class="text-input"
            placeholder={apiKeyInFile ? '已保存在配置中，留空表示不修改' : 'sk-...'}
            bind:value={apiKeyInput}
            autocomplete="new-password"
            spellcheck={false}
          />
          <p class="hint">
            {#if hasApiKey}
              当前<strong>可用</strong>（文件或环境变量）。
            {:else}
              未检测到 Key，请填写或设置 <code>OPENAI_API_KEY</code>。
            {/if}
            {#if apiKeyInFile}
              已写入配置文件。
            {/if}
          </p>
        {/if}
      </section>

      <section class="form-section">
        <div class="btn-row">
          <button type="button" class="btn btn-primary" on:click={save} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" class="btn btn-secondary" on:click={test} disabled={testing || loading || !hasApiKey}>
            {testing ? '测试中…' : '测试连接'}
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
