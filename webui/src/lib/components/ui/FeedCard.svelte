<script lang="ts">
  import { getAvatarBySourceRef } from '$lib/sourceAvatar';

  interface Props {
    title?: string;
    link?: string;
    summary?: string | undefined;
    /** 正文（多为 HTML），与 summary 合并为摘要区展示时去标签截断 */
    content?: string | undefined;
    author?: string | undefined;
    pubDate?: string | undefined;
    sourceRef?: string | undefined;
    sourceHref?: string | undefined;
    authorHref?: string | undefined;
    authors?: { name: string; href: string }[] | undefined;
    guid?: string | undefined;
    /** http(s)、data URL 或裸 base64 规范化后的地址；有则显示在卡片右侧方图 */
    coverImg?: string | undefined;
    onDelete?: ((id: string) => void) | undefined;
  }

  let {
    title = '',
    link = '',
    summary = undefined,
    content = undefined,
    author = undefined,
    pubDate = undefined,
    sourceRef = undefined,
    sourceHref = undefined,
    authorHref = undefined,
    authors = undefined,
    guid = undefined,
    coverImg = undefined,
    onDelete = undefined,
  }: Props = $props();

  let ctxMenu = $state({ show: false, x: 0, y: 0 });
  let faviconLoadFailed = $state(false);

  function stripHtml(s: string): string {
    return s
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatPublishTime(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diffMs = now - d.getTime();
    const dateLabel = d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (diffMs < 0) return dateLabel;

    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);

    if (days >= 7) return dateLabel;
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return 'just now';
  }

  $effect(() => {
    void link;
    void sourceRef;
    faviconLoadFailed = false;
  });

  const avatar = $derived.by(() =>
    getAvatarBySourceRef({
      link: link || '',
      sourceRef,
      author,
      authors,
      guid,
      title,
    }),
  );
  const siteHost = $derived(avatar.siteHost);
  const faviconSrc = $derived(avatar.faviconSrc);
  const showFavicon = $derived(!!(faviconSrc && !faviconLoadFailed));
  const letter = $derived(avatar.letter);
  const avatarBg = $derived(avatar.avatarBg);
  const bodyRaw = $derived((content?.trim() || summary?.trim() || '').trim());
  const summaryDisplay = $derived(bodyRaw ? stripHtml(bodyRaw) : '');
  const hasTitle = $derived(!!title?.trim());
  const summaryIsLink = $derived(!!(link && !hasTitle && summaryDisplay));

  function handleContextMenu(e: MouseEvent) {
    if (!guid || !onDelete) return;
    e.preventDefault();
    ctxMenu = { show: true, x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    ctxMenu = { ...ctxMenu, show: false };
  }

  function doDelete() {
    if (guid && onDelete) {
      onDelete(guid);
      closeContextMenu();
    }
  }
</script>

<div
  class="feed-card"
  class:ctx-deletable={!!guid && !!onDelete}
  oncontextmenu={handleContextMenu}
  role="article"
>
  <!-- 左侧：站点 favicon → 失败则域名首字母 → 再作者 -->
  <div class="feed-card-aside">
    {#if sourceHref}
      <a
        class="feed-card-icon"
        class:feed-card-icon--favicon={showFavicon}
        style:background-color={showFavicon ? 'var(--color-muted)' : avatarBg}
        style:color="#fff"
        href={sourceHref}
        title={sourceRef || siteHost || '筛选该来源'}
        data-sveltekit-preload-data="hover"
      >
        {#if showFavicon}
          <img
            src={faviconSrc}
            alt=""
            class="feed-card-favicon"
            width="26"
            height="26"
            loading="lazy"
            decoding="async"
            onerror={() => (faviconLoadFailed = true)}
          />
        {:else}
          <span class="feed-card-icon-letter" aria-hidden="true">{letter}</span>
        {/if}
      </a>
    {:else}
      <div
        class="feed-card-icon"
        class:feed-card-icon--favicon={showFavicon}
        style:background-color={showFavicon ? 'var(--color-muted)' : avatarBg}
        style:color="#fff"
        title={sourceRef || siteHost || '来源'}
        role="img"
        aria-label={sourceRef || siteHost || '来源'}
      >
        {#if showFavicon}
          <img
            src={faviconSrc}
            alt=""
            class="feed-card-favicon"
            width="26"
            height="26"
            loading="lazy"
            decoding="async"
            onerror={() => (faviconLoadFailed = true)}
          />
        {:else}
          <span class="feed-card-icon-letter" aria-hidden="true">{letter}</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 右侧：作者+日期 → 标题 → 摘要 -->
  <div class="feed-card-main">
    <div class="feed-card-author-line">
      <span class="feed-card-author">
        {#if authors && authors.length > 0}
          {#each authors as a, i}
            <a class="feed-card-author-link" href={a.href}>{a.name}</a>{#if i < authors.length - 1}<span class="feed-card-author-sep">、</span>{/if}
          {/each}
        {:else if author}
          {#if authorHref}
            <a class="feed-card-author-link" href={authorHref}>{author}</a>
          {:else}
            <span class="feed-card-author-plain">{author}</span>
          {/if}
        {:else}
          <span class="feed-card-author-empty">未署名</span>
        {/if}
      </span>
      {#if pubDate}
        <time class="feed-card-time" datetime={pubDate} title={pubDate}>{formatPublishTime(pubDate)}</time>
      {/if}
    </div>

    {#if hasTitle}
      <div class="feed-card-title-row">
        {#if link}
          <a class="feed-card-title" href={link} target="_blank" rel="noopener noreferrer">{title}</a>
        {:else}
          <span class="feed-card-title feed-card-title-text">{title}</span>
        {/if}
      </div>
    {/if}

    {#if summaryDisplay}
      {#if summaryIsLink}
        <a
          class="feed-card-summary-link"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          title="打开原文"
        >
          <p class="feed-card-summary">{summaryDisplay}</p>
        </a>
      {:else}
        <p class="feed-card-summary">{summaryDisplay}</p>
      {/if}
    {:else if link && !hasTitle}
      <a class="feed-card-open-original" href={link} target="_blank" rel="noopener noreferrer">查看原文</a>
    {/if}

    {#if coverImg}
      <div class="feed-card-media">
        {#if link}
          <a
            class="feed-card-media-anchor"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title="打开原文"
          >
            <img src={coverImg} alt="" class="feed-card-media-img" loading="lazy" decoding="async" />
          </a>
        {:else}
          <img src={coverImg} alt="" class="feed-card-media-img" loading="lazy" decoding="async" />
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if ctxMenu.show && guid && onDelete}
  <div class="ctx-menu-backdrop" onclick={closeContextMenu} role="presentation">
    <div
      class="ctx-menu"
      style:left={`${ctxMenu.x}px`}
      style:top={`${ctxMenu.y}px`}
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <button class="ctx-menu-item ctx-delete" type="button" onclick={doDelete}>删除</button>
    </div>
  </div>
{/if}

<style>
  .feed-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem 1.25rem 1.1rem;
    transition: background 0.1s;
    min-width: 0;
  }
  .feed-card:hover {
    background: var(--color-muted);
  }
  .feed-card.ctx-deletable {
    cursor: context-menu;
  }

  .feed-card-aside {
    flex-shrink: 0;
  }

  .feed-card-icon {
    width: 1.625rem;
    height: 1.625rem;
    /* 主题里 --radius-md 可能为 0，此处单独给头像倒角 */
    border-radius: 0.375rem;
    border: none;
    /* 背景与字色由脚本内联（随机色相、同色系） */
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    box-sizing: border-box;
  }
  a.feed-card-icon:hover {
    opacity: 0.92;
  }

  .feed-card-icon--favicon {
    padding: 0.125rem;
    box-sizing: border-box;
  }

  .feed-card-favicon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    border-radius: inherit;
  }

  .feed-card-icon-letter {
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    color: inherit;
    user-select: none;
  }

  .feed-card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  /** 作者与日期同一行，日期在作者旁（非最右对齐整行） */
  .feed-card-author-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem 0.5rem;
    min-width: 0;
  }

  .feed-card-author {
    flex: 0 1 auto;
    max-width: 100%;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .feed-card-author-link {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
  }
  .feed-card-author-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .feed-card-author-plain {
    font-weight: 500;
    color: inherit;
  }
  .feed-card-author-sep {
    color: var(--color-muted-foreground-soft);
    font-weight: normal;
    pointer-events: none;
  }
  .feed-card-author-empty {
    color: var(--color-muted-foreground-soft);
    font-weight: normal;
  }

  .feed-card-title-row {
    min-width: 0;
  }

  .feed-card-title {
    display: block;
    min-width: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.45;
    color: var(--color-foreground);
    text-decoration: none;
  }
  a.feed-card-title:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .feed-card-title-text {
    cursor: default;
  }

  .feed-card-time {
    flex-shrink: 0;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--color-muted-foreground-soft);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .feed-card-summary-link {
    display: block;
    min-width: 0;
    margin: 0;
    text-decoration: none;
    color: inherit;
    border-radius: 0.25rem;
    outline-offset: 2px;
  }
  .feed-card-summary-link:hover .feed-card-summary {
    color: var(--color-primary);
  }

  .feed-card-summary {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-muted-foreground-strong);
    display: -webkit-box;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .feed-card-open-original {
    font-size: 0.8125rem;
    color: var(--color-primary);
    text-decoration: none;
    align-self: flex-start;
  }
  .feed-card-open-original:hover {
    text-decoration: underline;
  }

  /** 条目配图：高度不超过 300px，宽度随比例、不超出主栏 */
  .feed-card-media {
    margin-top: 0.5rem;
    max-width: 100%;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
    overflow: hidden;
    background: var(--color-muted);
    align-self: flex-start;
  }
  .feed-card-media-anchor {
    display: block;
    line-height: 0;
  }
  .feed-card-media-img {
    display: block;
    max-height: 300px;
    width: auto;
    max-width: 100%;
    height: auto;
    object-fit: contain;
  }

  .ctx-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }
  .ctx-menu {
    position: fixed;
    z-index: 9999;
    min-width: 100px;
    padding: 0.25rem 0;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 0);
    box-shadow: var(--shadow-panel);
  }
  .ctx-menu-item {
    display: block;
    width: 100%;
    padding: 0.4rem 1rem;
    font-size: 0.875rem;
    text-align: left;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-foreground);
    font-family: inherit;
  }
  .ctx-menu-item:hover {
    background: var(--color-muted);
  }
  .ctx-menu-item.ctx-delete:hover {
    background: color-mix(in srgb, var(--color-destructive) 14%, transparent);
    color: var(--color-destructive);
  }
</style>
