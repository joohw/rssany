<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  /// <reference path="../../../lucide-svelte.d.ts" />
  import { onMount } from 'svelte';
  import { Puzzle } from 'lucide-svelte';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Code2 from 'lucide-svelte/icons/code-2';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import Trash from 'lucide-svelte/icons/trash';
  import { Dialog, Popover } from 'bits-ui';
  import { refToTaskId, setPulling, clearPulling } from '$lib/sourcePullStore.js';

  interface SubscriptionSource {
    ref: string;
    type?: string;
    label?: string;
    description?: string;
    refresh?: string;
    cron?: string;
    proxy?: string;
    weight?: number;
  }

  interface SourceCard {
    ref: string;
    displayLabel: string;
    description?: string;
    count: number;
    latestAt: string | null;
    feedsHref: string;
    pluginId: string | null;
    weight: number;
  }

  type SortMode = 'alpha' | 'count' | 'weight';
  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'weight', label: '重要性' },
    { value: 'count',  label: '文章数量' },
    { value: 'alpha',  label: '首字母' },
  ];
  const REFRESH_OPTIONS = [
    { value: '', label: '默认（跟随插件）' },
    { value: '10min', label: '10 分钟' },
    { value: '30min', label: '30 分钟' },
    { value: '1h',    label: '1 小时' },
    { value: '6h',    label: '6 小时' },
    { value: '12h',   label: '12 小时' },
    { value: '1day',  label: '1 天' },
    { value: '3day',  label: '3 天' },
    { value: '7day',  label: '7 天' },
  ];

  // ── 列表状态 ──────────────────────────────────────────
  let rawSources: SubscriptionSource[] = [];
  let cards: SourceCard[] = [];
  let loading = true;
  let loadError = '';
  let filterQuery = '';
  let sortBy: SortMode = 'weight';
  let showSortPopover = false;
  let confirmDelete = false;
  let editingOriginalRef = '';
  /** 当前打开「更多」菜单的 card.ref，用于每行一个 Popover */
  let openMoreRef: string | null = null;
  let clearingRef: string | null = null;

  // ── 弹窗状态 ──────────────────────────────────────────
  let showModal = false;
  let isEditing = false;
  let saving = false;
  let saveError = '';

  let formRef = '';
  let formLabel = '';
  let formDescription = '';
  let formWeight = 0;
  let formRefresh = '';
  let formProxy = '';
  /** 添加/编辑时，当前 Ref 匹配到的插件 id（仅提示用） */
  let formRefPluginId: string | null = null;
  let _pluginMatchTimeout: ReturnType<typeof setTimeout> | null = null;
  $: formRef, debouncePluginMatch(formRef);

  /** 用于 plugin-match 的 ref：无协议时补 https://，便于后端 listUrlPattern 匹配 */
  function normalizeRefForMatch(ref: string): string {
    const r = ref?.trim() ?? '';
    if (!r) return r;
    const lower = r.toLowerCase();
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('imaps://') ||
      lower.startsWith('lingowhale://')
    )
      return r;
    return 'https://' + r;
  }

  function debouncePluginMatch(ref: string) {
    if (_pluginMatchTimeout) clearTimeout(_pluginMatchTimeout);
    const r = ref?.trim();
    if (!r) {
      formRefPluginId = null;
      return;
    }
    formRefPluginId = null;
    const refToSend = normalizeRefForMatch(r);
    _pluginMatchTimeout = setTimeout(async () => {
      _pluginMatchTimeout = null;
      try {
        const res = await fetch('/api/sources/plugin-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refs: [refToSend] }),
        });
        if (res.ok) {
          const data = (await res.json()) as Record<string, string | null>;
          if (normalizeRefForMatch(formRef.trim()) === refToSend) {
            formRefPluginId = data[refToSend] ?? null;
          }
        }
      } catch {
        if (normalizeRefForMatch(formRef.trim()) === refToSend) formRefPluginId = null;
      }
    }, 400);
  }

  // ── 排序 ─────────────────────────────────────────────
  function sortCards(list: SourceCard[], mode: SortMode): SourceCard[] {
    return [...list].sort((a, b) => {
      if (mode === 'weight') {
        const diff = b.weight - a.weight;
        return diff !== 0 ? diff : a.displayLabel.localeCompare(b.displayLabel);
      }
      if (mode === 'count') {
        const diff = b.count - a.count;
        return diff !== 0 ? diff : a.displayLabel.localeCompare(b.displayLabel);
      }
      return a.displayLabel.localeCompare(b.displayLabel);
    });
  }

  $: filteredCards = sortCards(
    filterQuery.trim()
      ? cards.filter((c) => {
          const q = filterQuery.trim().toLowerCase();
          return (
            c.displayLabel.toLowerCase().includes(q) ||
            (c.description?.toLowerCase().includes(q) ?? false) ||
            c.ref.toLowerCase().includes(q)
          );
        })
      : cards,
    sortBy
  );

  // ── 数据加载 ──────────────────────────────────────────
  async function load() {
    loading = true;
    loadError = '';
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        fetch('/api/sources/raw'),
        fetch('/api/sources/stats'),
      ]);
      const raw = await sourcesRes.text();
      const data = JSON.parse(raw || '{}') as { sources?: SubscriptionSource[] };
      rawSources = Array.isArray(data.sources) ? data.sources : [];

      const statsArr = statsRes.ok
        ? (await statsRes.json() as { source_url: string; count: number; latest_at?: string | null }[])
        : [];
      const statsMap = new Map(statsArr.map((s) => [s.source_url, { count: s.count, latestAt: s.latest_at ?? null }]));

      const refs = rawSources.filter((s) => s?.ref?.trim()).map((s) => s.ref.trim());
      let pluginMap: Record<string, string | null> = {};
      if (refs.length > 0) {
        try {
          const matchRes = await fetch('/api/sources/plugin-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refs }),
          });
          if (matchRes.ok) pluginMap = (await matchRes.json()) as Record<string, string | null>;
        } catch { /* ignore */ }
      }

      cards = rawSources
        .filter((s) => s?.ref?.trim())
        .map((s) => {
          const ref = s.ref.trim();
          const stat = statsMap.get(ref);
          return {
            ref,
            displayLabel: (s.label && s.label.trim()) || ref,
            description: s.description?.trim(),
            count: stat?.count ?? 0,
            latestAt: stat?.latestAt ?? null,
            feedsHref: '/feeds?ref=' + encodeURIComponent(ref) + '&days=0',
            pluginId: pluginMap[ref] ?? null,
            weight: s.weight ?? 0,
          };
        });
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      cards = [];
    } finally {
      loading = false;
    }
  }

  // ── 持久化 ────────────────────────────────────────────
  async function persistSources(list: SubscriptionSource[]): Promise<boolean> {
    const res = await fetch('/api/sources/raw', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: list }),
    });
    return res.ok;
  }

  // ── 弹窗：打开/关闭 ───────────────────────────────────
  function openAdd() {
    isEditing = false;
    formRef = '';
    formLabel = '';
    formDescription = '';
    formWeight = 0;
    formRefresh = '';
    formProxy = '';
    saveError = '';
    showModal = true;
  }

  function openEdit(card: SourceCard) {
    const src = rawSources.find((s) => s.ref === card.ref);
    isEditing = true;
    editingOriginalRef = card.ref;
    formRef = card.ref;
    formLabel = src?.label ?? '';
    formDescription = src?.description ?? '';
    formWeight = src?.weight ?? 0;
    formRefresh = src?.refresh ?? '';
    formProxy = src?.proxy ?? '';
    saveError = '';
    confirmDelete = false;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    confirmDelete = false;
  }

  // ── 保存（新增 or 编辑） ───────────────────────────────
  async function saveSource() {
    const ref = formRef.trim();
    if (!ref) { saveError = 'ref 不能为空'; return; }
    saving = true;
    saveError = '';
    try {
      const item: SubscriptionSource = {
        ref,
        ...(formLabel.trim()       ? { label:       formLabel.trim() }       : {}),
        ...(formDescription.trim() ? { description: formDescription.trim() } : {}),
        ...(formRefresh            ? { refresh:     formRefresh }             : {}),
        ...(formProxy.trim()       ? { proxy:       formProxy.trim() }        : {}),
        ...(formWeight !== 0       ? { weight:      formWeight }              : {}),
      };
      let updated: SubscriptionSource[];
      if (isEditing) {
        if (ref !== editingOriginalRef && rawSources.some((s) => s.ref === ref)) {
          saveError = '该 ref 已存在';
          return;
        }
        updated = rawSources.map((s) => (s.ref === editingOriginalRef ? { ...s, ...item } : s));
      } else {
        if (rawSources.some((s) => s.ref === ref)) {
          saveError = '该 ref 已存在';
          return;
        }
        updated = [...rawSources, item];
      }
      const ok = await persistSources(updated);
      if (!ok) { saveError = '保存失败，请重试'; return; }
      closeModal();
      await load();
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  // ── 删除 ──────────────────────────────────────────────
  async function deleteSource() {
    const updated = rawSources.filter((s) => s.ref !== editingOriginalRef);
    await persistSources(updated);
    closeModal();
    await load();
  }

  // ── 拉取 ──────────────────────────────────────────────
  async function pollTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
    for (let i = 0; i < 120; i++) {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return { ok: false, error: '轮询失败' };
      const data = (await res.json()) as { status?: string; error?: string };
      if (data.status === 'done') return { ok: true };
      if (data.status === 'error') return { ok: false, error: data.error ?? '拉取失败' };
      await new Promise((r) => setTimeout(r, 800));
    }
    return { ok: false, error: '超时' };
  }

  async function forcePull(ref: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (ref in $refToTaskId) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'source-pull', ref }),
      });
      const data = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !data.taskId) return;
      setPulling(ref, data.taskId);
      const result = await pollTask(data.taskId);
      if (result.ok) await load();
    } catch {
      /* 错误已由后端 logger 记录 */
    } finally {
      clearPulling(ref);
    }
  }

  function isHttpRef(ref: string): boolean {
    const r = ref.trim().toLowerCase();
    return r.startsWith('http://') || r.startsWith('https://');
  }

  /** 在新标签页打开 Admin Parse 页，用当前 ref 作为列表页 URL */
  function openParse(ref: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = ref.startsWith('http') ? ref : 'https://' + ref;
    window.open('/admin/parse/' + encodeURIComponent(fullUrl), '_blank');
  }

  /** 清空该信源下所有已入库条目 */
  async function clearSourceFeeds(ref: string) {
    if (clearingRef) return;
    if (!confirm(`确定要清空该信源下的所有条目吗？此操作不可恢复。`)) return;
    clearingRef = ref;
    openMoreRef = null;
    try {
      const res = await fetch('/api/items/by-source?source_url=' + encodeURIComponent(ref), { method: 'DELETE' });
      const data = (await res.json()) as { ok?: boolean; deleted?: number; message?: string };
      if (res.ok && data.ok) await load();
      else if (!res.ok) alert(data.message ?? '清空失败');
    } catch (e) {
      alert(e instanceof Error ? e.message : '清空失败');
    } finally {
      clearingRef = null;
    }
  }

  function formatLatest(iso: string | null): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `最近: ${y}-${m}-${day}`;
    } catch { return ''; }
  }

  onMount(load);
