<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { Select } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { adminFetchJson } from '$lib/adminAuth';
  let urlInput = '';
  let proxyInput = '';
  let proxyOptions: string[] = [];
  let loading = false;
  let errorText = '';
  let resultText = '';

  $: proxyNotInOptions = proxyInput.trim() && !proxyOptions.includes(proxyInput.trim());
  $: proxySelectItems = [
    { value: '', label: '使用默认代理' },
    ...(proxyNotInOptions ? [{ value: proxyInput, label: `${proxyInput}（当前配置，未在代理列表中）` }] : []),
    ...proxyOptions.map((proxy) => ({ value: proxy, label: proxy })),
  ];
  $: selectedProxyLabel = proxySelectItems.find((item) => item.value === proxyInput)?.label ?? '使用默认代理';

  function onProxyChange(value: string) {
    proxyInput = value;
  }

  async function loadProxyOptions() {
    try {
      const data = await adminFetchJson<{ proxyList?: unknown }>('/api/proxy');
      proxyOptions = Array.isArray(data.proxyList)
        ? data.proxyList.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : [];
    } catch {
      proxyOptions = [];
    }
  }

  async function go() {
    if (!urlInput.trim()) return;
    loading = true;
    errorText = '';
    resultText = '';
    try {
      const fullUrl = urlInput.startsWith('http') ? urlInput : 'https://' + urlInput;
      const q = new URLSearchParams();
      const p = proxyInput.trim();
      if (p) q.set('proxy', p);
      const qs = q.toString();
      const res = await fetch('/admin/parse/' + encodeURIComponent(fullUrl) + (qs ? '?' + qs : ''), {
        credentials: 'include',
      });
      const text = await res.text();
      if (!res.ok) {
        errorText = text || `HTTP ${res.status}`;
        return;
      }
      try {
        resultText = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        resultText = text;
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(loadProxyOptions);
</script>

<svelte:head>
  <title>Parse - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header">
      <BackToParentRoute />
      <h2>Parse</h2>
      <p class="page-desc">从列表页解析条目结构，返回 JSON，用于调试插件 Parser 规则</p>
    </div>

    <div class="body">
      <form on:submit|preventDefault={go}>
        <div class="url-row">
          <input
            type="url"
            bind:value={urlInput}
            placeholder="输入列表页地址…"
            required
            autocomplete="url"
          />
        </div>
        <div class="proxy-row">
          <Select.Root
            type="single"
            value={proxyInput}
            onValueChange={onProxyChange}
            items={proxySelectItems}
          >
            <Select.Trigger class="proxy-select-trigger" aria-label="代理">
              <span>{selectedProxyLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content class="proxy-select-content" sideOffset={4}>
                <Select.Viewport class="proxy-select-viewport">
                  {#each proxySelectItems as option (option.value)}
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
          {#if proxyOptions.length === 0}
            <p class="field-hint">暂无代理列表，可在后台「代理」中添加。</p>
          {/if}
        </div>
        <div class="action-row">
          <button type="submit" disabled={loading}>{loading ? '解析中…' : '解析'}</button>
        </div>
      </form>

      {#if errorText}
        <div class="result-error" role="alert">{errorText}</div>
      {/if}
      {#if resultText}
        <div class="result-wrap">
          <p class="result-label">解析结果（与下方接口一致）</p>
          <pre class="result-json">{resultText}</pre>
        </div>
      {/if}
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
  .feed-header {
    padding: var(--main-padding-top) 0 0.875rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
    color: var(--color-foreground);
  }
  .page-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
    line-height: 1.5;
  }
  .body {
    flex: 1;
    overflow: visible;
    padding: 1rem 0;
  }

  .url-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .url-row input {
    flex: 1;
    padding: 0.65rem 1rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
    outline: none;
    transition:
      border 0.15s,
      box-shadow 0.15s;
    min-width: 0;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
    font-family: inherit;
  }
  .url-row input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }
  .action-row {
    display: flex;
    justify-content: flex-start;
    margin-bottom: 0.75rem;
  }
  .action-row button {
    padding: 0.65rem 1.375rem;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-family: inherit;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .action-row button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .action-row button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .result-error {
    margin-top: 1rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-destructive, #c00) 12%, transparent);
    color: var(--color-foreground);
    font-size: 0.8125rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .result-wrap {
    margin-top: 1rem;
    width: 100%;
  }
  .result-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.4rem;
  }
  .result-json {
    margin: 0;
    padding: 1rem;
    max-height: min(70vh, 520px);
    overflow: auto;
    font-size: 0.75rem;
    line-height: 1.45;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-input);
    background: var(--color-muted);
    color: var(--color-foreground);
  }

  .proxy-row {
    margin-bottom: 0.75rem;
  }
  :global(.proxy-select-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.55rem 1rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    outline: none;
    transition:
      border 0.15s,
      box-shadow 0.15s;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
    font-family: inherit;
    cursor: pointer;
  }
  :global(.proxy-select-trigger:focus-visible) {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }
  :global(.proxy-select-trigger span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .field-hint {
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    line-height: 1.4;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
