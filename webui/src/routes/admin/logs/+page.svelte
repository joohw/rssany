<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
  const CATEGORIES = ['scraper', 'scheduler', 'db', 'plugin', 'app', 'config', 'pipeline', 'deliver', 'topics'] as const;

  interface LogItem {
    id: number;
    level: string;
    category: string;
    message: string;
    payload: string | null;
    created_at: string;
  }

  let items: LogItem[] = [];
  let total = 0;
  let loading = false;
  let error = '';
  let filterLevel = '';
  let filterCategory = '';
  let offset = 0;
  let expandedId: number | null = null;

  const PAGE_SIZE = 100;

  // 级别、分类变更时直接重新加载
  $: {
    void filterLevel;
    void filterCategory;
    offset = 0;
    load();
  }

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (filterLevel) params.set('level', filterLevel);
    if (filterCategory) params.set('category', filterCategory);
    return '/api/logs?' + params.toString();
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const data: { items: LogItem[]; total: number } = await res.json();
      items = data.items ?? [];
      total = data.total ?? 0;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      items = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function refresh() {
    offset = 0;
    load();
  }

  function prevPage() {
    if (offset <= 0) return;
    offset = Math.max(0, offset - PAGE_SIZE);
    load();
  }

  function nextPage() {
    if (offset + items.length >= total) return;
    offset += PAGE_SIZE;
    load();
  }

  function togglePayload(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  }

  function tryFormatPayload(payload: string | null): string {
    if (!payload) return '';
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }

</script>

<svelte:head>
  <title>日志 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="page">
  <div class="logs-col">
    <div class="logs-header ui-rule-b">
      <h2>日志</h2>
    </div>
    <div class="filters ui-rule-b">
      <div class="filter-row">
        <label>
          <span>级别</span>
          <select bind:value={filterLevel}>
            <option value="">全部</option>
            {#each LEVELS as l}
              <option value={l}>{l}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>分类</span>
          <select bind:value={filterCategory}>
            <option value="">全部</option>
            {#each CATEGORIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </label>
        <button class="btn btn-secondary" on:click={refresh} disabled={loading} title="刷新">刷新</button>
      </div>
    </div>

  <div class="log-area">
  {#if error}
    <div class="state err">{error}</div>
  {:else if loading && items.length === 0}
    <div class="state">加载中…</div>
  {:else if items.length === 0}
    <div class="state">暂无日志</div>
  {:else}
    <div class="log-toolbar ui-rule-b">
      <span class="pagination-info">共 {total} 条，当前 {items.length ? `${offset + 1}–${offset + items.length}` : '—'}</span>
      <div class="pagination-btns">
        <button class="btn btn-secondary btn-sm" disabled={offset <= 0 || loading} on:click={prevPage}>上一页</button>
        <button class="btn btn-secondary btn-sm" disabled={offset + items.length >= total || loading} on:click={nextPage}>下一页</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="th-time">时间</th>
            <th class="th-level">级别</th>
            <th class="th-cat">分类</th>
            <th class="th-msg">消息</th>
          </tr>
        </thead>
        <tbody>
          {#each items as log (log.id)}
            <tr
              class="log-row"
              role="button"
              tabindex="0"
              on:click={() => togglePayload(log.id)}
              on:keydown={(e) => e.key === 'Enter' && togglePayload(log.id)}
            >
              <td class="td-time">{formatTime(log.created_at)}</td>
              <td class="td-level">
                <span class="badge level-{log.level}">{log.level}</span>
              </td>
              <td class="td-cat">{log.category}</td>
              <td class="td-msg">{log.message}</td>
            </tr>
            {#if expandedId === log.id && log.payload}
              <tr class="payload-row">
                <td colspan="4">
                  <pre class="payload-content">{tryFormatPayload(log.payload)}</pre>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>

  {/if}
  </div>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    max-width: var(--feeds-column-max, 720px);
    width: 100%;
    margin: 0 auto;
  }

  .logs-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    background: transparent;
  }

  .logs-header {
    padding: 0.875rem 1.25rem;
    flex-shrink: 0;
  }
  .logs-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.15rem;
    color: var(--color-foreground);
  }

  .log-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .log-area::-webkit-scrollbar {
    width: 4px;
  }
  .log-area::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .filters {
    padding: 0.75rem 1.25rem;
    flex-shrink: 0;
  }
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .filter-row label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
  }
  .filter-row label span {
    white-space: nowrap;
  }
  .filter-row select {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--color-input);
    border-radius: 5px;
    font-size: 0.8125rem;
    font-family: inherit;
    min-width: 6rem;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 0.9rem;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 0.15s;
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
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .table-wrap {
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead th {
    background: var(--color-muted);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  tbody tr {
    border-bottom: 1px solid var(--color-border-muted);
  }
  tbody tr:hover {
    background: var(--color-muted);
  }
  tbody td {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    vertical-align: middle;
  }

  .th-time {
    width: 130px;
  }
  .th-level {
    width: 68px;
  }
  .th-cat {
    width: 82px;
  }
  .th-msg {
    min-width: 0;
  }

  .log-row {
    cursor: pointer;
  }
  .log-row:focus {
    outline: 1px dotted var(--color-muted-foreground);
    outline-offset: -1px;
  }

  .td-time {
    color: var(--color-muted-foreground);
    white-space: nowrap;
  }
  .td-level {
    white-space: nowrap;
  }
  .badge {
    display: inline-block;
    padding: 0.12rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }
  .badge.level-error {
    background: color-mix(in srgb, var(--color-destructive) 18%, transparent);
    color: var(--color-destructive);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 45%, transparent);
  }
  .badge.level-warn {
    background: rgba(234, 179, 8, 0.14);
    color: #fbbf24;
    border: 1px solid rgba(234, 179, 8, 0.35);
  }
  .badge.level-info {
    background: var(--color-primary-light);
    color: var(--color-primary-hover);
    border: 1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
  .badge.level-debug {
    background: var(--color-muted);
    color: var(--color-muted-foreground-strong);
    border: 1px solid var(--color-border);
  }

  .td-cat {
    color: var(--color-muted-foreground-strong);
  }
  .td-msg {
    word-break: break-word;
    max-width: 320px;
  }

  .payload-row td {
    padding: 0 0.75rem 0.5rem;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border-muted);
    vertical-align: top;
  }
  .payload-content {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 0.72rem;
    line-height: 1.5;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--color-muted-foreground-strong);
  }

  .log-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1.25rem;
    flex-shrink: 0;
  }

  .pagination-info {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
  }
  .pagination-btns {
    display: flex;
    gap: 0.5rem;
  }

  .state {
    text-align: center;
    padding: 3rem 1.5rem;
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
  }
  .state.err {
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
    border-radius: var(--radius-md);
    padding: 1rem;
  }

  @media (max-width: 720px) {
    .page {
      max-width: 100%;
    }
    .payload-row td {
      padding-left: 0.5rem;
    }
    .payload-row td[colspan='4'] {
      padding-left: 0.5rem;
    }
  }
</style>
