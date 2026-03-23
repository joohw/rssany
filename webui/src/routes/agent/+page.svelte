<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { marked } from 'marked';
  import Plus from 'lucide-svelte/icons/plus';
  import History from 'lucide-svelte/icons/history';
  import X from 'lucide-svelte/icons/x';
  import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import {
    agentMessages,
    agentStream,
    rehydrateAgentMessages,
    createNewSession,
    loadSession,
    deleteSession,
    sessionList,
    currentSessionId,
    currentSession,
    agentSessionReady,
    agentSessionUserId,
    syncAgentSessionFromApi,
    normalizeReasoningChain,
  } from '$lib/agentSession';
  import type { TokenUsage } from '$lib/agentSession';
  import { agentInOverlayKey } from '$lib/agentInOverlay';
  import { agentOverlayOpen } from '$lib/agentOverlay';

  marked.setOptions({ breaks: true, gfm: true });

  function preprocessTableMarkdown(text: string): string {
    let out = text;
    out = out.replace(/```[\w]*\n([\s\S]*?)```/g, (match, code) => {
      const trimmed = code.trim();
      if (/^\|.+\|\s*\n\s*\|[-:\s|]+\|\s*\n/m.test(trimmed)) return trimmed;
      return match;
    });
    out = out.replace(/^(\s{2,})\|/gm, '|');
    return out;
  }

  function renderMd(text: string): string {
    const preprocessed = preprocessTableMarkdown(text);
    let html = marked.parse(preprocessed) as string;
    html = html.replace(/<a href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
    html = html.replace(/<table(\s[^>]*)?>/g, '<div class="table-wrap"><table$1>').replace(/<\/table>/g, '</table></div>');
    return html;
  }

  type AgentMessage = import('$lib/agentSession').AgentMessage;

  const inOverlay = getContext(agentInOverlayKey) === true;

  /** 与 app/agent/tools/definitions 中 name 一一对应；兼容旧 MCP 名称 */
  const TOOL_LABELS: Record<string, string> = {
    list_channels: '列出频道',
    search_sources: '搜索信源',
    get_feeds: '获取文章列表',
    get_feed_detail: '获取文章详情',
    web_search: '网页搜索',
    web_fetch: '抓取网页正文',
    send_email: '发送邮件',
    sandbox: '沙箱文件',
    get_channel_feeds: '获取频道文章',
    search_feeds: '全文搜索',
  };

  /** 工具参数名展示为中文（未知键仍用原名） */
  const ARG_LABELS: Record<string, string> = {
    q: '关键词',
    channel_id: '频道',
    source_url: '信源地址',
    since: '起始日期',
    until: '结束日期',
    tags: '标签',
    author: '作者',
    limit: '条数',
    offset: '偏移',
    item_id: '条目 ID',
    query: '查询',
    count: '结果数',
    url: '网址',
    to: '收件人',
    subject: '主题',
    text: '正文',
    html: 'HTML',
    cc: '抄送',
    bcc: '密送',
    action: '操作',
    path: '路径',
    encoding: '编码',
    content: '内容',
    create_dirs: '创建目录',
    old_string: '原文字',
    new_string: '新文字',
    replace_all: '全部替换',
    recursive: '递归列出',
  };

  const QUICK_PROMPTS = [
    '综述一下近期大模型推理/推理优化方向',
    '找几篇与 RAG 或检索增强相关的文章或讨论',
    '对比 CoT 和 ReAct 在 Agent 任务上的差异',
    '搜索「Harness」相关的最新进展与论文',
  ];

  const BACKEND_STORAGE_KEY = 'rssany_agent_backend';
  /** 服务端可用引擎：至少含 rssany；配置 OpenClaw 后多一个 openclaw */
  let chatBackends: ('rssany' | 'openclaw')[] = ['rssany'];
  let selectedBackend: 'rssany' | 'openclaw' = 'rssany';

  function backendLabel(id: string): string {
    if (id === 'openclaw') return 'OpenClaw Gateway';
    return 'RssAny Agent';
  }

  function toolLabel(name: string): string {
    return TOOL_LABELS[name] ?? name;
  }

  function argLabel(key: string): string {
    return ARG_LABELS[key] ?? key;
  }

  function formatArgs(args: Record<string, unknown>): string {
    const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== '');
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${argLabel(k)}: ${JSON.stringify(v)}`).join(', ');
  }

  function formatUsage(u: TokenUsage): string {
    const parts: string[] = [];
    if (u.totalTokens > 0) parts.push(`${u.totalTokens} tokens`);
    if (u.cost?.total != null && u.cost.total > 0) parts.push(`$${u.cost.total.toFixed(4)}`);
    return parts.join(' · ');
  }

  function formatSessionDate(ts: number): string {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
    if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }

  let input = '';
  /** 左侧历史会话边栏 */
  let historySidebarOpen = false;
  let inputEl: HTMLTextAreaElement | null = null;
  let messagesEl: HTMLDivElement | null = null;
  /** 流式输出时「thinking」面板的滚动容器，与消息区独立跟踪是否贴底 */
  let reasoningStreamingEl: HTMLDivElement | null = null;

  let scrollIntervalId: ReturnType<typeof setInterval> | null = null;
  let userScrolledUp = false;
  let reasoningUserScrolledUp = false;
  let scrollCleanup: (() => void) | null = null;
  let reasoningScrollCleanup: (() => void) | null = null;

  $: streaming = $agentStream.streaming;
  $: canUseChat = $agentSessionReady && $agentSessionUserId !== null;

  $: if (messagesEl) {
    if (scrollCleanup) scrollCleanup();
    const el = messagesEl;
    const onScroll = () => {
      if (!streaming || !el) return;
      const { scrollTop, clientHeight, scrollHeight } = el;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 24;
      if (!atBottom) userScrolledUp = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    scrollCleanup = () => {
      el.removeEventListener('scroll', onScroll);
      scrollCleanup = null;
    };
  }

  $: if (reasoningStreamingEl) {
    if (reasoningScrollCleanup) reasoningScrollCleanup();
    const el = reasoningStreamingEl;
    const onScroll = () => {
      if (!streaming || !el) return;
      const { scrollTop, clientHeight, scrollHeight } = el;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 24;
      if (!atBottom) reasoningUserScrolledUp = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    reasoningScrollCleanup = () => {
      el.removeEventListener('scroll', onScroll);
      reasoningScrollCleanup = null;
    };
  }

  let prevStreaming = false;
  $: {
    if (streaming && !prevStreaming) {
      userScrolledUp = false;
      reasoningUserScrolledUp = false;
    }
    prevStreaming = streaming;
  }
  $: if (streaming && messagesEl) {
    void reasoningStreamingEl;
    const scrollStreamingPanels = () => {
      if (!userScrolledUp && messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      if (!reasoningUserScrolledUp && reasoningStreamingEl)
        reasoningStreamingEl.scrollTop = reasoningStreamingEl.scrollHeight;
    };
    scrollStreamingPanels();
    if (scrollIntervalId) clearInterval(scrollIntervalId);
    scrollIntervalId = setInterval(scrollStreamingPanels, 800);
  } else if (scrollIntervalId) {
    clearInterval(scrollIntervalId);
    scrollIntervalId = null;
  }

  onDestroy(() => {
    if (scrollCleanup) scrollCleanup();
    if (reasoningScrollCleanup) reasoningScrollCleanup();
  });

  onMount(() => {
    void (async () => {
      await syncAgentSessionFromApi();
      rehydrateAgentMessages();
      try {
        const r = await fetch('/api/chat/options', { credentials: 'include' });
        if (r.ok) {
          const j = (await r.json()) as { backends?: ('rssany' | 'openclaw')[] };
          const list = j.backends?.length ? j.backends : ['rssany'];
          chatBackends = list as ('rssany' | 'openclaw')[];
          const saved =
            typeof localStorage !== 'undefined' ? localStorage.getItem(BACKEND_STORAGE_KEY) : null;
          if (saved === 'openclaw' || saved === 'rssany') {
            if (chatBackends.includes(saved)) selectedBackend = saved;
          }
        }
      } catch {
        /* ignore */
      }
    })();
    inputEl?.focus();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'N' && e.shiftKey && $agentMessages.length > 0 && !$agentStream.streaming) {
        e.preventDefault();
        clearChat();
      }
    };
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  async function send(promptText?: string) {
    const prompt = (promptText ?? input.trim()).trim();
    if (!prompt || $agentStream.streaming) return;
    if (!$agentSessionReady || !$agentSessionUserId) return;
    if (!promptText) input = '';
    const history = $agentMessages.map((m) =>
      m.role === "user" ? { role: 'user' as const, content: m.content } : { role: 'assistant' as const, content: m.content, usage: m.usage }
    );
    agentMessages.update((m) => [...m, { role: 'user', content: prompt }]);
    agentStream.startStream();

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, messages: history, backend: selectedBackend }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 401) {
          throw new Error('登录已过期或尚未登录，请重新登录后再使用 Agent');
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无响应流');
      const decoder = new TextDecoder();
      let buf = '';
      let lastEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            lastEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (lastEvent === 'text_delta' && data.delta !== undefined) {
                agentStream.appendContent(data.delta);
              }
              if (lastEvent === 'reasoning_delta' && data.delta !== undefined) {
                agentStream.appendReasoning(data.delta);
              }
              if (lastEvent === 'tool_start' && data.toolName) {
                agentStream.appendToolCall({
                  toolCallId: data.toolCallId ?? '',
                  toolName: data.toolName,
                  args: data.args ?? {},
                  status: 'running',
                });
              }
              if (lastEvent === 'tool_end' && data.toolCallId) {
                agentStream.updateToolCallStatus(data.toolCallId, data.isError ? 'error' : 'success');
              }
              if (lastEvent === 'error' && data.message) {
                agentStream.setError(data.message);
              }
              if (lastEvent === 'done' && data.usage) {
                agentStream.setUsage(data.usage);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
    } catch (e) {
      agentStream.setError(e instanceof Error ? e.message : String(e));
    } finally {
      agentStream.finishStream();
    }
  }

  function clearChat() {
    agentMessages.clear();
    agentStream.resetStream();
  }

  function handleNewSession() {
    if ($agentMessages.length === 0) return;
    createNewSession();
  }

  function handleLoadSession(id: string) {
    loadSession(id);
  }

  function toggleHistorySidebar() {
    historySidebarOpen = !historySidebarOpen;
  }

  function closeAgentOverlay() {
    agentOverlayOpen.set(false);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<svelte:head>
  <title>Agent - RssAny</title>
</svelte:head>

<div class="agent-wrap">
  <div class="agent-layout">
    <div class="agent-col">
    <!-- 浮层：不占文档流，全高覆盖主内容；透明遮罩仅用于点击关闭 -->
    <div
      class="agent-sidebar-backdrop"
      class:open={historySidebarOpen}
      role="presentation"
      aria-hidden="true"
      on:click={() => (historySidebarOpen = false)}
    ></div>
    <aside
      class="agent-sidebar"
      class:open={historySidebarOpen}
      aria-label="历史会话"
      aria-hidden={!historySidebarOpen}
    >
      <div class="agent-sidebar-header">
        <span class="agent-sidebar-title">历史会话</span>
        <button
          type="button"
          class="agent-sidebar-close"
          title="收起侧边栏"
          aria-label="收起侧边栏"
          on:click={() => (historySidebarOpen = false)}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div class="agent-sidebar-body">
        {#if $sessionList.length === 0}
          <p class="sidebar-empty">暂无历史会话</p>
        {:else}
          <ul class="session-list">
            {#each $sessionList as session (session.id)}
              <li class="session-item group" class:is-active={session.id === $currentSessionId}>
                <div
                  role="button"
                  tabindex="0"
                  class="session-item-main"
                  on:click={() => handleLoadSession(session.id)}
                  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleLoadSession(session.id))}
                >
                  <span class="session-item-title">{session.title}</span>
                  <span class="session-item-date">{formatSessionDate(session.updatedAt)}</span>
                </div>
                <span
                  role="button"
                  tabindex="0"
                  class="session-item-delete {$sessionList.length <= 1 ? 'is-hidden' : ''}"
                  title="删除此会话"
                  on:click|stopPropagation={() => $sessionList.length > 1 && deleteSession(session.id)}
                  on:keydown|stopPropagation={(e) => e.key === 'Enter' && $sessionList.length > 1 && (e.preventDefault(), deleteSession(session.id))}
                >×</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </aside>
    <header class="agent-header">
      <div class="agent-header-inner" class:agent-header-inner-full={inOverlay}>
        <div class="agent-header-actions">
          <button
            type="button"
            class="agent-header-btn agent-header-btn-icon"
            class:agent-header-btn-active={historySidebarOpen}
            disabled={streaming || !canUseChat}
            title={historySidebarOpen ? '收起历史会话' : '展开历史会话'}
            aria-label={historySidebarOpen ? '收起历史会话' : '展开历史会话'}
            aria-expanded={historySidebarOpen}
            on:click={toggleHistorySidebar}
          >
            <History size={20} strokeWidth={2} />
          </button>
          <button type="button" class="agent-header-btn agent-header-btn-icon" title="新建会话" disabled={streaming || !canUseChat} on:click={handleNewSession}>
            <Plus size={20} strokeWidth={2} />
          </button>
        </div>
        <div class="agent-header-title-wrap">
          <span class="agent-title">{$currentSession?.title ?? '新对话'}</span>
          {#if chatBackends.length > 1}
            <label class="agent-backend-label">
              <span class="visually-hidden">对话引擎</span>
              <select
                class="agent-backend-select"
                bind:value={selectedBackend}
                disabled={streaming || !canUseChat}
                title="选择对话引擎：RssAny 使用本服务 MCP 工具；OpenClaw 走已配置的 Gateway（OpenResponses）"
                on:change={() => {
                  try {
                    localStorage.setItem(BACKEND_STORAGE_KEY, selectedBackend);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {#each chatBackends as b (b)}
                  <option value={b}>{backendLabel(b)}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
        {#if inOverlay}
          <div class="agent-header-side-right">
            <button
              type="button"
              class="agent-header-btn agent-header-btn-icon"
              title="关闭"
              aria-label="关闭"
              on:click={closeAgentOverlay}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        {/if}
      </div>
    </header>
    <div class="agent-messages" bind:this={messagesEl}>
      <div class="agent-messages-inner">
      {#if $agentMessages.length === 0}
        <div class="agent-empty">
          {#if !$agentSessionReady}
            <p class="agent-empty-title">NewsClaw</p>
            <p class="agent-empty-desc">正在加载会话…</p>
          {:else if !$agentSessionUserId}
            <p class="agent-empty-title">需要登录</p>
            <p class="agent-empty-desc">
              Agent 对话与沙箱文件按账号隔离保存。请先登录后再使用。
            </p>
            <p class="agent-empty-login">
              <a href="/login?next=/feeds" class="agent-empty-login-link">去登录</a>
            </p>
          {:else}
          <p class="agent-empty-title">NewsClaw</p>
          <p class="agent-empty-desc">一只喜欢收集信源、研究资讯的龙虾。</p>
          <div class="quick-prompts">
            {#each QUICK_PROMPTS as prompt}
              <button type="button" class="quick-prompt" on:click={() => send(prompt)} disabled={streaming || !canUseChat}>{prompt}</button>
            {/each}
          </div>
          {/if}
        </div>
      {:else}
        {#each $agentMessages as msg, i (i + msg.role + msg.content + JSON.stringify(normalizeReasoningChain(msg)))}
          <div class="msg" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
            {#if msg.role === 'assistant'}
              {@const rc = normalizeReasoningChain(msg)}
              {#if rc.length > 0}
                <details class="agent-reasoning">
                  <summary><span class="agent-reasoning-arrow">▼</span> thought</summary>
                  <div class="agent-reasoning-inner">
                    {#each rc as seg, segIdx (segIdx + (seg.type === 'text' ? seg.text : seg.toolCallId) + (seg.type === 'tool' ? seg.status : ''))}
                      {#if seg.type === 'text'}
                        <div class="agent-reasoning-content">{seg.text}</div>
                      {:else}
                        <div class="tool-calls">
                          <div class="tool-call" class:running={seg.status === 'running'} class:success={seg.status === 'success'} class:error={seg.status === 'error'}>
                            <span class="tool-call-icon">
                              {#if seg.status === 'running'}
                                <span class="tool-call-spinner" aria-hidden="true"><Loader2 size={14} /></span>
                              {:else if seg.status === 'success'}
                                ✓
                              {:else}
                                ✗
                              {/if}
                            </span>
                            <span class="tool-call-name">{toolLabel(seg.toolName)}</span>
                            {#if formatArgs(seg.args)}<span class="tool-call-args">{formatArgs(seg.args)}</span>{/if}
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </details>
              {/if}
              <div class="msg-content markdown-body">{@html renderMd(msg.content)}</div>
              {#if msg.usage}<div class="msg-usage">{formatUsage(msg.usage)}</div>{/if}
            {:else}
              <div class="msg-content">{msg.content}</div>
            {/if}
          </div>
        {/each}
        {#if $agentStream.streaming}
          <div class="msg assistant">
            {#if $agentStream.streamReasoningChain.length > 0}
              <details class="agent-reasoning" open>
                <summary><span class="agent-reasoning-arrow">▼</span> thinking</summary>
                <div class="agent-reasoning-inner" bind:this={reasoningStreamingEl}>
                  {#each $agentStream.streamReasoningChain as seg, segIdx (segIdx + (seg.type === 'text' ? seg.text : seg.toolCallId) + (seg.type === 'tool' ? seg.status : ''))}
                    {#if seg.type === 'text'}
                      <div class="agent-reasoning-content">
                        {seg.text}{#if segIdx === $agentStream.streamReasoningChain.length - 1}<span class="cursor">▌</span>{/if}
                      </div>
                    {:else}
                      <div class="tool-calls">
                        <div class="tool-call" class:running={seg.status === 'running'} class:success={seg.status === 'success'} class:error={seg.status === 'error'}>
                          <span class="tool-call-icon">
                            {#if seg.status === 'running'}
                              <span class="tool-call-spinner" aria-hidden="true"><Loader2 size={14} /></span>
                            {:else if seg.status === 'success'}
                              ✓
                            {:else}
                              ✗
                            {/if}
                          </span>
                          <span class="tool-call-name">{toolLabel(seg.toolName)}</span>
                          {#if formatArgs(seg.args)}<span class="tool-call-args">{formatArgs(seg.args)}</span>{/if}
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>
              </details>
            {/if}
            <div class="msg-content markdown-body">{@html renderMd($agentStream.streamContent)}<span class="cursor">▌</span></div>
          </div>
        {/if}
      {/if}
      </div>
    </div>

    <div class="agent-input-wrap">
      {#if $agentStream.error}
        <div class="agent-error">{$agentStream.error}</div>
      {/if}
      <textarea
        bind:this={inputEl}
        bind:value={input}
        on:keydown={handleKeydown}
        placeholder="输入问题，Shift+Enter 发送…"
        rows="3"
        disabled={streaming || !canUseChat}
      ></textarea>
      <div class="input-footer">
        <span class="input-hint">Shift+Enter 发送 · Enter 换行 · Shift+N 清空</span>
        <div class="input-footer-right">
          <button type="button" class="btn-send" on:click={() => send()} disabled={streaming || !input.trim() || !canUseChat}>
            {streaming ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  </div>
  </div>
</div>

<style>
  .agent-wrap {
    /* 继承 layout / overlay 的 --shell-gutter；聊天列略窄于 feeds 主列 */
    --agent-chat-max: min(700px, calc(100vw - 2 * var(--shell-gutter, 1rem)));
    width: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /** 单列占满高度，侧栏绝对定位浮于其上 */
  .agent-layout {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }
  .agent-sidebar-backdrop {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: transparent;
    pointer-events: none;
  }
  .agent-sidebar-backdrop.open {
    pointer-events: auto;
  }
  .agent-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(15rem, 86vw);
    max-width: 17.5rem;
    z-index: 11;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--color-background);
    border-right: 1px solid var(--color-border);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.18);
    transform: translateX(-100%);
    transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }
  .agent-sidebar.open {
    transform: translateX(0);
    pointer-events: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .agent-sidebar {
      transition-duration: 0.01ms;
    }
  }
  .agent-sidebar-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    border-bottom: 1px solid var(--color-border);
  }
  .agent-sidebar-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    min-width: 0;
  }
  .agent-sidebar-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 6px);
    background: transparent;
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .agent-sidebar-close:hover {
    background: var(--color-muted);
    color: var(--color-accent-foreground);
  }
  .agent-sidebar-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .sidebar-empty {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-soft);
    padding: 0.75rem;
    margin: 0;
  }
  .session-list {
    list-style: none;
    margin: 0;
    padding: 0.35rem 0.35rem 0.5rem;
  }
  .session-item {
    display: flex;
    align-items: stretch;
    margin: 0 0 0.2rem;
    border-radius: var(--radius-sm, 6px);
    transition: background 0.12s ease;
  }
  .session-item:last-child {
    margin-bottom: 0;
  }
  .session-item:hover {
    background: var(--color-muted);
  }
  .session-item.is-active {
    background: var(--color-primary-light);
  }
  .session-item.is-active:hover {
    background: var(--color-primary-light);
  }
  .session-item-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    padding: 0.4rem 0.35rem 0.4rem 0.75rem;
    font-size: 0.8125rem;
    text-align: left;
    color: var(--color-foreground);
    min-width: 0;
    cursor: pointer;
    border: none;
    background: transparent;
    font-family: inherit;
    border-radius: 0;
  }
  .session-item.is-active .session-item-main {
    color: var(--color-primary);
  }
  .session-item-title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }
  .session-item-date {
    font-size: 0.6875rem;
    color: var(--color-muted-foreground-soft);
  }
  .session-item.is-active .session-item-date {
    color: var(--color-primary);
    opacity: 0.9;
  }
  .session-item-delete {
    flex-shrink: 0;
    width: 1.75rem;
    padding-right: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    color: var(--color-muted-foreground-soft);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: 0 var(--radius-sm, 6px) var(--radius-sm, 6px) 0;
  }
  .session-item.group:hover .session-item-delete,
  .session-item-delete:hover,
  .session-item-delete:focus {
    opacity: 1;
  }
  .session-item-delete:hover {
    color: var(--color-destructive);
  }
  .session-item-delete.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
  .agent-col {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: transparent;
  }
  .agent-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: linear-gradient(
      to bottom,
      var(--color-background) 0%,
      color-mix(in srgb, var(--color-background) 88%, transparent) 55%,
      transparent 100%
    );
    /* 与 .topbar-inner 一致：内边距在 inner 上，此处仅留底部渐变区 */
    padding: 0 0 1.5rem;
    pointer-events: none;
  }
  .agent-header-inner {
    box-sizing: border-box;
    max-width: var(--agent-chat-max);
    width: 100%;
    margin: 0 auto;
    /* 与 layout .topbar-inner：padding 与列间距一致 */
    padding: 0.65rem var(--shell-gutter);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: clamp(0.5rem, 2vw, 1rem);
    row-gap: 0.35rem;
    pointer-events: auto;
  }
  /* Overlay：全宽顶栏，左右等宽 flex，标题绝对居中 */
  .agent-header-inner-full {
    max-width: none;
    display: flex;
    align-items: center;
    gap: clamp(0.5rem, 2vw, 1rem);
    position: relative;
  }
  .agent-header-inner-full .agent-header-actions {
    flex: 1 1 0;
    min-width: 0;
    justify-content: flex-start;
  }
  .agent-header-inner-full .agent-header-side-right {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.2rem;
  }
  .agent-header-inner-full .agent-header-title-wrap {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    grid-column: unset;
    max-width: min(28rem, calc(100vw - 12rem));
    z-index: 1;
  }
  .agent-header-title-wrap {
    grid-column: 2;
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    max-width: min(28rem, calc(100vw - 9rem));
  }
  .agent-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-muted-foreground-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    width: 100%;
    text-align: center;
  }
  .agent-backend-label {
    display: block;
    margin: 0;
  }
  .agent-backend-select {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-muted-foreground-strong);
    background: color-mix(in srgb, var(--color-background) 92%, var(--color-foreground) 8%);
    border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
    border-radius: var(--radius-sm, 6px);
    padding: 0.2rem 0.45rem;
    max-width: 100%;
    cursor: pointer;
    font-family: inherit;
  }
  .agent-backend-select:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .agent-header-actions {
    grid-column: 1;
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
  }
  /* 顶栏操作按钮：与 layout .topbar-link 图标区对齐 */
  :global(.agent-header-actions .agent-header-btn, .agent-header-side-right .agent-header-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: unset;
    min-width: unset;
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s ease, color 0.12s ease;
  }
  :global(.agent-header-actions .agent-header-btn:hover:not(:disabled), .agent-header-side-right .agent-header-btn:hover:not(:disabled)) {
    background: var(--color-muted);
    color: var(--color-accent-foreground);
  }
  :global(.agent-header-actions .agent-header-btn:disabled, .agent-header-side-right .agent-header-btn:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  :global(.agent-header-actions .agent-header-btn-icon, .agent-header-side-right .agent-header-btn-icon) {
    padding: 0.45rem;
    color: var(--color-muted-foreground);
  }
  :global(.agent-header-actions .agent-header-btn-icon svg, .agent-header-side-right .agent-header-btn-icon svg) {
    width: 20px;
    height: 20px;
  }
  :global(.agent-header-actions .agent-header-btn-icon:hover:not(:disabled), .agent-header-side-right .agent-header-btn-icon:hover:not(:disabled)) {
    color: var(--color-primary);
    background: var(--color-primary-light);
  }
  :global(.agent-header-actions .agent-header-btn-active.agent-header-btn-icon, .agent-header-side-right .agent-header-btn-active.agent-header-btn-icon) {
    color: var(--color-primary-foreground);
    background: var(--color-primary);
  }
  :global(.agent-header-actions .agent-header-btn-active.agent-header-btn-icon:hover:not(:disabled), .agent-header-side-right .agent-header-btn-active.agent-header-btn-icon:hover:not(:disabled)) {
    color: var(--color-primary-foreground);
    background: var(--color-primary-hover);
  }
  .agent-messages {
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .agent-messages-inner {
    box-sizing: border-box;
    max-width: var(--agent-chat-max);
    width: 100%;
    margin: 0 auto;
    /* 为顶部浮动的 meta 栏留出空间：inner 0.65+0.65 + 图标行(~2.25rem) + 底部渐变 1.5rem */
    padding: calc(0.65rem + 2.25rem + 0.65rem + 1.5rem) var(--shell-gutter) 1.75rem;
  }
  .agent-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 240px;
    padding: 2.75rem 1.75rem;
    text-align: center;
  }
  .agent-empty-title {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--color-foreground);
    margin: 0 0 0.75rem;
    letter-spacing: 0.02em;
    line-height: 1.35;
  }
  .agent-empty-desc {
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
    margin: 0 0 1.75rem;
    line-height: 1.75;
    max-width: 24rem;
  }
  .agent-empty-login {
    margin: 0;
  }
  .agent-empty-login-link {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-primary);
    text-decoration: none;
  }
  .agent-empty-login-link:hover {
    text-decoration: underline;
  }
  .quick-prompts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: center;
    margin-top: 0.25rem;
  }
  .quick-prompt {
    padding: 0.55rem 1rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  .quick-prompt:hover:not(:disabled) {
    background: var(--color-muted);
    border-color: var(--color-border-muted);
    color: var(--color-accent-foreground);
  }
  .quick-prompt:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .msg {
    margin-bottom: 1.35rem;
  }
  .msg-content {
    font-size: 0.875rem;
    line-height: 1.65;
    word-break: break-word;
    color: var(--color-foreground);
  }
  .msg.user .msg-content {
    white-space: pre-wrap;
  }
  .msg.user {
    background: var(--color-muted);
    margin-left: -0.5rem;
    margin-right: -0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-border-muted);
  }
  .msg-usage {
    font-size: 0.6875rem;
    color: var(--color-muted-foreground-soft);
    margin-top: 0.35rem;
  }
  .tool-calls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.5rem;
  }
  .agent-reasoning-inner .tool-calls {
    margin-bottom: 0;
  }
  .tool-call {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm, 6px);
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    color: var(--color-muted-foreground-strong);
  }
  .tool-call.running {
    background: var(--color-primary-light);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    color: var(--color-primary);
  }
  .tool-call-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .tool-call.running .tool-call-spinner :global(svg) {
    animation: tool-spin 1s linear infinite;
  }
  .tool-call.success {
    background: color-mix(in srgb, var(--color-success) 14%, transparent);
    border-color: color-mix(in srgb, var(--color-success) 35%, transparent);
    color: var(--color-success);
  }
  .tool-call.error {
    background: color-mix(in srgb, var(--color-destructive) 14%, transparent);
    border-color: color-mix(in srgb, var(--color-destructive) 35%, transparent);
    color: var(--color-destructive);
  }
  .tool-call-icon {
    font-size: 0.8em;
    opacity: 0.9;
  }
  @keyframes tool-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .tool-call-name {
    font-weight: 500;
  }
  .tool-call-args {
    color: var(--color-muted-foreground);
    font-size: 0.9em;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent-reasoning {
    margin-bottom: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 6px);
    overflow: hidden;
  }
  .agent-reasoning summary {
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    font-weight: 500;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .agent-reasoning summary::-webkit-details-marker {
    display: none;
  }
  .agent-reasoning-arrow {
    display: inline-block;
    font-size: 0.6em;
    transition: transform 0.2s ease;
  }
  .agent-reasoning:not([open]) .agent-reasoning-arrow {
    transform: rotate(-90deg);
  }
  .agent-reasoning-inner {
    border-top: 1px solid var(--color-hairline);
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: min(45vh, 18rem);
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .agent-reasoning-content {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--color-primary);
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  .agent-input-wrap {
    box-sizing: border-box;
    flex-shrink: 0;
    max-width: var(--agent-chat-max);
    width: 100%;
    margin: 0 auto;
    border-top: 1px solid var(--color-hairline);
    padding: 1rem var(--shell-gutter) 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--color-background);
  }
  .agent-error {
    font-size: 0.8rem;
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 35%, transparent);
    border-radius: var(--radius-sm, 6px);
    padding: 0.4rem 0.75rem;
  }
  .agent-input-wrap textarea {
    width: 100%;
    resize: none;
    padding: 0.35rem 0;
    border: none;
    border-radius: 0;
    font-size: 0.875rem;
    font-family: inherit;
    line-height: 1.5;
    color: var(--color-foreground);
    background: transparent;
    box-shadow: none;
  }
  .agent-input-wrap textarea::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .agent-input-wrap textarea:focus {
    outline: none;
    border: none;
    background: transparent;
  }
  .agent-input-wrap textarea:disabled {
    background: transparent;
    color: var(--color-muted-foreground-soft);
    opacity: 1;
  }
  .input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .input-hint {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
  }
  .input-footer-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .btn-send {
    padding: 0.45rem 1.125rem;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    border-radius: var(--radius-sm, 6px);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .btn-send:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .btn-send:disabled {
    background: var(--color-muted);
    color: var(--color-muted-foreground-soft);
    cursor: not-allowed;
  }
  /* markdown（与 app.css Linear 深色令牌一致） */
  :global(.msg-content.markdown-body) {
    font-size: 0.875rem;
    line-height: 1.65;
    color: var(--color-foreground);
  }
  :global(.msg-content.markdown-body p) {
    margin: 0 0 0.6em;
  }
  :global(.msg-content.markdown-body p:last-child) {
    margin-bottom: 0;
  }
  :global(.msg-content.markdown-body ul),
  :global(.msg-content.markdown-body ol) {
    /* outside + 祖先 overflow-x:hidden 会裁掉项目符号；inside 避免黑点与背景「糊在一起」或消失 */
    margin: 0.4em 0 0.6em 0;
    padding: 0 0 0 0.25em;
    list-style-position: inside;
    color: var(--color-foreground);
  }
  :global(.msg-content.markdown-body li) {
    margin-bottom: 0.2em;
  }
  :global(.msg-content.markdown-body li::marker) {
    color: var(--color-muted-foreground-strong);
  }
  :global(.msg-content.markdown-body h1),
  :global(.msg-content.markdown-body h2),
  :global(.msg-content.markdown-body h3) {
    font-weight: 600;
    margin: 0.75em 0 0.35em;
    line-height: 1.3;
    color: var(--color-foreground);
    letter-spacing: -0.02em;
  }
  :global(.msg-content.markdown-body h1) {
    font-size: 1.05em;
  }
  :global(.msg-content.markdown-body h2) {
    font-size: 0.975em;
  }
  :global(.msg-content.markdown-body h3) {
    font-size: 0.9em;
  }
  :global(.msg-content.markdown-body code) {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.85em;
    background: var(--color-muted);
    color: var(--color-accent-foreground);
    padding: 0.12em 0.4em;
    border-radius: 4px;
    border: 1px solid var(--color-border-muted);
  }
  :global(.msg-content.markdown-body pre) {
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 6px);
    padding: 0.75rem 1rem;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  :global(.msg-content.markdown-body pre code) {
    background: none;
    padding: 0;
    font-size: 0.8125rem;
    border-radius: 0;
    border: none;
    color: var(--color-muted-foreground-strong);
  }
  :global(.msg-content.markdown-body blockquote) {
    border-left: 3px solid var(--color-primary);
    margin: 0.5em 0;
    padding: 0.25em 0.75em;
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-card-elevated) 80%, transparent);
    border-radius: 0 var(--radius-sm, 6px) var(--radius-sm, 6px) 0;
  }
  :global(.msg-content.markdown-body a) {
    color: var(--color-primary);
    text-decoration: none;
  }
  :global(.msg-content.markdown-body a:hover) {
    color: var(--color-primary-hover);
    text-decoration: underline;
  }
  :global(.msg-content.markdown-body hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0.75em 0;
  }
  :global(.msg-content.markdown-body strong) {
    font-weight: 600;
    color: var(--color-accent-foreground);
  }
  :global(.msg-content.markdown-body em) {
    color: var(--color-muted-foreground-strong);
  }
  :global(.msg-content.markdown-body del) {
    color: var(--color-muted-foreground-soft);
  }
  :global(.msg-content.markdown-body img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-border);
  }
  :global(.msg-content.markdown-body .table-wrap) {
    overflow-x: auto;
    margin: 0.5em 0;
    -webkit-overflow-scrolling: touch;
    border-radius: var(--radius-sm, 6px);
  }
  :global(.msg-content.markdown-body table) {
    border-collapse: collapse;
    width: 100%;
    min-width: 200px;
    font-size: 0.85em;
    color: var(--color-foreground);
  }
  :global(.msg-content.markdown-body thead) {
    display: table-header-group;
  }
  :global(.msg-content.markdown-body tbody) {
    display: table-row-group;
  }
  :global(.msg-content.markdown-body tbody tr:nth-child(even)) {
    background: color-mix(in srgb, var(--color-muted) 55%, transparent);
  }
  :global(.msg-content.markdown-body th),
  :global(.msg-content.markdown-body td) {
    border: 1px solid var(--color-border);
    padding: 0.35em 0.6em;
    text-align: left;
    word-break: break-word;
    vertical-align: top;
  }
  :global(.msg-content.markdown-body th) {
    background: var(--color-card-elevated);
    font-weight: 600;
    white-space: nowrap;
    color: var(--color-muted-foreground-strong);
  }
</style>
