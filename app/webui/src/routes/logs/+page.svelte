<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Select } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { PRODUCT_NAME } from '$lib/brand';
  import { adminFetch } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
  const LEVEL_OPTIONS = [
    { value: '', label: '全部' },
    ...LEVELS.map((level) => ({ value: level, label: level })),
  ];
  const FILTER_DEBOUNCE_MS = 350;

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
  /** 空为全部；否则为 error / warn / info / debug */
  let filterLevelInput = '';
  /** 类型筛选（自由字符串，子串匹配；与请求同步） */
  let filterCategoryInput = '';
  let filterDebounce: ReturnType<typeof setTimeout> | null = null;
  let offset = 0;
  let expandedId: number | null = null;
  let clearing = false;

  const PAGE_SIZE = 100;

  function clearFilterDebounce() {
    if (filterDebounce) {
      clearTimeout(filterDebounce);
      filterDebounce = null;
    }
  }

  function onFilterInput() {
    clearFilterDebounce();
    filterDebounce = setTimeout(() => {
      filterDebounce = null;
      offset = 0;
      load();
    }, FILTER_DEBOUNCE_MS);
  }

  function onLevelChange(value: string) {
    filterLevelInput = value;
    offset = 0;
    load();
  }

  $: selectedLevelLabel = LEVEL_OPTIONS.find((option) => option.value === filterLevelInput)?.label ?? '全部';

  onMount(() => {
    load();
  });

  onDestroy(() => {
    clearFilterDebounce();
  });

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (filterLevelInput) params.set('level', filterLevelInput);
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

  async function clearLogs() {
    if (!confirm('确定清空全部日志？此操作不可恢复。')) return;
    clearing = true;
    clearFilterDebounce();
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

</script>

<svelte:head>
  <title>日志 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-toolbar-block">
      <div class="admin-feed-header">
        <div class="admin-feed-header__left">
          <h2>日志</h2>
          <p class="admin-feed-header__desc">查看运行日志、筛选分类与级别</p>
        </div>
        <div class="admin-feed-header__actions">
          <input
            type="search"
            class="admin-toolbar-input log-filter-input"
            placeholder="过滤…"
            bind:value={filterCategoryInput}
            on:input={onFilterInput}
            autocomplete="off"
            spellcheck="false"
            aria-label="分类"
          />
          <Select.Root
            type="single"
            value={filterLevelInput}
            onValueChange={onLevelChange}
            items={LEVEL_OPTIONS}
          >
            <Select.Trigger class="log-level-trigger" aria-label="级别">
              <span>{selectedLevelLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content class="log-level-content" sideOffset={4}>
                <Select.Viewport class="log-level-viewport">
                  {#each LEVEL_OPTIONS as option (option.value)}
                    <Select.Item
                      class="log-level-item"
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
          <button
            class="admin-toolbar-btn admin-toolbar-btn--danger"
            type="button"
            on:click={clearLogs}
            disabled={loading || clearing}
            title="清空全部日志"
          >清空</button>
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
   * 与首页/插件一致：抵消 `main` 的 padding-top；顶栏左过滤（与信源同 placeholder）、右级别下拉与清空；
   * 在 `main.main-fill` 下仅 `.log-table-scroll` 滚动，工具条不随列表卷动。
   */
  .feed-wrap {
    --feed-sticky-gap-after: 0;
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .feed-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    background: transparent;
  }

  .feed-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
  }

  .feed-toolbar-block :global(.admin-feed-header) {
    min-height: 4.1rem;
  }
  .log-filter-input {
    width: min(16rem, 34vw);
  }
  .log-level-trigger {
    width: 7rem;
    min-width: 7rem;
    height: 2rem;
    min-height: 2rem;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.35rem 0.55rem 0.35rem 0.6rem;
    font-size: 0.8125rem;
    font-family: inherit;
    color: var(--color-foreground);
    background: var(--color-card-elevated);
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .log-level-trigger:hover {
    background: var(--color-card);
    border-color: var(--color-border);
  }
  .log-level-trigger:focus-visible {
    outline: none;
    border-color: var(--color-primary);
  }
  .log-level-trigger :global(svg) {
    flex-shrink: 0;
    color: var(--color-muted-foreground);
  }

  :global(.log-level-content) {
    z-index: 120;
    min-width: 7rem;
    padding: 0.25rem;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-panel);
  }
  :global(.log-level-viewport) {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  :global(.log-level-item) {
    display: flex;
    align-items: center;
    min-height: 1.85rem;
    padding: 0.35rem 0.55rem;
    font-size: 0.8125rem;
    line-height: 1.25;
    color: var(--color-foreground);
    border-radius: var(--radius-sm);
    outline: none;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  :global(.log-level-item[data-highlighted]) {
    background: var(--color-muted);
  }
  :global(.log-level-item[data-selected]) {
    color: var(--color-primary);
    background: var(--color-primary-light);
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
    /** 浅色壳：略抬升的实底，避免 sticky 时与正文叠半透明发糊 */
    background: var(--color-card-elevated);
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
    padding: 0.25rem 0.75rem 0.65rem;
    background: transparent;
    border-bottom: 1px solid var(--color-border-muted);
    vertical-align: top;
  }
  .payload-content {
    margin: 0;
    padding: 0;
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 0.72rem;
    line-height: 1.5;
    background: transparent;
    border: none;
    border-radius: 0;
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
    padding: 0.65rem 0 0.85rem;
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
    .feed-wrap {
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
