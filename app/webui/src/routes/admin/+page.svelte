<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';

  const groups = [
    {
      title: '管理',
      links: [
        { href: '/admin/update', label: '自动更新', desc: '定时检查并安装新版本，可配置更新后自动重启' },
        { href: '/admin/tags', label: '标签', desc: '系统标签库，新入库条目由 LLM 自动匹配打标签' },
        { href: '/admin/pipeline', label: 'Pipeline', desc: '入库前处理（打标签、翻译），支持顺序与开关' },
      ],
    },
    {
      title: '集成',
      links: [
        { href: '/admin/llm', label: 'LLM', desc: 'OpenAI 兼容 API（解析、Pipeline、标签与翻译）；可替代 .env 中的 OPENAI_*' },
        { href: '/admin/proxy', label: '代理', desc: '维护代理列表，并选择全局默认代理；信源可从列表中单独选择' },
        {
          href: '/admin/deliver',
          label: '投递',
          desc: '配置下游 URL 与可选 Bearer 令牌；非空 URL 时在写库与 Pipeline 后额外 POST 条目',
        },
      ],
    },
    {
      title: '调试',
      links: [
        { href: '/admin/parse', label: 'Parse', desc: '从列表页解析条目，返回 JSON' },
      ],
    },
  ];

</script>

<svelte:head>
  <title>设置 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="settings-toolbar-block">
      <div class="admin-feed-header settings-header">
        <div class="admin-feed-header__left">
        <h2>设置</h2>
          <p class="admin-feed-header__desc">管理入口与调试工具</p>
        </div>
      </div>
    </div>

    <div class="settings-body-scroll">
      <div class="body">
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
    padding-bottom: 0;
  }
  .settings-header {
    min-height: 4.1rem;
  }
  .settings-body-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .body {
    padding: 0.95rem 0 1.425rem;
    box-sizing: border-box;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.475rem;
  }
  .links-section {
    margin-bottom: 1.1875rem;
  }
  .links-section:last-child {
    margin-bottom: 0.475rem;
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
    padding: 0.83125rem 1rem;
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
    gap: 0.1425rem;
  }
  .card-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    line-height: 1.33;
  }
  .card:hover .card-label {
    color: var(--color-primary);
  }
  .card-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    line-height: 1.235;
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
