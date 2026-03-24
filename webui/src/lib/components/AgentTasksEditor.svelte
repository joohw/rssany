<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fetchJson } from '$lib/fetchJson.js';
  import { meDailyReports, loadDailyReports, patchDailyReportEnabled } from '$lib/meAreaStore';

  /** 每条日报的切换序号，用于并发请求时仅对「当前这次」的失败回滚 */
  let toggleGen: Record<string, number> = {};
  let saveMsg = '';

  $: systemReports = $meDailyReports.reports;
  $: subsDbReady = $meDailyReports.subsDbReady;
  $: loading = $meDailyReports.loading;
  $: loadError = $meDailyReports.loadError;

  async function toggleSystem(key: string, nextEnabled: boolean) {
    if (!subsDbReady) return;
    const row = systemReports.find((r) => r.key === key);
    if (!row) return;
    const prevEnabled = row.enabled;
    const gen = (toggleGen[key] ?? 0) + 1;
    toggleGen = { ...toggleGen, [key]: gen };
    patchDailyReportEnabled(key, nextEnabled);
    saveMsg = '';
    try {
      const data = await fetchJson<{ ok?: boolean; message?: string }>('/api/daily-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: nextEnabled }),
        credentials: 'include',
      });
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
    } catch (e) {
      if (toggleGen[key] !== gen) return;
      patchDailyReportEnabled(key, prevEnabled);
      saveMsg = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void loadDailyReports();
  });
</script>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header">
      <div class="header-main">
        <div class="header-title-row">
          <h2>日报</h2>
          <div class="header-actions">
            {#if saveMsg}
              <span class="save-msg">{saveMsg}</span>
            {/if}
          </div>
        </div>
        <p class="sub">
          订阅对应栏目后每天上午将会收到系统推送的当天的日报邮件
        </p>
        {#if !subsDbReady}
          <p class="db-banner" role="status">
            数据库尚未创建 <code>user_daily_subscriptions</code> 表：当前开关为配置中的默认值，无法保存。请在 Supabase SQL Editor 执行仓库根目录 <code>supabase-schema.sql</code> 里该表的 <code>CREATE TABLE</code>，然后刷新本页。
          </p>
        {/if}
      </div>
    </div>

    {#if loading}
      <div class="state">加载中…</div>
    {:else if loadError}
      <div class="state error">{loadError}</div>
    {:else if systemReports.length === 0}
      <div class="state">暂无日报配置。若持续如此，请检查服务端 dailyReports 与数据库。</div>
    {:else}
      <div class="list">
        {#each systemReports as rep (rep.key)}
          <div class="card card-system">
            <div
              class="card-main card-main-nav"
              role="button"
              tabindex="0"
              title="{rep.title}。点击查看报告"
              on:click={() => goto('/me/daily/' + encodeURIComponent(rep.title))}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goto('/me/daily/' + encodeURIComponent(rep.title));
                }
              }}
            >
              <span class="card-label">{rep.title}</span>
              {#if rep.description}
                <span class="card-prompt">{rep.description}</span>
              {/if}
            </div>
            <div class="card-system-actions">
              <button
                type="button"
                class="switch"
                class:switch-on={rep.enabled}
                role="switch"
                aria-checked={rep.enabled}
                aria-label="订阅「{rep.title}」"
                title={!subsDbReady ? '暂无法保存，请先完成数据库配置' : undefined}
                disabled={!subsDbReady}
                on:click|stopPropagation={() => toggleSystem(rep.key, !rep.enabled)}
              >
                <span class="switch-thumb" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

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
    overflow: visible;
    background: transparent;
  }

  .feed-header {
    display: flex;
    flex-direction: column;
    padding: 0.2rem 0 1rem;
    border-bottom: 1px solid var(--color-border-muted);
    flex-shrink: 0;
  }
  .header-main {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .header-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .feed-header h2 {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
    line-height: 1.45;
  }
  .db-banner {
    font-size: 0.72rem;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    margin: 0.5rem 0 0;
    line-height: 1.45;
  }
  .db-banner code {
    font-size: 0.68rem;
    word-break: break-all;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .save-msg { font-size: 0.75rem; color: var(--color-destructive); }

  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem 0;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .state.error { color: var(--color-destructive); }

  .list {
    flex: 0 1 auto;
    display: flex;
    flex-direction: column;
    padding-bottom: 1.5rem;
  }

  .card {
    border-bottom: 1px solid var(--color-border-muted);
    padding: 1rem 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .card-main-nav {
    cursor: pointer;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
  }
  .card-main-nav:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .card-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card:hover .card-label { color: var(--color-primary); }
  .card-prompt {
    font-size: 0.72rem;
    color: var(--color-muted-foreground-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-system-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .switch {
    position: relative;
    width: 44px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: var(--color-border);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.18s ease;
  }
  .switch.switch-on {
    background: var(--color-primary);
  }
  .switch:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.18s ease;
    pointer-events: none;
  }
  .switch.switch-on .switch-thumb {
    transform: translateX(18px);
  }

  @media (max-width: 600px) {
    .feed-wrap { max-width: 100%; }
  }
</style>
