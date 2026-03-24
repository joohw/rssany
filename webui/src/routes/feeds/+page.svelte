<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  /// <reference path="../../lucide-svelte.d.ts" />
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto, beforeNavigate } from '$app/navigation';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import FeedCard from '$lib/components/ui/FeedCard.svelte';
  import Loading from '$lib/components/ui/Loading.svelte';
  import { buildFeedsHref, parseFeedsFilters, type FeedsFilters } from '$lib/feedsUrl';

  interface FeedItem {
    guid?: string;
    title?: string;
    link: string;
    summary?: string;
    author?: string;
    // Multiple authors when the API returns a list or comma-separated string
    authors?: string[];
    pubDate?: string;
    _source?: string;
    _sourceRef?: string;
  }

  const PAGE_SIZE = 200;
  // Prefetch extra pages until we have enough cards or hit MAX_AUTO_LOAD_PAGES
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

  let filters: FeedsFilters = {};
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

  // RSS URL with the same query params as the current view (empty if no filters)
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

  function feedsHref(ch: string, withDays?: number, overrides?: { ref?: string; author?: string; tags?: string }) {
    return buildFeedsHref(filters, ch, withDays, overrides);
  }

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

  // Group by calendar date + source ref; extra rows become siblings on FeedCard
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
            ? item.author
                .split(/\s*[,;\uFF0C\u3001|]\s*/u)
                .map((s) => s.trim())
                .filter((s): s is string => s.length > 0)
            : undefined;
        return {
          guid: typeof item.id === 'string' ? item.id : undefined,
          title: typeof item.title === 'string' && item.title.trim() ? item.title : '(no title)',
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
    } catch {
      // Ignore load-more errors (offline, aborted, etc.)
    } finally {
      loadingMore = false;
      queueMicrotask(() => maybeAutoLoadMore());
    }
  }

  // If the list is still short, pull another page until MIN_CARDS or cap
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
    if (!confirm('Delete this item?')) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Could not delete');
        return;
      }
      items = items.filter((it) => (it.guid || it.link) !== id);
      total = Math.max(0, total - 1);
    } catch (e) {
      alert('Request failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function sentinelObserver(node: HTMLElement) {
    const root = document.getElementById('layout-inner-scroll');
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
      },
      { root: root instanceof HTMLElement ? root : null, rootMargin: '0px 0px 300px 0px' }
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
      document.getElementById('layout-inner-scroll')?.scrollTo(0, 0);
    }
    const controller = new AbortController();
    abortController = controller;
    try {
      const resp = await fetch(apiUrl(0), { signal: controller.signal });
      const data = await resp.json();
      if (!resp.ok) {
        loadError = data.error || `Request failed (HTTP ${resp.status})`;
        return;
      }
      items = mapDbItems(data.items);
      hasMore = !!data.hasMore;
      total = data.total ?? items.length;
      currentOffset = items.length;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      loadError = 'Load failed: ' + (e instanceof Error ? e.message : String(e));
    } finally {
      if (abortController === controller) { abortController = null; loading = false; }
      queueMicrotask(() => maybeAutoLoadMore());
    }
  }

  onMount(() => {
    listEl = document.getElementById('layout-inner-scroll');
    listEl?.addEventListener('scroll', onListScroll, { passive: true });
    onListScroll();
    return () => listEl?.removeEventListener('scroll', onListScroll);
  });

  beforeNavigate(() => { abortLoad(); });
  onDestroy(() => { abortLoad(); });

  // Sync filters from the URL; on change, update the tab title and reload the list
  $: pageUrl = $page.url;
  $: if (typeof window !== 'undefined' && pageUrl) {
    const params = pageUrl.searchParams;
    const next = parseFeedsFilters(params);
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
      if (next.channel) parts.push('Channel: ' + (next.channel === 'all' ? 'All' : next.channel));
      if (next.ref) parts.push('Ref: ' + next.ref);
      if (next.author) parts.push('Author: ' + next.author);
      if (next.search) parts.push('Search: ' + next.search);
      if (next.tags) parts.push('Tag: ' + next.tags);
      if (next.days !== undefined) {
        parts.push(
          next.days === 0 ? 'All time' : next.days === 1 ? 'Today' : `Last ${next.days} days`
        );
      }
      document.title = 'Feeds - ' + parts.join(' | ');
      load(true);
    }
  }

</script>

<svelte:head>
  <title>Feeds - {PRODUCT_NAME}</title>
</svelte:head>


<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-list">
      {#if !hasFilters}
        <div class="state">
          Open this page with query params, e.g. <code>?ref=https://...</code>, <code>&amp;author=...</code>,
          <code>&amp;search=AI</code>, or <code>&amp;tags=...</code>.
        </div>
      {:else if loading && items.length === 0}
        <div class="state state-loading">
          <Loading size="lg" />
        </div>
      {:else if loadError && items.length === 0}
        <div class="state">{loadError}</div>
      {:else if items.length === 0}
        <div class="state">
          No items match these filters.<br><span class="state-hint">Try another channel, time range, or search.</span>
        </div>
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
          <div class="load-more-state">
            <Loading size="sm" label="Loading more" />
          </div>
        {:else if !hasMore && items.length > 0}
          <div class="load-more-state">End of list | {total} items</div>
        {/if}
      {/if}
    </div>
  </div>
</div>

{#if hasFilters || showBackTop}
  <div class="fab-group">
    {#if showBackTop}
      <button class="fab fab-back" type="button" on:click={scrollToTop} aria-label="Back to top">
        <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
    {/if}
    {#if hasFilters}
      <a class="fab fab-rss" href={rssUrl} target="_blank" rel="noopener" title="Open RSS feed">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="18" r="3"/><path d="M4 6a16 16 0 0 1 16 16"/><path d="M4 11a11 11 0 0 1 11 11"/>
        </svg>
      </a>
    {/if}
  </div>
{/if}

<style>
  .feed-wrap {
    max-width: var(--feeds-column-max, 720px);
    width: 100%;
    margin: 0 auto;
    padding-bottom: 4rem;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .feed-col {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .feed-list {
    min-width: 0;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .state {
    padding: 3rem 1.5rem;
    text-align: center;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.7;
  }
  .state-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .state-hint {
    font-size: 0.8em;
    color: var(--color-muted-foreground-soft);
  }
  .load-more-state {
    padding: 1.25rem;
    text-align: center;
    color: var(--color-muted-foreground-soft);
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
    box-shadow: var(--shadow-panel);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .fab-rss {
    background: var(--color-card-elevated);
    color: var(--color-muted-foreground-strong);
    border: 1px solid var(--color-border);
  }
  .fab-rss:hover {
    color: var(--color-accent-foreground);
    border-color: var(--color-border);
    background: var(--color-muted);
  }
  .fab-back {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
  }
  .fab-back:hover { background: var(--color-primary-hover); }

  @media (max-width: 600px) {
    .feed-wrap { max-width: 100%; }
  }
</style>
