<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  let urlInput = '';
  let proxyInput = '';
  let loading = false;
  let errorText = '';
  let resultText = '';

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
          <button type="submit" disabled={loading}>{loading ? '解析中…' : '解析'}</button>
        </div>
        <div class="proxy-row">
          <input
            type="text"
            bind:value={proxyInput}
            placeholder="代理（可选），如 http://127.0.0.1:7890 — 覆盖信源与 HTTP_PROXY"
            autocomplete="off"
            spellcheck="false"
          />
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

      <div class="info-box">
        <p>
          抓取在<strong>服务端</strong>执行，默认<strong>有头</strong> Chrome（与信源同一套 Puppeteer），会弹出可见窗口；本页 <code>fetch</code> 仅用于展示 JSON。需要无头时在 URL 加 <code>?headless=true</code>。
        </p>
        <p class="info-note">
          返回中的 <code>effectiveProxy</code> 为本次抓取实际选用的代理。若需在看得到的窗口里验证出口 IP，请在该 Puppeteer 窗口内打开 <code>api.ipify.org</code> 等（勿用本机普通浏览器标签测代理）。
        </p>
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
  .feed-header {
    padding: 0.875rem 0;
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
  .url-row button {
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
  .url-row button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .url-row button:disabled {
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
  .proxy-row input {
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
    font-family: ui-monospace, monospace;
  }
  .proxy-row input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  .info-box {
    margin-top: 2rem;
    width: 100%;
    background: var(--color-primary-light);
    border: 1px solid color-mix(in srgb, var(--color-primary) 38%, transparent);
    border-radius: var(--radius-md);
    padding: 0.875rem 1.125rem;
    font-size: 0.8rem;
    color: var(--color-muted-foreground-strong);
    line-height: 1.7;
  }
  .info-box p {
    margin: 0 0 0.65rem;
  }
  .info-box p:last-child {
    margin-bottom: 0;
  }
  .info-note {
    color: var(--color-muted-foreground);
    font-size: 0.78rem;
  }
  .info-box code {
    background: var(--color-muted);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-family: monospace;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
