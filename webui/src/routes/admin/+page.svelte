<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount, onDestroy } from 'svelte';
  import { adminFetch } from '$lib/adminAuth';

  interface GroupStats {
    running: number;
    queued: number;
    concurrency: number;
    scheduledCount: number;
    completedCount?: number;
    /** 0=执行中, -1=无定时, 其他=下次时间戳 */
    nextRunTime?: number;
  }

  function formatNextRun(nextRunTime: number | undefined): string {
    if (nextRunTime === undefined) return '';
    if (nextRunTime === 0) return '· 正在执行';
    if (nextRunTime === -1) return '· 无定时任务';
    const d = new Date(nextRunTime);
    const now = Date.now();
    const diff = nextRunTime - now;
    if (diff <= 0) return '· 即将执行';
    if (diff < 60000) return `· 约 ${Math.round(diff / 1000)} 秒后`;
    if (diff < 3600000) return `· 约 ${Math.round(diff / 60000)} 分钟后`;
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const today = new Date(now);
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
    if (isToday) return `· 下次 ${timeStr}`;
    if (isTomorrow) return `· 下次 明天 ${timeStr}`;
    return `· 下次 ${d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${timeStr}`;
  }

  const groups = [
    {
      title: '管理',
      links: [
        { href: '/admin/tags', label: '标签', desc: '系统标签库，新入库条目由 LLM 自动匹配打标签' },
        { href: '/admin/pipeline', label: 'Pipeline', desc: '入库前处理（打标签、翻译），支持顺序与开关' },
        { href: '/admin/plugins', label: '插件', desc: '已加载插件与登录状态' },
      ],
    },
    {
      title: '集成',
      links: [
        { href: '/admin/deliver', label: '投递', desc: '配置下游 URL；非空时在写库与 Pipeline 后额外 POST 条目' },
      ],
    },
    {
      title: '调试',
      links: [
        { href: '/admin/logs', label: '日志', desc: '系统运行日志' },
        { href: '/admin/parse', label: 'Parse', desc: '从列表页解析条目，返回 JSON' },
        { href: '/admin/extractor', label: 'Enrich', desc: '从详情页提取正文，返回 JSON' },
      ],
    },
  ];

  let schedulerStats: Record<string, GroupStats> = {};
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchSchedulerStats() {
    try {
      const r = await adminFetch('/api/scheduler/stats');
      const text = await r.text();
      schedulerStats = text.trim() ? JSON.parse(text) : {};
    } catch {
      schedulerStats = {};
    }
  }

  onMount(() => {
    fetchSchedulerStats();
    pollTimer = setInterval(fetchSchedulerStats, 2000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  const MAX_SLOTS = 5;
</script>

<svelte:head>
  <title>设置 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="settings-toolbar-block">
      <div class="feed-header">
        <h2>设置</h2>
        <p class="sub">管理入口与调试工具</p>
      </div>
    </div>

    <div class="settings-body-scroll">
      <div class="body">
      {#if Object.keys(schedulerStats).length > 0}
        <section class="scheduler-section">
          <h3 class="section-title">调度任务</h3>
          <div class="scheduler-card">
            {#each Object.entries(schedulerStats) as [groupName, stats]}
              {@const running = stats.running}
              {@const completed = stats.completedCount ?? 0}
              {@const slotCount = Math.min(stats.concurrency, MAX_SLOTS)}
              <div class="scheduler-row">
                <div class="scheduler-left">
                  <span class="scheduler-name">{groupName}</span>
                  <span class="scheduler-meta">
                    执行中 {running}/{stats.concurrency} · 排队 {stats.queued} · 定时 {stats.scheduledCount} · 已完成 {completed}
                    {formatNextRun(stats.nextRunTime)}
                  </span>
                </div>
                <div class="scheduler-slots">
                  {#each Array(slotCount) as _, i}
                    <span class="slot" class:filled={i < running}></span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#each groups as group}
        <section class="links-section">
          <h3 class="section-title">{group.title}</h3>
          <div class="links">
            {#each group.links as link}
              <a class="card" href={link.href}>
                <div class="card-main">
                  <span class="card-label">{link.label}</span>
                  <span class="card-desc">{link.desc}</span>
                </div>
                <span class="card-arrow">›</span>
              </a>
            {/each}
          </div>
        </section>
      {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /**
   * 与首页信源区一致：对消 main padding；标题区固定；仅 `.settings-body-scroll` 内滚动。
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
  .settings-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
    background: var(--color-background);
    border-bottom: 1px solid var(--color-border-muted);
  }
  .feed-header {
    padding: 0;
    flex-shrink: 0;
  }
  .settings-body-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
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
  }

  .body {
    padding: 1rem 0 1.5rem;
    box-sizing: border-box;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.5rem;
  }
  .scheduler-section {
    margin-bottom: 1.25rem;
  }
  .scheduler-card {
    padding: 0;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .scheduler-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }
  .scheduler-row:last-child {
    border-bottom: none;
  }
  .scheduler-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .scheduler-name {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-foreground);
  }
  .scheduler-meta {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
  }
  .scheduler-slots {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .slot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-border);
    transition: background 0.2s;
  }
  .slot.filled {
    background: var(--color-success);
  }

  .links-section {
    margin-bottom: 1.25rem;
  }
  .links-section:last-child {
    margin-bottom: 0.5rem;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
    text-decoration: none;
    transition: background 0.15s;
  }
  .card:last-child {
    border-bottom: none;
  }
  .card:hover {
    background: var(--color-muted);
  }
  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .card-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    line-height: 1.4;
  }
  .card:hover .card-label {
    color: var(--color-primary);
  }
  .card-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    line-height: 1.3;
  }
  .card-arrow {
    font-size: 1rem;
    color: var(--color-muted-foreground);
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
