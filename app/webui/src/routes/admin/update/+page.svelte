<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import PackageCheck from 'lucide-svelte/icons/package-check';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  interface Settings {
    autoUpdate: boolean;
    autoRestart: boolean;
  }

  interface Status {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    managed: boolean;
  }

  let settings: Settings = { autoUpdate: true, autoRestart: true };
  let status: Status | null = null;
  let loading = true;
  let saving = false;

  async function load() {
    loading = true;
    try {
      settings = await adminFetchJson<Settings>('/api/update-settings');
      status = await adminFetchJson<Status>('/api/update-status');
    } catch (error) {
      showToast('加载失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const result = await adminFetchJson<Settings & { ok: boolean }>('/api/update-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      settings = { autoUpdate: result.autoUpdate, autoRestart: result.autoRestart };
      showToast('已保存', 'success');
    } catch (error) {
      showToast('保存失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      saving = false;
    }
  }

  function setAutoUpdate(checked: boolean) {
    settings = { ...settings, autoUpdate: checked };
  }

  function setAutoRestart(checked: boolean) {
    settings = { ...settings, autoRestart: checked };
  }

  onMount(load);
</script>

<svelte:head>
  <title>自动更新 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="body">
      <BackToParentRoute />
      <p class="intro">
        每 6 小时检查 npm 新版本。仅通过 <code>rssany start</code> 托管的服务会执行自动安装，开发模式不会触发。
      </p>

      {#if loading}
        <p class="state">加载中…</p>
      {:else}
        <section class="settings-section">
          <h3 class="section-title">更新策略</h3>
          <Card.Root class="settings-card">
            <div class="setting-row">
              <div class="setting-icon"><RefreshCw size={16} aria-hidden="true" /></div>
              <div class="setting-content">
                <Label for="auto-update" class="setting-label">自动更新</Label>
                <span class="setting-description">发现新版本后自动下载并安装</span>
              </div>
              <Switch
                id="auto-update"
                checked={settings.autoUpdate}
                onCheckedChange={setAutoUpdate}
                aria-label="自动更新"
              />
            </div>

            <div class="setting-row" class:disabled={!settings.autoUpdate}>
              <div class="setting-icon"><RotateCw size={16} aria-hidden="true" /></div>
              <div class="setting-content">
                <Label for="auto-restart" class="setting-label">更新后自动重启</Label>
                <span class="setting-description">安装完成后自动恢复服务运行</span>
              </div>
              <Switch
                id="auto-restart"
                checked={settings.autoRestart}
                onCheckedChange={setAutoRestart}
                disabled={!settings.autoUpdate}
                aria-label="更新后自动重启"
              />
            </div>
          </Card.Root>
        </section>

        {#if status}
          <section class="status-section">
            <h3 class="section-title">版本状态</h3>
            <Card.Root class="status-card">
              <PackageCheck size={18} aria-hidden="true" />
              <div>
                <p>
                  当前版本 <code>{status.currentVersion}</code>
                  {#if status.latestVersion}
                    · 最新版本 <code>{status.latestVersion}</code>
                  {/if}
                </p>
                <span>
                  {#if !status.latestVersion}
                    暂时无法连接 npm
                  {:else if status.updateAvailable}
                    检测到可用更新
                  {:else}
                    已是最新版本
                  {/if}
                </span>
              </div>
            </Card.Root>
            {#if !status.managed}
              <p class="notice">当前进程不是由 rssany 命令托管，自动安装不会执行；开发模式下这是正常现象。</p>
            {/if}
          </section>
        {/if}

        <div class="actions">
          <Button type="button" onclick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .feed-wrap {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 42rem;
  }
  .feed-col {
    padding: 0;
  }
  .body {
    overflow: visible;
    padding: var(--main-padding-top) 0 1rem;
  }
  .intro {
    color: var(--color-muted-foreground-strong);
    margin: 0 0 1.25rem;
    line-height: 1.5;
    font-size: 0.875rem;
  }
  code {
    font-size: 0.8125rem;
  }
  .state {
    padding: 2rem;
    text-align: center;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .settings-section,
  .status-section {
    margin-bottom: 1.25rem;
  }
  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.5rem;
  }
  :global(.settings-card) {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .setting-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.75rem;
    padding: 0.625rem 0.875rem;
    box-sizing: border-box;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
  }
  .setting-row:last-child {
    border-bottom: 0;
  }
  .setting-row.disabled {
    opacity: 0.55;
  }
  .setting-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    border-radius: var(--radius-sm);
    color: var(--color-muted-foreground);
    background: var(--color-muted);
  }
  .setting-content {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
  }
  :global(.setting-label) {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-foreground);
  }
  .setting-description {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
  }
  :global(.status-card) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-card);
    color: var(--color-muted-foreground);
  }
  :global(.status-card) p {
    margin: 0 0 0.15rem;
    font-size: 0.8125rem;
    color: var(--color-foreground);
  }
  :global(.status-card) span,
  .notice {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
  }
  .notice {
    margin: 0.5rem 0 0;
    line-height: 1.45;
  }
  .actions {
    margin-top: 1rem;
  }
  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
