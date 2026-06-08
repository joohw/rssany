<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { Select } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  let globalProxy = '';
  let proxyListText = '';
  let loading = true;
  let saving = false;

  function parseProxyList(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const proxy = line.trim();
      if (!proxy || seen.has(proxy)) continue;
      seen.add(proxy);
      out.push(proxy);
    }
    return out;
  }

  $: proxyList = parseProxyList(proxyListText);
  $: globalProxyNotInList = globalProxy.trim() && !proxyList.includes(globalProxy.trim());
  $: globalProxyItems = [
    { value: '', label: '不设置全局代理' },
    ...(globalProxyNotInList ? [{ value: globalProxy, label: `${globalProxy}（当前配置，未在列表中）` }] : []),
    ...proxyList.map((proxy) => ({ value: proxy, label: proxy })),
  ];
  $: selectedGlobalProxyLabel = globalProxyItems.find((item) => item.value === globalProxy)?.label ?? '不设置全局代理';

  function onGlobalProxyChange(value: string) {
    globalProxy = value;
  }

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{ globalProxy?: string; proxyList?: string[] }>('/api/proxy');
      globalProxy = typeof data?.globalProxy === 'string' ? data.globalProxy : '';
      proxyListText = Array.isArray(data?.proxyList) ? data.proxyList.join('\n') : '';
    } catch {
      globalProxy = '';
      proxyListText = '';
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; globalProxy?: string; proxyList?: string[] }>('/api/proxy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalProxy: globalProxy.trim(),
          proxyList,
        }),
      });
      if (!data?.ok) throw new Error('保存失败');
      globalProxy = typeof data.globalProxy === 'string' ? data.globalProxy : '';
      proxyListText = Array.isArray(data.proxyList) ? data.proxyList.join('\n') : '';
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
        写入 <code>.rssany/config.json</code> 的 <code>proxyList</code> 与 <code>globalProxy</code>。信源可从代理列表中选择单源代理；未指定单源代理时使用全局代理；未填写时仍可使用环境变量
        <code>HTTP_PROXY</code> / <code>HTTPS_PROXY</code>。
      </p>

      <section class="form-section">
        <h3 class="section-title">代理列表</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <textarea
            class="text-input"
            rows="5"
            placeholder="http://127.0.0.1:7890&#10;http://user:pass@host:port"
            bind:value={proxyListText}
            autocomplete="off"
            spellcheck="false"
          ></textarea>
          <p class="hint">一行一个代理，支持带账号：<code>http://user:pass@host:port</code></p>
        {/if}
      </section>

      <section class="form-section">
        <h3 class="section-title">全局 HTTP(S) 代理</h3>
        {#if loading}
          <p class="hint">加载中…</p>
        {:else}
          <Select.Root
            type="single"
            value={globalProxy}
            onValueChange={onGlobalProxyChange}
            items={globalProxyItems}
          >
            <Select.Trigger class="proxy-select-trigger" aria-label="全局代理">
              <span>{selectedGlobalProxyLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content class="proxy-select-content" sideOffset={4}>
                <Select.Viewport class="proxy-select-viewport">
                  {#each globalProxyItems as option (option.value)}
                    <Select.Item
                      class="proxy-select-item"
                      value={option.value}
                      label={option.label}
                    >
                      {option.label}
                    </Select.Item>
                  {/each}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <p class="hint">全局代理作为信源未指定代理时的默认值。</p>
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
    padding: var(--main-padding-top) 0 1rem;
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
  :global(.proxy-select-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    background: var(--color-card-elevated);
    color: var(--color-foreground);
    font-family: inherit;
    cursor: pointer;
  }
  :global(.proxy-select-trigger span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.proxy-select-trigger:focus-visible) {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }
  :global(.proxy-select-content) {
    z-index: 140;
    width: var(--bits-select-anchor-width);
    max-width: min(42rem, calc(100vw - 2rem));
    padding: 0.25rem;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-panel);
  }
  :global(.proxy-select-viewport) {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    max-height: 16rem;
    overflow: auto;
  }
  :global(.proxy-select-item) {
    display: flex;
    align-items: center;
    min-height: 2rem;
    padding: 0.4rem 0.6rem;
    font-size: 0.8125rem;
    line-height: 1.25;
    color: var(--color-foreground);
    border-radius: var(--radius-sm);
    outline: none;
    cursor: pointer;
    word-break: break-all;
  }
  :global(.proxy-select-item[data-highlighted]) {
    background: var(--color-muted);
  }
  :global(.proxy-select-item[data-selected]) {
    color: var(--color-primary);
    background: var(--color-primary-light);
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
