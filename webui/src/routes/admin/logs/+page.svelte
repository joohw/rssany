<script lang="ts">
  import { onDestroy } from 'svelte';
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';
  import { Select } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
  const CATEGORY_DEBOUNCE_MS = 350;

  const levelItems: { value: string; label: string }[] = [
    { value: '', label: '全部' },
    ...LEVELS.map((l) => ({ value: l, label: l })),
  ];

  function levelLabel(v: string): string {
    return levelItems.find((x) => x.value === v)?.label ?? '全部';
  }

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
  /** 类型筛选（自由字符串，子串匹配；与请求同步） */
  let filterCategoryInput = '';
  let categoryDebounce: ReturnType<typeof setTimeout> | null = null;
  let offset = 0;
  let expandedId: number | null = null;
  let clearing = false;

  const PAGE_SIZE = 100;

  function onCategoryInput() {
    if (categoryDebounce) clearTimeout(categoryDebounce);
    categoryDebounce = setTimeout(() => {
      categoryDebounce = null;
      offset = 0;
      load();
    }, CATEGORY_DEBOUNCE_MS);
  }

  onDestroy(() => {
    if (categoryDebounce) clearTimeout(categoryDebounce);
  });

  // 级别变更时重新加载（类型由输入框防抖后自行 load）
  $: {
    void filterLevel;
    offset = 0;
    load();
  }

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (filterLevel) params.set('level', filterLevel);
    const cat = filterCategoryInput.trim();
    if (cat) params.set('category', cat);
    return '/api/logs?' + params.toString();
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await adminFetch(buildUrl());
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
    if (categoryDebounce) {
      clearTimeout(categoryDebounce);
      categoryDebounce = null;
    }
    offset = 0;
    load();
  }

  async function clearLogs() {
    if (!confirm('确定清空全部日志？此操作不可恢复。')) return;
    clearing = true;
    try {
      const res = await adminFetch('/api/logs', { method: 'DELETE' });
      const txt = await res.text();
      let j: { ok?: boolean; deleted?: number; error?: string } = {};
      try {
        j = txt ? (JSON.parse(txt) as typeof j) : {};
      } catch {
        j = {};
      }
      if (!res.ok) {
        showToast(j.error || txt || `HTTP ${res.status}`, 'error');
        return;
      }
      if (j.ok) {
        showToast(j.deleted != null ? `已清空 ${j.deleted} 条` : '已清空日志', 'success');
        offset = 0;
        expandedId = null;
        await load();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      clearing = false;
    }
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

  /** 表格「详情」列：单行展示 payload（JSON 压成一行，否则空白折叠） */
  function detailOneLine(payload: string | null): string {
    if (payload == null || payload.trim() === '') return '—';
    try {
      return JSON.stringify(JSON.parse(payload));
    } catch {
      return payload.replace(/\s+/g, ' ').trim();
    }
  }

</script>

<svelte:head>
  <title>日志 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="page">
  <div class="logs-col">
    <div class="logs-toolbar-block">
      <div class="admin-feed-header">
        <div class="admin-feed-header__left">
          <h2>日志</h2>
          <p class="admin-feed-header__desc">
            运行与抓取、pipeline 等产生的日志写入本地 logs.db；可按级别与类型筛选，支持刷新与清空。
          </p>
        </div>
        <div class="admin-feed-header__actions">
          <button
            class="admin-toolbar-btn admin-toolbar-btn--secondary"
            type="button"
            on:click={refresh}
            disabled={loading || clearing}
            title="刷新"
          >刷新</button>
          <button
            class="admin-toolbar-btn admin-toolbar-btn--danger"
            type="button"
            on:click={clearLogs}
            disabled={loading || clearing}
            title="清空全部日志"
          >清空</button>
        </div>
      </div>
      <div class="filters">
        <div class="filter-row">
          <div class="filter-left">
            <div class="filter-level-field">
              <span class="filter-level-label">级别</span>
              <Select.Root type="single" bind:value={filterLevel} items={levelItems}>
                <Select.Trigger class="level-select-trigger">
                  <span class="level-select-value">{levelLabel(filterLevel)}</span>
                  <ChevronDown size={14} class="level-select-chevron" aria-hidden="true" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content class="level-select-content" sideOffset={6} align="start">
                    <Select.Viewport class="level-select-viewport">
                      {#each levelItems as opt (opt.value)}
                        <Select.Item value={opt.value} label={opt.label} class="level-select-item">
                          {opt.label}
                        </Select.Item>
                      {/each}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <label class="label-category">
              <span>类型</span>
              <input
                type="text"
                class="filter-category-input"
                placeholder="留空为全部；支持子串匹配"
                bind:value={filterCategoryInput}
                on:input={onCategoryInput}
                autocomplete="off"
                spellcheck="false"
              />
            </label>
          </div>
        </div>
      </div>
    </div>

  <div class="log-body-scroll">
  {#if error}
    <div class="state err">{error}</div>
  {:else if loading && items.length === 0}
    <div class="state">加载中…</div>
  {:else if items.length === 0}
    <div class="state">暂无日志</div>
  {:else}
    <div class="log-has-data">
      <div class="log-table-scroll">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="th-time">时间</th>
                <th class="th-level">级别</th>
                <th class="th-cat">分类</th>
                <th class="th-msg">消息</th>
                <th class="th-detail">详情</th>
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
                  <td class="td-detail" title={log.payload ?? undefined}>{detailOneLine(log.payload)}</td>
                </tr>
                {#if expandedId === log.id && log.payload}
                  <tr class="payload-row">
                    <td colspan="5">
                      <pre class="payload-content">{tryFormatPayload(log.payload)}</pre>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="log-toolbar">
        <span class="pagination-info">共 {total} 条，当前 {items.length ? `${offset + 1}–${offset + items.length}` : '—'}</span>
        <div class="pagination-btns">
          <button class="btn btn-secondary btn-sm" disabled={offset <= 0 || loading} on:click={prevPage}>上一页</button>
          <button class="btn btn-secondary btn-sm" disabled={offset + items.length >= total || loading} on:click={nextPage}>下一页</button>
        </div>
      </div>
    </div>

  {/if}
  </div>
  </div>
</div>

<style>
  /**
   * 与信源/标签页一致：抵消 `main` 的 padding-top，把间距写回工具条，
   * 在 `main.main-fill` 下仅 `.log-table-scroll` 滚动，标题+筛选不随页面卷动。
   */
  .page {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .logs-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    background: transparent;
  }

  .logs-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
    background: var(--color-background);
  }

  .log-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-has-data {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-table-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .log-table-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .log-table-scroll::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .filters {
    padding: 0;
    flex-shrink: 0;
    padding-top: 0.75rem;
  }
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .filter-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
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
  .filter-level-field {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
  }
  .filter-level-label {
    white-space: nowrap;
  }
  :global(.level-select-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    min-width: 7rem;
    height: 2rem;
    padding: 0 0.6rem;
    box-sizing: border-box;
    font-size: 0.8125rem;
    font-family: inherit;
    color: var(--color-foreground);
    background: var(--color-card-elevated);
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  :global(.level-select-trigger:hover) {
    border-color: var(--color-border);
    background: var(--color-card);
  }
  :global(.level-select-trigger[data-state='open']) {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
  .level-select-value {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  :global(.level-select-chevron) {
    flex-shrink: 0;
    opacity: 0.65;
  }
  :global(.level-select-content) {
    z-index: 120;
    min-width: 7rem;
    max-height: min(16rem, 70vh);
    overflow: hidden;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-card-elevated);
    box-shadow: var(--shadow-panel);
    padding: 0.2rem;
  }
  :global(.level-select-viewport) {
    padding: 0.1rem 0;
  }
  :global(.level-select-item) {
    display: flex;
    align-items: center;
    padding: 0.4rem 0.55rem;
    font-size: 0.8125rem;
    border-radius: 4px;
    cursor: pointer;
    color: var(--color-foreground);
    outline: none;
  }
  :global(.level-select-item[data-highlighted]) {
    background: var(--color-muted);
  }
  :global(.level-select-item[data-selected]) {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    color: var(--color-foreground);
  }
  .label-category {
    flex: 1;
    min-width: 0;
    max-width: 20rem;
  }
  .filter-category-input {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--color-input);
    border-radius: 5px;
    font-size: 0.8125rem;
    font-family: inherit;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  .filter-category-input::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .filter-category-input:focus {
    outline: none;
    border-color: var(--color-primary);
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
    width: 100%;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 3;
    /** 与 --color-muted（约 6% 白叠在背景上）等效的不透明色，避免 sticky 时与正文叠色发糊 */
    background: color-mix(in srgb, var(--color-background) 94%, rgb(255 255 255) 6%);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 1px 0 var(--color-border);
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
    width: 7rem;
    max-width: 28vw;
  }
  .th-msg {
    min-width: 0;
  }
  .th-detail {
    width: 32%;
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
  .td-detail {
    color: var(--color-muted-foreground-soft);
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    padding: 0.65rem 0 0;
    flex-shrink: 0;
    background: var(--color-background);
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
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 1.5rem;
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
  }
  .state.err {
    flex: 1;
    align-self: stretch;
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
    border-radius: var(--radius-md);
    padding: 1rem;
    margin: 0.75rem 0;
  }

  @media (max-width: 720px) {
    .page {
      max-width: 100%;
    }
    .payload-row td {
      padding-left: 0.5rem;
    }
    .payload-row td[colspan='5'] {
      padding-left: 0.5rem;
    }
  }
</style>
