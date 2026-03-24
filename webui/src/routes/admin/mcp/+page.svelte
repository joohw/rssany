<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  const fallbackOrigin = 'http://127.0.0.1:3751';
  let origin = typeof window !== 'undefined' ? $page.url.origin : fallbackOrigin;
  let mcpConfigSnippet: { mcpServers: { rssany: { type: string; url: string } } } = {
    mcpServers: {
      rssany: {
        type: 'streamableHttp',
        url: `${origin}/mcp`
      }
    }
  };

  onMount(async () => {
    try {
      const res = await fetch('/api/server-info');
      const info = await res.json() as { lanUrl?: string | null };
      if (info.lanUrl) {
        origin = info.lanUrl;
        mcpConfigSnippet = {
          mcpServers: {
            rssany: { type: 'streamableHttp', url: `${origin}/mcp` }
          }
        };
      }
    } catch (_) {}
  });
</script>

<svelte:head>
  <title>MCP 接入 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="body">
      <p class="intro">
        {PRODUCT_NAME} 提供 <strong>MCP</strong>（Model Context Protocol）服务，可在支持 MCP 的 IDE 中接入，
        使用频道列表、信息流、条目详情、全文搜索等工具。
      </p>

      <section class="doc-section">
        <h3 class="section-title">前置条件</h3>
        <ul class="doc-list">
          <li>{PRODUCT_NAME} 服务已启动（局域网地址 <code>{origin}</code>）</li>
          <li>安装并使用支持 MCP 的客户端：Claude Code、Codex、Cursor</li>
        </ul>
      </section>

      <section class="doc-section">
        <h3 class="section-title">客户端支持</h3>
        <ul class="doc-list">
          <li><strong>Claude Code</strong>：在设置中添加 MCP 连接，类型选择 Streamable HTTP，<code>url</code> 填写 <code>{origin}/mcp</code></li>
          <li><strong>Codex</strong>：在设置中添加 MCP 连接，类型选择 Streamable HTTP，<code>url</code> 填写 <code>{origin}/mcp</code></li>
          <li><strong>Cursor</strong>：支持 MCP Streamable HTTP，在配置文件中加入以下片段</li>
        </ul>
      </section>

      <section class="doc-section">
        <h3 class="section-title">配置示例</h3>
        <p class="doc-p">在项目或用户目录下创建/编辑 <code>.cursor/mcp.json</code>，加入：</p>
        <pre class="code-block"><code>{JSON.stringify(mcpConfigSnippet, null, 2)}</code></pre>
        <p class="hint">将 <code>url</code> 改为你的 {PRODUCT_NAME} 服务地址（含 <code>/mcp</code> 路径）。</p>
      </section>

      <section class="doc-section">
        <h3 class="section-title">可用工具</h3>
        <ul class="tools-list">
          <li><code>list_channels</code> — 列出所有频道（id、标题、描述）</li>
          <li><code>get_feeds</code> — 按频道、时间、标签、作者等浏览文章列表（不做 title/summary/content 全文关键词检索）</li>
          <li><code>feeds_search</code> — 对已入库条目全文检索（<code>q</code> 必填），可叠加与 get_feeds 相同的范围条件；与 <code>web_search</code> 命名对齐</li>
          <li><code>get_feed_detail</code> — 根据条目 id 获取单条完整详情（含正文）</li>
          <li><code>web_search</code> — 联网搜索（Tavily）</li>
          <li><code>web_fetch</code> — 抓取 URL 正文（Readability）</li>
          <li><code>send_email</code> — 发邮件（SMTP）</li>
          <li><code>sandbox</code> — 沙箱文件（需带用户身份的会话；无用户上下文时不可用）</li>
        </ul>
      </section>
    </div>
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
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
  }
  .body::-webkit-scrollbar {
    width: 4px;
  }
  .body::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .intro {
    color: var(--color-muted-foreground-strong);
    margin: 0 0 1.25rem;
    line-height: 1.5;
    font-size: 0.875rem;
  }
  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.5rem;
  }
  .doc-section {
    margin-bottom: 1.25rem;
  }
  .doc-list {
    margin: 0.25rem 0 0 1rem;
    padding: 0;
  }
  .doc-list li {
    margin-bottom: 0.25rem;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .doc-p {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .code-block {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    color: var(--color-muted-foreground-strong);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    overflow-x: auto;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0.5rem 0 0;
  }
  .tools-list {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
  }
  .tools-list li {
    margin-bottom: 0.35rem;
    font-size: 0.8125rem;
  }
  .tools-list code {
    background: var(--color-muted);
    padding: 0.1em 0.35em;
    border-radius: 3px;
    font-size: 0.8em;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
