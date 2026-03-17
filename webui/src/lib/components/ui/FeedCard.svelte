<script lang="ts">
  export let title: string = '';
  export let link: string = '';
  export let summary: string | undefined = undefined;
  export let author: string | undefined = undefined;
  export let pubDate: string | undefined = undefined;
  /** 信源显示文字（订阅 ref 或域名），有值时显示在 meta 行 */
  export let source: string | undefined = undefined;
  /** 信源链接（/feeds?ref=…），有值时 source 可点击进入 feeds 页，上方可复制 RSS 地址 */
  export let sourceHref: string | undefined = undefined;
  /** 作者链接（/feeds?author=…），有值时 author 可点击进入 feeds 页，上方可复制 RSS 地址 */
  export let authorHref: string | undefined = undefined;
  /** 多作者列表，每项可单独点击筛选；有值时优先于 author 显示 */
  export let authors: { name: string; href: string }[] | undefined = undefined;
  /** 条目 id（guid），与 onDelete 同时提供时启用右键删除 */
  export let guid: string | undefined = undefined;
  /** 删除回调，右键菜单选择删除时调用 */
  export let onDelete: ((id: string) => void) | undefined = undefined;
  /** 同组其他条目（同一天同一 ref 的聚合），由前端 groupItemsByDateAndRef 计算；后端只返回扁平列表，与收起/展开无关 */
  export let siblings: { title: string; link: string }[] = [];

  /** 收起时最多展示条数，展开后显示全部；纯前端逻辑，某些来源条目很多时也由前端控制展示 */
  const SIBLINGS_LIMIT = 12;
  let siblingsExpanded = false;

  $: visibleSiblings = siblingsExpanded ? siblings : siblings.slice(0, SIBLINGS_LIMIT);
  $: hasMoreSiblings = siblings.length > SIBLINGS_LIMIT;
  $: hiddenCount = siblings.length - SIBLINGS_LIMIT;

  let ctxMenu = { show: false, x: 0, y: 0 };

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

  function relativeTime(dateStr?: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
</script>

<div
  class="item"
  class:ctx-deletable={!!guid && !!onDelete}
  on:contextmenu={handleContextMenu}
  role="article"
>
  {#if authors && authors.length > 0}
    <div class="item-author-top">
      {#each authors as a, i}
        <a class="item-author-link" href={a.href} title="筛选该作者">{a.name}</a>{#if i < authors.length - 1}<span class="item-author-sep">、</span>{/if}
      {/each}
    </div>
  {:else if author}
    <div class="item-author-top">
      {#if authorHref}
        <a class="item-author-link" href={authorHref} title="筛选该作者">{author}</a>
      {:else}
        {author}
      {/if}
    </div>
  {/if}
  <span class="item-title">{title || '(无标题)'}</span>
  {#if summary}
    <p class="item-summary">{summary}</p>
  {/if}
  {#if siblings && siblings.length > 0}
    <div class="item-siblings">
      {#each visibleSiblings as s}
        <a class="item-sibling-link" href={s.link} target="_blank" rel="noopener">{s.title || '(无标题)'}</a>
      {/each}
      {#if hasMoreSiblings}
        <button
          type="button"
          class="item-siblings-expand"
          on:click={() => (siblingsExpanded = !siblingsExpanded)}
        >
          {siblingsExpanded ? '收起' : `展开 ${hiddenCount} 条`}
        </button>
      {/if}
    </div>
  {/if}
  <div class="item-meta">
    {#if source}
      {#if sourceHref}
        <a class="item-source" href={sourceHref} title={source}>{source}</a>
      {:else}
        <span class="item-source">{source}</span>
      {/if}
      <span class="item-dot"></span>
    {/if}
    <span>{relativeTime(pubDate)}</span>
    <span class="item-dot"></span>
    <a class="item-read-link" href={link} target="_blank" rel="noopener">阅读原文</a>
  </div>
</div>

{#if ctxMenu.show && guid && onDelete}
  <div class="ctx-menu-backdrop" on:click={closeContextMenu} role="presentation">
    <div
      class="ctx-menu"
      style="left: {ctxMenu.x}px; top: {ctxMenu.y}px"
      role="menu"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <button class="ctx-menu-item ctx-delete" on:click={doDelete}>
        删除
      </button>
    </div>
  </div>
{/if}

<style>
  .item {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #f3f3f3;
    transition: background 0.1s;
  }
  .item:hover { background: #fafafa; }
  .item.ctx-deletable { cursor: context-menu; }

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
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
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
    color: #333;
  }
  .ctx-menu-item:hover { background: #f5f5f5; }
  .ctx-menu-item.ctx-delete:hover { background: #fef2f2; color: #b91c1c; }

  .item-author-top {
    font-size: 0.75rem;
    font-weight: 500;
    color: #555;
    margin-bottom: 0.3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-author-link {
    color: inherit;
    text-decoration: none;
  }
  .item-author-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .item-author-sep {
    color: #999;
    font-weight: normal;
    pointer-events: none;
  }

  .item-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: #111;
    display: block;
    line-height: 1.45;
    margin-bottom: 0.3rem;
  }

  .item-summary {
    font-size: 0.8rem;
    color: #666;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 0.4rem;
  }

  .item-siblings {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.4rem;
    padding-top: 0.35rem;
    border-top: 1px dashed #eee;
  }
  .item-sibling-link {
    font-size: 0.8rem;
    color: #888;
    text-decoration: none;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .item-sibling-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .item-siblings-expand {
    margin-top: 0.2rem;
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    color: var(--color-primary);
    background: transparent;
    border: none;
    cursor: pointer;
    align-self: flex-start;
  }
  .item-siblings-expand:hover {
    text-decoration: underline;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.725rem;
    color: #bbb;
  }

  .item-source {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    text-decoration: none;
  }
  a.item-source:hover { color: var(--color-primary); text-decoration: underline; }

  .item-dot {
    width: 2px;
    height: 2px;
    background: #ccc;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .item-read-link {
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .item-read-link:hover { color: var(--color-primary); text-decoration: underline; }
</style>
