<script lang="ts">
  /// <reference path="../../lucide-svelte.d.ts" />
  import { onMount } from 'svelte';
  import { Puzzle } from 'lucide-svelte';
  import Rss from 'lucide-svelte/icons/rss';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Code2 from 'lucide-svelte/icons/code-2';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import Trash from 'lucide-svelte/icons/trash';
  import Copy from 'lucide-svelte/icons/copy';
  import Mail from 'lucide-svelte/icons/mail';
  import { Dialog, Popover } from 'bits-ui';
  import { refToTaskId, setPulling, clearPulling } from '$lib/sourcePullStore.js';
  import { adminFetch } from '$lib/adminAuth';
  import SourceFeedsSheet from './SourceFeedsSheet.svelte';

  type ParseHint = 'rss' | 'plugin' | 'llm' | 'email';

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
    pluginId: string | null;
    weight: number;
    parseHint: ParseHint | null;
  }

  type SortMode = 'alpha' | 'count' | 'weight';
  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'weight', label: '重要性' },
    { value: 'count',  label: '文章数量' },
    { value: 'alpha',  label: '首字母' },
  ];
  /** 信源级拉取间隔；插件仅负责解析，不决定刷新节奏 */
  const DEFAULT_SOURCE_REFRESH = '1day';
  const REFRESH_OPTIONS = [
    { value: '10min', label: '10 分钟' },
    { value: '30min', label: '30 分钟' },
    { value: '1h',    label: '1 小时' },
    { value: '6h',    label: '6 小时' },
    { value: '12h',   label: '12 小时' },
    { value: '1day',  label: '1 天' },
    { value: '3day',  label: '3 天' },
    { value: '7day',  label: '7 天' },
  ];

  function normalizeFormRefresh(stored: string | undefined): string {
    const v = stored?.trim() ?? '';
    if (REFRESH_OPTIONS.some((o) => o.value === v)) return v;
    return DEFAULT_SOURCE_REFRESH;
  }

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
  let removingRef: string | null = null;

  /** 右侧条目 Sheet */
  let sheetOpen = false;
  let sheetCard: SourceCard | null = null;

  // ── 弹窗状态 ──────────────────────────────────────────
  let showModal = false;
  let isEditing = false;
  let saving = false;
  let saveError = '';

  let formRef = '';
  let formLabel = '';
  let formDescription = '';
  let formWeight = 0;
  let formRefresh = DEFAULT_SOURCE_REFRESH;
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
      lower.startsWith('imap://') ||
      lower.startsWith('lingowhale://')
    )
      return r;
    return 'https://' + r;
  }

  /** 与内置 `plugins/sources/rss.rssany.js` 的 looksLikeFeed 一致，用于判断走 RSS/Atom 类解析 */
  function looksLikeFeedUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('/feed') ||
      lower.includes('/rss') ||
      lower.includes('/atom') ||
      lower.endsWith('.xml') ||
      lower.endsWith('.rss') ||
      lower.endsWith('.atom') ||
      lower.includes('format=rss') ||
      lower.includes('format=atom') ||
      lower.includes('output=rss')
    );
  }

  /**
   * imaps?:// → 内置邮件插件；lingowhale:// → 语鲸协议（按插件处理）；
   * http(s) → RSS 特征 / Site 插件命中 / LLM 兜底（与后端 getSource 一致）。
   */
  function computeParseHint(ref: string, pluginId: string | null): ParseHint | null {
    const r = ref?.trim() ?? '';
    if (!r) return null;
    const lower = r.toLowerCase();
    if (lower.startsWith('imaps://') || lower.startsWith('imap://')) return 'email';
    if (lower.startsWith('lingowhale://')) return 'plugin';

    const n = normalizeRefForMatch(r);
    if (!n.startsWith('http://') && !n.startsWith('https://')) return null;
    if (looksLikeFeedUrl(n)) return 'rss';
    if (pluginId) return 'plugin';
    return 'llm';
  }

  function parseModeLabel(hint: ParseHint | null): string {
    if (hint === 'rss') return 'RSS/Atom';
    if (hint === 'plugin') return '插件';
    if (hint === 'llm') return 'LLM';
    if (hint === 'email') return '邮箱';
    return '—';
  }

  function parseModeTitle(hint: ParseHint | null): string {
    if (hint === 'rss') return '标准 RSS/Atom/JSON Feed（内置 __rss__）';
    if (hint === 'plugin') return 'Site 插件（listUrlPattern）或语鲸协议（lingowhale://）';
    if (hint === 'llm') return '通用网页列表：LLM 解析（generic）';
    if (hint === 'email') return '内置 IMAP 邮件插件（__email__）';
    return '未识别的 ref 协议';
  }

  $: parseHint = computeParseHint(formRef, formRefPluginId);
  /** 弹窗内：空 ref 时仍展示「来源」行，默认高亮 LLM，避免出现时隐时现的跳动 */
  $: parseHintModal = parseHint ?? 'llm';

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
        const res = await adminFetch('/api/sources/plugin-match', {
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
            c.ref.toLowerCase().includes(q) ||
            parseModeLabel(c.parseHint).toLowerCase().includes(q)
          );
        })
      : cards,
    sortBy
  );

  /** 与下方列表同时出现：表头与工具条同一吸顶块，避免表头单独随滚动 */
  $: showListHead =
    !loading && !loadError && cards.length > 0 && filteredCards.length > 0;

  // ── 数据加载 ──────────────────────────────────────────
  async function load() {
    loading = true;
    loadError = '';
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        adminFetch('/api/sources/raw'),
        adminFetch('/api/sources/stats'),
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
          const matchRes = await adminFetch('/api/sources/plugin-match', {
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
          const pid = pluginMap[ref] ?? null;
          return {
            ref,
            displayLabel: (s.label && s.label.trim()) || ref,
            description: s.description?.trim(),
            count: stat?.count ?? 0,
            latestAt: stat?.latestAt ?? null,
            pluginId: pid,
            weight: s.weight ?? 0,
            parseHint: computeParseHint(ref, pid),
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
    const res = await adminFetch('/api/sources/raw', {
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
    formRefresh = DEFAULT_SOURCE_REFRESH;
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
    formRefresh = normalizeFormRefresh(src?.refresh);
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
        refresh: formRefresh,
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
      const res = await adminFetch(`/api/tasks/${taskId}`);
      if (!res.ok) return { ok: false, error: '轮询失败' };
      const data = (await res.json()) as { status?: string; error?: string };
      if (data.status === 'done') return { ok: true };
      if (data.status === 'error') return { ok: false, error: data.error ?? '拉取失败' };
      await new Promise((r) => setTimeout(r, 800));
    }
    return { ok: false, error: '超时' };
  }

  async function forcePull(ref: string, e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (ref in $refToTaskId) return;
    try {
      const res = await adminFetch('/api/tasks', {
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

  /** 与本机 RSS 路由一致：查询式订阅 `/rss?ref=<信源 ref>` */
  function rssUrlForRef(ref: string): string {
    const u = new URL('/rss', typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1');
    u.searchParams.set('ref', ref);
    return u.href;
  }

  async function copyRssUrl(ref: string) {
    const text = rssUrlForRef(ref);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
    openMoreRef = null;
  }

  /** 在新标签页打开 Admin Parse 页，用当前 ref 作为列表页 URL */
  function openParse(ref: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = ref.startsWith('http') ? ref : 'https://' + ref;
    window.open('/admin/parse/' + encodeURIComponent(fullUrl), '_blank');
  }

  /** 从订阅列表移除该信源（不删除已入库条目） */
  async function removeSourceByRef(ref: string) {
    if (removingRef) return;
    if (
      !confirm(
        '确定从订阅列表中移除该信源吗？已入库的条目不会自动删除；若需一并删除条目，可先使用「清空该源条目」。'
      )
    )
      return;
    removingRef = ref;
    openMoreRef = null;
    try {
      const updated = rawSources.filter((s) => s.ref !== ref);
      const ok = await persistSources(updated);
      if (!ok) {
        alert('移除失败，请重试');
        return;
      }
      if (sheetCard?.ref === ref) {
        sheetOpen = false;
        sheetCard = null;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '移除失败');
    } finally {
      removingRef = null;
    }
  }

  /** 清空该信源下所有已入库条目 */
  async function clearSourceFeeds(ref: string) {
    if (clearingRef) return;
    if (!confirm(`确定要清空该信源下的所有条目吗？此操作不可恢复。`)) return;
    clearingRef = ref;
    openMoreRef = null;
    try {
      const res = await adminFetch('/api/items/by-source?source_url=' + encodeURIComponent(ref), { method: 'DELETE' });
      const data = (await res.json()) as { ok?: boolean; deleted?: number; message?: string };
      if (res.ok && data.ok) await load();
      else if (!res.ok) alert(data.message ?? '清空失败');
    } catch (e) {
      alert(e instanceof Error ? e.message : '清空失败');
    } finally {
      clearingRef = null;
    }
  }

  function openSheetForCard(card: SourceCard) {
    sheetCard = card;
    sheetOpen = true;
  }

  function onCardRowClick(card: SourceCard, e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest('a[href], button')) return;
    openSheetForCard(card);
  }

  function onCardRowKeydown(card: SourceCard, e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openSheetForCard(card);
  }

  /** 列表「最近拉取」列：YYYY-MM-DD 或 — */
  function formatLatestShort(iso: string | null): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return '—';
    }
  }

  onMount(load);
</script>

<!-- ── 弹窗 ────────────────────────────────────────────── -->
<Dialog.Root
  open={showModal}
  onOpenChange={(open) => { showModal = open; if (!open) confirmDelete = false; }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" aria-describedby={undefined}>
      <div class="modal-header">
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
          </div>
        </div>
        <div class="field">
          <span class="field-label">来源</span>
          <div class="parse-hints" role="status" aria-live="polite">
            <span
              class="parse-hint"
              class:active={parseHintModal === 'rss'}
              title="标准 RSS/Atom/JSON Feed（内置 __rss__，rss-parser）"
            >
              <Rss size={14} class="parse-hint-icon" />
              <span>RSS/Atom</span>
            </span>
            <span
              class="parse-hint"
              class:active={parseHintModal === 'email'}
              title="内置 IMAP 邮件插件（__email__）"
            >
              <Mail size={14} class="parse-hint-icon" />
              <span>邮箱</span>
            </span>
            <span
              class="parse-hint"
              class:active={parseHintModal === 'plugin'}
              title="Site 插件（listUrlPattern）或语鲸协议（lingowhale://）"
            >
              <Puzzle size={14} class="parse-hint-icon" />
              <span>插件</span>
            </span>
            <span
              class="parse-hint"
              class:active={parseHintModal === 'llm'}
              title="通用网页列表：无 Feed 特征且未命中插件时，走 LLM 解析（generic）"
            >
              <Sparkles size={14} class="parse-hint-icon" />
              <span>LLM</span>
            </span>
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
      <div class="modal-footer">
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

<SourceFeedsSheet
  open={sheetOpen}
  sourceRef={sheetCard?.ref ?? ''}
  sourceLabel={sheetCard?.displayLabel ?? ''}
  onOpenChange={(v) => {
    sheetOpen = v;
    if (!v) sheetCard = null;
  }}
/>

<!-- ── 主界面 ─────────────────────────────────────────── -->
<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-toolbar-block">
    <div class="feed-header">
      <div class="header-left">
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
      </div>
      <div class="header-right">
        <button type="button" class="btn-add" title="添加信源" onclick={openAdd}>
          <Plus size={14} aria-hidden="true" />
          <span>添加信源</span>
        </button>
      </div>
    </div>
    {#if showListHead}
      <div class="list-head row-grid" aria-hidden="true">
        <span class="col-h col-title">标题</span>
        <span class="col-h col-desc">描述</span>
        <span class="col-h col-parse">解析</span>
        <span class="col-h col-latest">最近拉取</span>
        <span class="col-h col-count">数量</span>
        <span class="col-h col-actions"></span>
      </div>
    {/if}
    </div>

    <div class="feed-body-scroll">
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
            <div
              class="card row-grid"
              role="button"
              tabindex="0"
              onclick={(e) => onCardRowClick(card, e)}
              onkeydown={(e) => onCardRowKeydown(card, e)}
            >
              <div class="cell-title">
                <div class="title-block" title={card.ref}>
                  <span class="title-text">{card.displayLabel}</span>
                  {#if card.weight !== 0}
                    <span class="card-weight" title="权重">★{card.weight}</span>
                  {/if}
                </div>
              </div>
              <div class="cell-desc" title={card.description ?? ''}>{card.description?.trim() ? card.description : '—'}</div>
              <div class="cell-parse">
                <span class="parse-mode" title={parseModeTitle(card.parseHint)}>{parseModeLabel(card.parseHint)}</span>
              </div>
              <div class="cell-latest tabular">{formatLatestShort(card.latestAt)}</div>
              <div class="cell-count tabular">{card.count}</div>
              <div class="cell-actions">
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
                    <Popover.Content class="dropdown-panel more-menu" sideOffset={6} align="center" onclick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        class="more-menu-item"
                        class:pulling={card.ref in $refToTaskId}
                        title="强制拉取"
                        disabled={card.ref in $refToTaskId}
                        onclick={(e) => {
                          forcePull(card.ref, e);
                          openMoreRef = null;
                        }}
                      >
                        <RefreshCw size={14} />
                        <span>{card.ref in $refToTaskId ? '拉取中…' : '拉取'}</span>
                      </button>
                      <button
                        type="button"
                        class="more-menu-item"
                        onclick={() => { openEdit(card); openMoreRef = null; }}
                      >
                        <Pencil size={14} />
                        <span>编辑</span>
                      </button>
                      <button
                        type="button"
                        class="more-menu-item"
                        title="复制本服务的 RSS 订阅地址（/rss?ref=…）"
                        onclick={() => copyRssUrl(card.ref)}
                      >
                        <Copy size={14} />
                        <span>复制 RSS 地址</span>
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
                      <button
                        type="button"
                        class="more-menu-item more-menu-item-remove"
                        title="从订阅列表中移除此信源"
                        disabled={removingRef === card.ref}
                        onclick={() => removeSourceByRef(card.ref)}
                      >
                        <Trash2 size={14} />
                        <span>{removingRef === card.ref ? '移除中…' : '移除信源'}</span>
                      </button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            </div>
          {/each}
      </div>
    {/if}
    </div>
  </div>
</div>

<style>
  /**
   * 与 `main` 的 padding-top 对消，把那段间距放进 `.feed-toolbar-block`，
   * 否则工具条上方会有一段随外层滚动条移走。
   * 外层 `main.main-fill` 不滚动，仅 `.feed-body-scroll` 内滚动，工具条/表头始终固定（无 sticky 跟手）。
   */
  .feed-wrap {
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
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  /* ── 工具条 + 表头：固定在上，不随列表滚动 ── */
  .feed-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
    background: var(--color-background);
  }

  .feed-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .feed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .filter-input {
    flex: 1;
    min-width: 7rem;
    max-width: 18rem;
    width: auto;
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
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
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
    width: 11.5rem;
    min-width: 11.5rem;
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
  /** 菜单最底部「移除信源」：常态即为警示红 */
  .more-menu-item-remove {
    color: var(--color-destructive);
  }
  .more-menu-item-remove :global(svg) {
    color: var(--color-destructive);
  }
  .more-menu-item-remove:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-destructive) 14%, transparent);
    color: var(--color-destructive);
  }
  .more-menu-item.pulling :global(svg) {
    animation: spin 0.8s linear infinite;
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

  /* ── list：表头 + 单行六列；纵向滚动由外层 layout-inner 承担，避免列表内出现第二条滚动条 ── */
  .list {
    min-width: min(100%, 580px);
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .row-grid {
    display: grid;
    grid-template-columns:
      minmax(0, 1.1fr)
      minmax(0, 1.2fr)
      minmax(4.5rem, 0.55fr)
      minmax(5.5rem, 0.5fr)
      minmax(2.75rem, 0.35fr)
      auto;
    gap: 0.5rem 0.75rem;
    align-items: center;
    padding: 0.55rem 0;
    box-sizing: border-box;
  }

  .list-head {
    border-bottom: 1px solid var(--color-border);
    padding-top: 0.15rem;
    padding-bottom: 0.45rem;
  }
  .col-h {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-muted-foreground-soft);
    white-space: nowrap;
  }
  .col-h.col-actions {
    width: auto;
    min-width: 2.75rem;
  }

  .card {
    border-bottom: 1px solid var(--color-border);
    transition: background 0.15s;
    cursor: pointer;
  }
  .card:hover {
    background: var(--color-muted);
  }
  .card:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
    outline-offset: -1px;
  }
  .card:last-child {
    border-bottom: none;
  }

  .cell-title {
    min-width: 0;
  }
  .title-block {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    max-width: 100%;
    color: inherit;
  }
  .title-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .card-weight {
    font-size: 0.65rem;
    color: #fbbf24;
    font-weight: 500;
    flex-shrink: 0;
  }
  .cell-desc {
    font-size: 0.78rem;
    color: var(--color-muted-foreground);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .cell-parse {
    min-width: 0;
  }
  .parse-mode {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-muted-foreground-strong);
    white-space: nowrap;
  }

  .cell-latest,
  .cell-count {
    font-size: 0.78rem;
    color: var(--color-muted-foreground-strong);
    min-width: 0;
  }
  .tabular {
    font-variant-numeric: tabular-nums;
  }

  .cell-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
    border-bottom: 1px solid var(--color-border-muted);
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
  .parse-hints {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
  }
  .parse-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.45rem;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--color-muted-foreground-soft);
    border-radius: 5px;
    border: 1px solid transparent;
    background: transparent;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .parse-hint.active {
    color: var(--color-primary);
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
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
    border-top: 1px solid var(--color-border-muted);
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
