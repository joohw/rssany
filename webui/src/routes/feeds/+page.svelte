<script lang="ts">
  /// <reference path="../../lucide-svelte.d.ts" />
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto, beforeNavigate } from '$app/navigation';
  import { Popover } from 'bits-ui';
  import Search from 'lucide-svelte/icons/search';
  import Tag from 'lucide-svelte/icons/tag';
  import FeedCard from '$lib/components/ui/FeedCard.svelte';
  import TagsOverlay from '$lib/components/ui/TagsOverlay.svelte';

  interface FeedItem {
    guid?: string;
    title?: string;
    link: string;
    summary?: string;
    author?: string;
    /** 作者列表，用于多作者分别点击筛选 */
    authors?: string[];
    pubDate?: string;
    _source?: string;
    _sourceRef?: string;
  }

  const PAGE_SIZE = 200;
  /** 聚合后若卡片数少于此值且还有更多数据，自动加载更多页，避免单源条目过多时首页只显示一条 */
  const MIN_CARDS_AUTO_LOAD = 8;
  const MAX_AUTO_LOAD_PAGES = 5;
  let autoLoadCount = 0;

  function extractSource(url: string): string {
    try {
      return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /** 从当前 URL 解析的筛选参数；days=1 表示今日，days=N 表示最近 N 天；默认 3 天 */
  let filters: { channel?: string; ref?: string; author?: string; search?: string; tags?: string; days?: number } = {};
  let items: FeedItem[] = [];
  let currentOffset = 0;
  let hasMore = false;
  let total = 0;
  let loading = false;
  let loadingMore = false;
  let loadError = '';
  let listEl: HTMLElement | null = null;
  let showBackTop = false;

  let abortController: AbortController | null = null;

  /** RSS 地址（带查询参数） */
  $: rssUrl = (() => {
    const p = new URLSearchParams();
    if (filters.channel) p.set('channel', filters.channel);
    if (filters.ref) p.set('ref', filters.ref);
    if (filters.author) p.set('author', filters.author);
    if (filters.search) p.set('search', filters.search);
    if (filters.tags) p.set('tags', filters.tags);
    if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
    const qs = p.toString();
    return qs ? location.origin + '/rss?' + qs : '';
  })();

  $: hasFilters = !!(filters.channel || filters.ref || filters.author || filters.search || filters.tags);

  let channels: { id: string; title: string }[] = [];

  /** 始终预加载频道列表（用于混合筛选） */
  $: if (channels.length === 0 && typeof window !== 'undefined') {
    fetch('/api/channels').then((r) => r.json()).then((list: { id: string; title?: string }[]) => {
      channels = Array.isArray(list) ? list.map((s) => ({ id: s.id, title: s.title || s.id })) : [];
    });
  }

  function selectDays(days: number | undefined) {
    const ch = filters.channel || 'all';
    goto(feedsHref(ch, days), { replaceState: false });
  }

  const DAYS_OPTIONS = [
    { value: 1, label: '只看今日' },
    ...Array.from({ length: 6 }, (_, i) => ({ value: i + 2, label: `近${i + 2}天` })),
    { value: 0, label: '全部' },
  ];

  $: daysLabel = (filters.days === undefined || filters.days === 0) ? '全部' : filters.days === 1 ? '今日' : `近${filters.days}天`;

  function apiUrl(offset: number): string {
    const p = new URLSearchParams();
    if (filters.channel) p.set('channel', filters.channel);
    if (filters.ref) p.set('ref', filters.ref);
    if (filters.author) p.set('author', filters.author);
    if (filters.search) p.set('q', filters.search);
    if (filters.tags) p.set('tags', filters.tags);
    if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(offset));
    return '/api/items?' + p.toString();
  }

  /** 切换频道链接，保留其他筛选参数以支持混合筛选；overrides 可覆盖 ref/author/tags */
  function feedsHref(ch: string, withDays?: number, overrides?: { ref?: string; author?: string; tags?: string }): string {
    const p = new URLSearchParams();
    p.set('channel', ch);
    const refVal = overrides?.ref ?? filters.ref;
    const author = overrides?.author ?? filters.author;
    const tagsVal = overrides?.tags ?? filters.tags;
    if (refVal) p.set('ref', refVal);
    if (author) p.set('author', author);
    if (filters.search) p.set('search', filters.search);
    if (tagsVal) p.set('tags', tagsVal);
    const daysVal = withDays ?? filters.days;
    if (daysVal !== undefined && daysVal !== null) p.set('days', String(daysVal));
    return '/feeds?' + p.toString();
  }

  let showTagsOverlay = false;
  let showDaysDialog = false;
  let showSearchDialog = false;
  let searchInput = '';
  let searchInputEl: HTMLInputElement | null = null;

  function onTagSelect(tag: string) {
    goto(feedsHref(filters.channel || 'all', undefined, { tags: tag }), { replaceState: false });
  }

  function submitSearch() {
    const q = searchInput?.trim() ?? '';
    const p = new URLSearchParams();
    p.set('channel', filters.channel || 'all');
    if (filters.ref) p.set('ref', filters.ref);
    if (filters.author) p.set('author', filters.author);
    if (filters.tags) p.set('tags', filters.tags);
    if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
    if (q) p.set('search', q);
    showSearchDialog = false;
    goto('/feeds?' + p.toString(), { replaceState: false });
  }

  $: if (showSearchDialog) {
    setTimeout(() => searchInputEl?.focus(), 0);
  }

  /** 移除指定筛选后的 URL（用于取消筛选） */
  function clearFilterHref(omit: 'ref' | 'author' | 'search' | 'tags'): string {
    const p = new URLSearchParams();
    p.set('channel', filters.channel || 'all');
    if (omit !== 'ref' && filters.ref) p.set('ref', filters.ref);
    if (omit !== 'author' && filters.author) p.set('author', filters.author);
    if (omit !== 'search' && filters.search) p.set('search', filters.search);
    if (omit !== 'tags' && filters.tags) p.set('tags', filters.tags);
    if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
    return '/feeds?' + p.toString();
  }

  /** 按同一天同一 ref 聚合，主项取列表顺序第一条（最新），其余为 siblings。纯前端逻辑，后端只返回扁平条目列表，收起/展开由 FeedCard 控制 */
  function groupItemsByDateAndRef(items: FeedItem[]): { primary: FeedItem; siblings: FeedItem[] }[] {
    const map = new Map<string, FeedItem[]>();
    for (const item of items) {
      const ref = item._sourceRef ?? (item.guid ?? item.link);
      const dateStr = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-CA') : '';
      const key = `${dateStr}\0${ref}`;
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    const seen = new Set<string>();
    const result: { primary: FeedItem; siblings: FeedItem[] }[] = [];
    for (const item of items) {
      const ref = item._sourceRef ?? (item.guid ?? item.link);
      const dateStr = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-CA') : '';
      const key = `${dateStr}\0${ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const arr = map.get(key)!;
      const [primary, ...siblings] = arr;
      result.push({ primary, siblings });
    }
    return result;
  }

  $: groupedItems = groupItemsByDateAndRef(items);

  function mapDbItems(raw: unknown): FeedItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry): FeedItem | null => {
        if (!entry || typeof entry !== 'object') return null;
        const item = entry as Record<string, unknown>;
        const link = typeof item.url === 'string' ? item.url.trim() : '';
        if (!link) return null;
        const sourceUrl = typeof item.source_url === 'string' ? item.source_url : undefined;
        const authorStr = Array.isArray(item.author) ? item.author.join(', ') : (typeof item.author === 'string' ? item.author : undefined);
        const authorArr = Array.isArray(item.author)
          ? item.author.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
          : typeof item.author === 'string'
            ? item.author.split(/,\s*|，/).map((s) => s.trim()).filter((s): s is string => s.length > 0)
            : undefined;
        return {
          guid: typeof item.id === 'string' ? item.id : undefined,
          title: typeof item.title === 'string' && item.title.trim() ? item.title : '(无标题)',
          link,
          summary: typeof item.summary === 'string' ? item.summary : undefined,
          author: authorStr,
          authors: authorArr?.length ? authorArr : undefined,
          pubDate: typeof item.pub_date === 'string' ? item.pub_date : undefined,
          _source: sourceUrl ? extractSource(sourceUrl) : undefined,
          _sourceRef: sourceUrl,
        };
      })
      .filter((item): item is FeedItem => item != null);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    try {
      const res = await fetch(apiUrl(currentOffset));
      const data = await res.json();
      const newItems = mapDbItems(data.items);
      items = [...items, ...newItems];
      hasMore = !!data.hasMore;
      total = data.total ?? total;
      currentOffset += newItems.length;
    } catch { /* 静默失败，用户可再次滚动触发 */ } finally {
      loadingMore = false;
      queueMicrotask(() => maybeAutoLoadMore());
    }
  }

  /** 聚合后卡片过少且还有更多数据时自动再拉一页，避免单源刷屏只显示一条 */
  function maybeAutoLoadMore() {
    if (loading || loadingMore || !hasMore || autoLoadCount >= MAX_AUTO_LOAD_PAGES) return;
    const cards = groupItemsByDateAndRef(items).length;
    if (cards >= MIN_CARDS_AUTO_LOAD) return;
    autoLoadCount += 1;
    loadMore();
  }

  function onListScroll() {
    showBackTop = (listEl?.scrollTop ?? 0) > 400;
  }

  function scrollToTop() {
    listEl?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('确定删除此条目？')) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || '删除失败');
        return;
      }
      items = items.filter((it) => (it.guid || it.link) !== id);
      total = Math.max(0, total - 1);
    } catch (e) {
      alert('删除失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function sentinelObserver(node: HTMLElement) {
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
      },
      { root: listEl, rootMargin: '0px 0px 300px 0px' }
    );
    obs.observe(node);
    return { destroy() { obs.disconnect(); } };
  }

  function abortLoad() {
    if (abortController) { abortController.abort(); abortController = null; }
  }

  async function load(manual = false) {
    abortLoad();
    if (manual) {
      loading = true;
      loadError = '';
      items = [];
      currentOffset = 0;
      hasMore = false;
      total = 0;
      autoLoadCount = 0;
    }
    const controller = new AbortController();
    abortController = controller;
    try {
      const resp = await fetch(apiUrl(0), { signal: controller.signal });
      const data = await resp.json();
      if (!resp.ok) {
        loadError = data.error || `请求失败 HTTP ${resp.status}`;
        return;
      }
      items = mapDbItems(data.items);
      hasMore = !!data.hasMore;
      total = data.total ?? items.length;
      currentOffset = items.length;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      loadError = '请求失败: ' + (e instanceof Error ? e.message : String(e));
    } finally {
      if (abortController === controller) { abortController = null; loading = false; }
      queueMicrotask(() => maybeAutoLoadMore());
    }
  }

  beforeNavigate(() => { abortLoad(); });
  onDestroy(() => { abortLoad(); });

  /** URL 变化时重新解析参数并加载（仅依赖 $page，避免与 filters 循环依赖） */
  $: pageUrl = $page.url;
  $: if (typeof window !== 'undefined' && pageUrl) {
    const params = pageUrl.searchParams;
    const daysVal = params.get('days');
    const next = {
      channel: params.get('channel') || undefined,
      ref: params.get('ref') || undefined,
      author: params.get('author') || undefined,
      search: params.get('search') || params.get('q') || undefined,
      tags: params.get('tags') || undefined,
      days: daysVal === null || daysVal === '' ? 3 : Number(daysVal) === 0 ? 0 : Math.max(1, Math.min(365, Number(daysVal) || 1)),
    };
    const hasAny = !!(next.channel || next.ref || next.author || next.search || next.tags || next.days !== undefined);
    const changed =
      filters.channel !== next.channel ||
      filters.ref !== next.ref ||
      filters.author !== next.author ||
      filters.search !== next.search ||
      filters.tags !== next.tags ||
      filters.days !== next.days;
    filters = next;
    if (changed && hasAny) {
      const parts: string[] = [];
      if (next.channel) parts.push('频道: ' + (next.channel === 'all' ? '全部' : next.channel));
      if (next.ref) parts.push('订阅: ' + next.ref);
      if (next.author) parts.push('作者: ' + next.author);
      if (next.search) parts.push('搜索: ' + next.search);
      if (next.tags) parts.push('标签: ' + next.tags);
      if (next.days !== undefined) parts.push(next.days === 0 ? '全部' : next.days === 1 ? '今日' : `近${next.days}天`);
      document.title = 'Feeds – ' + parts.join(' · ');
      load(true);
    }
  }

</script>

<svelte:head>
  <title>Feeds - RssAny</title>
</svelte:head>


<div class="feed-wrap">
  <div class="feed-col">
    {#if filters.channel || channels.length > 0 || filters.ref || filters.author || filters.search || filters.tags}
      <div class="feed-filter-bar">
        <div class="filter-bar-row">
          <div class="filter-bar-left">
            {#if filters.ref}
              <a class="ref-instead-of-channel" href={clearFilterHref('ref')} title={filters.ref}>
                <span class="ref-value">{filters.ref}</span>
                <span class="filter-tag-x">×</span>
              </a>
            {:else if channels.length > 0}
              <div class="channel-buttons">
                <a class="channel-btn" class:active={filters.channel === 'all' || !filters.channel} href={feedsHref('all', filters.days)}>全部</a>
                {#each channels as ch}
                  <a class="channel-btn" class:active={ch.id === filters.channel} href={feedsHref(ch.id, filters.days)}>{ch.title}</a>
                {/each}
              </div>
            {/if}
          </div>
          <div class="filter-bar-right">
            <Popover.Root bind:open={showSearchDialog} onOpenChange={(v) => { showSearchDialog = v; if (v) searchInput = filters.search ?? ''; }}>
              <Popover.Trigger class="filter-icon-btn" title="搜索" aria-label="搜索">
                <Search size={16} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="dropdown-panel search-panel" sideOffset={4} align="end">
                  <form class="search-form" on:submit|preventDefault={submitSearch}>
                    <input
                      type="search"
                      class="search-input"
                      placeholder="输入关键词搜索标题/摘要/正文…"
                      bind:value={searchInput}
                      bind:this={searchInputEl}
                      on:keydown={(e) => e.key === 'Escape' && (showSearchDialog = false)}
                    />
                    <button type="submit" class="search-submit">搜索</button>
                  </form>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <button
              type="button"
              class="filter-icon-btn"
              title="标签"
              aria-label="标签"
              on:click={() => (showTagsOverlay = true)}
            >
              <Tag size={16} aria-hidden="true" />
            </button>
            <Popover.Root bind:open={showDaysDialog} onOpenChange={(v) => (showDaysDialog = v)}>
              <Popover.Trigger class="filter-tag-btn">{daysLabel} ▾</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="dropdown-panel" sideOffset={4} align="end">
                  <div class="days-options">
                    {#each DAYS_OPTIONS as opt}
                      <button
                        type="button"
                        class="days-option"
                        class:active={filters.days === opt.value}
                        on:click={() => { selectDays(opt.value); showDaysDialog = false; }}
                      >
                        {opt.label}
                      </button>
                    {/each}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
        {#if filters.author || filters.search || filters.tags}
          <div class="filter-tags-row">
            <div class="filter-tags">
              {#if filters.author}
                <a class="filter-tag" href={clearFilterHref('author')} title="取消作者筛选">
                  <span>作者: {filters.author}</span>
                  <span class="filter-tag-x">×</span>
                </a>
              {/if}
              {#if filters.search}
                <a class="filter-tag" href={clearFilterHref('search')} title="取消搜索筛选">
                  <span>搜索: {filters.search}</span>
                  <span class="filter-tag-x">×</span>
                </a>
              {/if}
              {#if filters.tags}
                <a class="filter-tag" href={clearFilterHref('tags')} title="取消标签筛选">
                  <span>标签: {filters.tags}</span>
                  <span class="filter-tag-x">×</span>
                </a>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="feed-list" bind:this={listEl} on:scroll={onListScroll}>
      {#if !hasFilters}
        <div class="state">请提供筛选参数，例如：?ref=https://… 或 ?author=张三 或 ?search=AI 或 ?tags=科技</div>
      {:else if loading && items.length === 0}
        <div class="state">加载中…</div>
      {:else if loadError && items.length === 0}
        <div class="state">{loadError}</div>
      {:else if items.length === 0}
        <div class="state">暂无匹配条目<br><span style="font-size:0.8em;color:#ccc">可尝试其他筛选条件</span></div>
      {:else}
        {#each groupedItems as group, idx ((group.primary.guid || group.primary.link || String(idx)) + ':' + idx)}
          <FeedCard
            title={group.primary.title ?? ''}
            link={group.primary.link}
            summary={group.primary.summary}
            author={group.primary.author}
            pubDate={group.primary.pubDate}
            source={group.primary._sourceRef ?? group.primary._source ?? (filters.ref ?? undefined)}
            sourceHref={group.primary._sourceRef ? feedsHref(filters.channel || 'all', undefined, { ref: group.primary._sourceRef }) : (filters.ref ? feedsHref(filters.channel || 'all', undefined, { ref: filters.ref }) : undefined)}
            authors={group.primary.authors?.map((a) => ({ name: a, href: feedsHref(filters.channel || 'all', undefined, { author: a }) }))}
            guid={group.primary.guid}
            onDelete={handleDeleteItem}
            siblings={group.siblings.map((s) => ({ title: s.title ?? '', link: s.link }))}
          />
        {/each}
        {#if hasMore}
          <div use:sentinelObserver></div>
        {/if}
        {#if loadingMore}
          <div class="load-more-state">加载更多…</div>
        {:else if !hasMore && items.length > 0}
          <div class="load-more-state">已加载全部 {total} 条</div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<TagsOverlay
  open={showTagsOverlay}
  onClose={() => (showTagsOverlay = false)}
  onSelect={onTagSelect}
/>

{#if hasFilters || showBackTop}
  <div class="fab-group">
    {#if showBackTop}
      <button class="fab fab-back" on:click={scrollToTop} aria-label="回到顶部">↑</button>
    {/if}
    {#if hasFilters}
      <a class="fab fab-rss" href={rssUrl} target="_blank" rel="noopener" title="RSS 订阅">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="18" r="3"/><path d="M4 6a16 16 0 0 1 16 16"/><path d="M4 11a11 11 0 0 1 11 11"/>
        </svg>
      </a>
    {/if}
  </div>
{/if}

<style>
  .feed-wrap {
    height: 100vh;
    display: flex;
    overflow: hidden;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
  }
  .feed-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
  }

  .feed-filter-bar {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem;
    border-bottom: 1px solid #f0f0f0;
    flex-shrink: 0;
  }
  .filter-bar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1rem;
  }
  .filter-bar-left {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    min-width: 0;
  }
  .channel-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .filter-tags-row {
    display: flex;
    align-items: center;
    min-height: 1.5rem;
  }
  .channel-btn {
    padding: 0.35rem 0.65rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: transparent;
    border-radius: 6px;
    text-decoration: none;
    transition: color 0.15s;
  }
  .channel-btn:hover {
    color: var(--color-accent-foreground);
  }
  .channel-btn.active {
    color: var(--color-primary);
    font-weight: 500;
  }
  .ref-instead-of-channel {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-primary);
    background: transparent;
    border-radius: 6px;
    text-decoration: none;
    transition: color 0.15s;
    width: max-content;
    max-width: 100%;
  }
  .ref-instead-of-channel:hover {
    color: var(--color-primary-hover, var(--color-primary));
  }
  .ref-instead-of-channel .ref-value {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-muted-foreground-strong);
  }
  .ref-instead-of-channel .filter-tag-x {
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
  }
  .filter-bar-right {
    display: flex;
    align-items: center;
    gap: 0.6rem 1rem;
    flex-shrink: 0;
  }
  :global(.filter-icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    margin: 0;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  :global(.filter-icon-btn:focus) {
    outline: none;
  }
  :global(.filter-icon-btn:focus-visible) {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  :global(.search-panel) {
    min-width: 280px;
    padding: 0.75rem;
  }
  .search-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0.4rem 0.65rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input:focus {
    border-color: var(--color-primary);
  }
  .search-submit {
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-primary-foreground, #fff);
    background: var(--color-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .search-submit:hover {
    opacity: 0.9;
  }
  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .filter-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: #555;
    background: transparent;
    border-radius: 4px;
    text-decoration: none;
    transition: color 0.15s;
  }
  .filter-tag:hover {
    color: #333;
  }
  .filter-tag-x {
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
  }
  :global(.filter-tag-btn) {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    transition: color 0.15s;
  }
  :global(.filter-tag-btn:hover) {
    color: var(--color-accent-foreground);
  }
  :global(.dropdown-panel) {
    z-index: 50;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    overflow: auto;
    max-height: min(70vh, 320px);
  }
  .days-options {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem;
    min-width: 7rem;
  }
  .days-option {
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
  .days-option:hover {
    color: var(--color-accent-foreground);
  }
  .days-option.active {
    color: var(--color-primary);
    font-weight: 500;
  }

  .feed-list { flex: 1; overflow-y: auto; }
  .feed-list::-webkit-scrollbar { width: 4px; }
  .feed-list::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

  .state {
    padding: 3rem 1.5rem;
    text-align: center;
    color: #aaa;
    font-size: 0.875rem;
    line-height: 1.7;
  }
  .load-more-state {
    padding: 1.25rem;
    text-align: center;
    color: #ccc;
    font-size: 0.8rem;
  }

  .fab-group {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 50;
  }
  .fab {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    text-decoration: none;
    font-size: 1rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    transition: background 0.15s, color 0.15s;
  }
  .fab-rss {
    background: #fff;
    color: #555;
    border: 1px solid #e0e0e0;
  }
  .fab-rss:hover { color: #111; border-color: #aaa; }
  .fab-back {
    background: var(--color-primary);
    color: #fff;
    border: none;
  }
  .fab-back:hover { background: var(--color-primary-hover); }

  @media (max-width: 600px) {
    .feed-wrap { max-width: 100%; }
    .feed-col { border: none; }
  }
</style>