</script>

<svelte:head>
  <title>信源（管理）- {PRODUCT_NAME}</title>
</svelte:head>

<!-- ── 弹窗 ────────────────────────────────────────────── -->
<Dialog.Root
  open={showModal}
  onOpenChange={(open) => { showModal = open; if (!open) confirmDelete = false; }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" aria-describedby={undefined}>
      <div class="modal-header ui-rule-b">
        <Dialog.Title class="modal-title">{isEditing ? '编辑信源' : '添加信源'}</Dialog.Title>
        <Dialog.Close class="modal-close" aria-label="关闭">✕</Dialog.Close>
      </div>
      <div class="modal-body">
        <div class="field">
          <span class="field-label">Ref <span class="required">*</span></span>
          <div class="ref-input-wrap">
            <input
              class="field-input"
              type="text"
              placeholder="https://example.com/feed"
              bind:value={formRef}
            />
            {#if formRefPluginId}
              <span class="plugin-icon-inline" title="匹配插件: {formRefPluginId}">
                <Puzzle size={16} />
              </span>
            {/if}
          </div>
        </div>
        <div class="field">
          <span class="field-label">名称</span>
          <input
            class="field-input"
            type="text"
            placeholder="显示名称（留空则显示 ref）"
            bind:value={formLabel}
          />
        </div>
        <div class="field">
          <span class="field-label">描述</span>
          <input
            class="field-input"
            type="text"
            placeholder="简短说明"
            bind:value={formDescription}
          />
        </div>
        <div class="field-row">
          <div class="field">
            <span class="field-label">权重</span>
            <input class="field-input" type="number" bind:value={formWeight} />
          </div>
          <div class="field">
            <span class="field-label">刷新间隔</span>
            <select class="field-input" bind:value={formRefresh}>
              {#each REFRESH_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="field">
          <span class="field-label">代理</span>
          <input
            class="field-input"
            type="text"
            placeholder="http://127.0.0.1:7890"
            bind:value={formProxy}
          />
        </div>
        {#if saveError}
          <p class="save-error">{saveError}</p>
        {/if}
      </div>
      <div class="modal-footer ui-rule-t">
        <div class="modal-footer-left">
          {#if isEditing}
            {#if confirmDelete}
              <span class="confirm-delete-row">
                <span class="confirm-delete-text">确认删除？</span>
                <button type="button" class="btn-confirm-yes" onclick={deleteSource} disabled={saving}>删除</button>
                <button type="button" class="btn-confirm-no" onclick={() => (confirmDelete = false)}>取消</button>
              </span>
            {:else}
              <button
                type="button"
                class="btn-delete"
                onclick={() => (confirmDelete = true)}
                disabled={saving}
              >
                <Trash2 size={13} />
                删除
              </button>
            {/if}
          {/if}
        </div>
        <div class="modal-footer-right">
          <Dialog.Close class="btn-cancel" disabled={saving}>取消</Dialog.Close>
          <button
            type="button"
            class="btn-save"
            onclick={saveSource}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- ── 主界面 ─────────────────────────────────────────── -->
<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header ui-rule-b">
      <div class="header-left">
        <h2>信源</h2>
        <p class="sub">已订阅的信源，点击查看已入库文章</p>
      </div>
      <div class="header-right">
        <input
          class="filter-input"
          type="search"
          placeholder="过滤…"
          bind:value={filterQuery}
        />
        <Popover.Root bind:open={showSortPopover} onOpenChange={(v) => (showSortPopover = v)}>
          <Popover.Trigger class="sort-btn" title="排序">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            <span>排序</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="dropdown-panel" sideOffset={4} align="end">
              <div class="sort-options">
                {#each SORT_OPTIONS as opt}
                  <button
                    type="button"
                    class="sort-option"
                    class:active={sortBy === opt.value}
                    onclick={() => { sortBy = opt.value; showSortPopover = false; }}
                  >{opt.label}</button>
                {/each}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button type="button" class="btn-add" title="添加信源" onclick={openAdd}>
          <Plus size={14} />
        </button>
      </div>
    </div>

    {#if loading}
      <div class="state">加载中…</div>
    {:else if loadError}
      <div class="state error">{loadError}</div>
    {:else if cards.length === 0}
      <div class="state">
        暂无信源。<button type="button" class="link-btn" onclick={openAdd}>点击添加</button>第一个信源。
      </div>
    {:else if filteredCards.length === 0}
      <div class="state">无匹配结果</div>
    {:else}
      <div class="list">
        {#each filteredCards as card (card.ref)}
          <div class="card">
            <div class="card-main">
              <a class="card-head-link" href={card.feedsHref} title={card.ref}>
                <span class="card-title-row">
                  <span class="card-label">{card.displayLabel}</span>
                  <span class="card-count">{card.count} 篇</span>
                  {#if card.weight !== 0}
                    <span class="card-weight" title="权重">★{card.weight}</span>
                  {/if}
                  {#if card.pluginId}
                    <span class="plugin-icon" title="匹配插件: {card.pluginId}">
                      <Puzzle size={14} />
                    </span>
                  {/if}
                </span>
              </a>
              {#if card.description}
                <span class="card-desc">{card.description}</span>
              {/if}
              {#if card.latestAt}
                <span class="card-latest">{formatLatest(card.latestAt)}</span>
              {/if}
            </div>

            <!-- 拉取 -->
            <button
              type="button"
              class="btn-pull"
              class:pulling={card.ref in $refToTaskId}
              title="强制拉取"
              disabled={card.ref in $refToTaskId}
              onclick={(e) => forcePull(card.ref, e)}
            >
              <RefreshCw size={14} />
              <span>{card.ref in $refToTaskId ? '拉取中…' : '拉取'}</span>
            </button>
            <!-- 更多（打开链接 / Parse / 编辑 / 清空该源条目） -->
            <Popover.Root
              open={openMoreRef === card.ref}
              onOpenChange={(open) => { openMoreRef = open ? card.ref : null; }}
            >
              <Popover.Trigger
                class="btn-icon"
                title="更多"
                onclick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={13} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="dropdown-panel more-menu"  sideOffset={6} align="center" onclick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    class="more-menu-item"
                    onclick={() => { openEdit(card); openMoreRef = null; }}
                  >
                    <Pencil size={14} />
                    <span>编辑</span>
                  </button>
                  {#if isHttpRef(card.ref)}
                    <a
                      class="more-menu-item"
                      href={card.ref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={14} />
                      <span>打开链接</span>
                    </a>
                    <button
                      type="button"
                      class="more-menu-item"
                      onclick={(e) => { openParse(card.ref, e); openMoreRef = null; }}
                    >
                      <Code2 size={14} />
                      <span>解析信源</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="more-menu-item more-menu-item-danger"
                    title="清空该信源下所有已入库条目"
                    disabled={clearingRef === card.ref}
                    onclick={() => clearSourceFeeds(card.ref)}
                  >
                    <Trash size={14} />
                    <span>{clearingRef === card.ref ? '清空中…' : '清空该源条目'}</span>
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .feed-wrap {
    max-width: min(720px, var(--feeds-column-max, 720px));
    width: 100%;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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

  /* ── header ──────────────────────────────────────── */
  .feed-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    flex-shrink: 0;
  }
  .header-left {
    flex: 1;
    min-width: 0;
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
    color: var(--color-foreground);
  }
  .sub {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
    line-height: 1.4;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .filter-input {
    width: 120px;
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    outline: none;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
    transition: border-color 0.15s, background 0.15s;
  }
  .filter-input:focus {
    border-color: var(--color-primary);
    background: var(--color-card);
  }
  .filter-input::placeholder {
    color: var(--color-muted-foreground-soft);
  }

  :global(.sort-btn) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  :global(.sort-btn:hover) {
    color: var(--color-primary);
    border-color: var(--color-border);
    background: var(--color-muted);
  }
  .btn-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.5rem;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
  }
  .btn-add:hover {
    opacity: 0.9;
    background: var(--color-primary-hover, var(--color-primary));
  }

  /* ── dropdown ────────────────────────────────────── */
  :global(.dropdown-panel) {
    z-index: 50;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-panel);
  }
  :global(.more-menu) {
    width: 10rem;
    min-width: 10rem;
    padding: 0.25rem;
    box-sizing: border-box;
  }
  .more-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.65rem;
    font-size: 0.8125rem;
    text-align: left;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--color-muted-foreground-strong);
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }
  .more-menu-item:hover:not(:disabled) {
    background: var(--color-muted);
    color: var(--color-accent-foreground);
  }
  .more-menu-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .more-menu-item-danger:hover:not(:disabled) {
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 14%, transparent);
  }
  .sort-options {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.4rem;
    min-width: 7rem;
  }
  .sort-option {
    padding: 0.4rem 0.65rem;
    font-size: 0.8125rem;
    text-align: left;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--color-muted-foreground-strong);
    transition: color 0.15s;
  }
  .sort-option:hover { color: var(--color-accent-foreground); background: var(--color-muted); }
  .sort-option.active { color: var(--color-primary); font-weight: 500; }

  /* ── state ───────────────────────────────────────── */
  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem 1.25rem;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
    gap: 0.25rem;
  }
  .state.error {
    color: var(--color-destructive);
  }
  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-primary);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
  .link-btn:hover { text-decoration: underline; }

  /* ── list / card ─────────────────────────────────── */
  .list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .list::-webkit-scrollbar {
    width: 4px;
  }
  .list::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .card {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    transition: background 0.15s;
    gap: 0.5rem;
    padding: 0 0.5rem 0 0;
  }
  .card:hover {
    background: var(--color-muted);
  }
  .card:last-child { border-bottom: none; }

  .card-main {
    flex: 1;
    min-width: 0;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .card-head-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    color: inherit;
    border-radius: 4px;
    margin: -2px -4px;
    padding: 2px 4px;
  }
  .card-head-link:hover .card-label { color: var(--color-primary); }
  .card-title-row {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .card-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-count {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    font-weight: 400;
  }
  .card-weight {
    font-size: 0.7rem;
    color: #fbbf24;
    font-weight: 500;
  }
  .plugin-icon {
    display: inline-flex;
    align-items: center;
    color: var(--color-primary);
    opacity: 0.9;
  }
  .card-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-latest {
    font-size: 0.7rem;
    color: var(--color-muted-foreground-soft);
    line-height: 1.3;
  }

  /* ── card buttons ────────────────────────────────── */
  /* :global 使 Popover.Trigger 渲染的按钮能匹配 hover，否则 scoped 无法作用到 bits-ui 根节点 */
  :global(.btn-icon) {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  :global(.btn-icon:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }


  .btn-pull {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.55rem;
    font-size: 0.7rem;
    color: var(--color-muted-foreground-strong);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .btn-pull:hover:not(:disabled) {
    background: var(--color-accent);
    color: var(--color-primary);
  }
  .btn-pull:disabled { cursor: not-allowed; opacity: 0.7; }
  .btn-pull.pulling :global(svg) { animation: spin 0.8s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* ── modal ───────────────────────────────────────── */
  /* bits-ui Dialog renders into a Portal outside this component's scope, so :global() is required */
  :global(.modal-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
  }
  :global(.modal) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--color-card-elevated);
    border-radius: 10px;
    width: calc(100% - 2rem);
    max-width: 460px;
    box-shadow: var(--shadow-panel);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 101;
  }
  :global(.modal) .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
  }
  :global(.modal-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
  }
  :global(.modal-close) {
    background: none;
    border: none;
    padding: 0.25rem;
    font-size: 1rem;
    color: var(--color-muted-foreground);
    cursor: pointer;
    line-height: 1;
    border-radius: 4px;
  }
  :global(.modal-close:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .modal-body {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .field-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-muted-foreground-strong);
  }
  .required {
    color: var(--color-destructive);
  }
  .ref-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
  }
  .ref-input-wrap .field-input {
    flex: 1;
    min-width: 0;
  }
  .plugin-icon-inline {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
    opacity: 0.9;
  }
  .field-input {
    padding: 0.4rem 0.65rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    outline: none;
    background: var(--color-card);
    color: var(--color-foreground);
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }
  .field-input:focus {
    border-color: var(--color-primary);
    background: var(--color-card-elevated);
  }

  .save-error {
    font-size: 0.8rem;
    color: var(--color-destructive);
    margin: 0;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
  }
  .modal-footer-left { display: flex; align-items: center; }
  .modal-footer-right { display: flex; align-items: center; gap: 0.5rem; }
  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.8rem;
    font-size: 0.875rem;
    color: var(--color-destructive);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--color-destructive) 45%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-delete:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
  }
  .confirm-delete-row {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
  }
  .confirm-delete-text {
    color: var(--color-destructive);
    font-weight: 500;
  }
  .btn-confirm-yes {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    color: var(--color-destructive-foreground);
    background: var(--color-destructive);
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }
  .btn-confirm-yes:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-confirm-no {
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 5px;
    cursor: pointer;
  }
  :global(.btn-cancel) {
    padding: 0.4rem 1rem;
    font-size: 0.875rem;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.btn-cancel:hover:not(:disabled)) {
    background: var(--color-accent);
  }
  .btn-save {
    padding: 0.4rem 1.2rem;
    font-size: 0.875rem;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-save:hover:not(:disabled) { opacity: 0.85; }
  .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
    .field-row {
      grid-template-columns: 1fr;
    }
  }
</style>
