<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { goto } from '$app/navigation';
  import { Dialog, Popover } from 'bits-ui';
  import MoreVertical from 'lucide-svelte/icons/more-vertical';
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
  import AgentTasksEditor from '$lib/components/AgentTasksEditor.svelte';
  import { setAgentSessionUser, agentSessionReady } from '$lib/agentSession';
  import { meUser, resetMeStores } from '$lib/meAreaStore';

  let showAccountMenu = false;
  let loggingOut = false;
  let showDeleteDialog = false;
  let deleting = false;
  let deleteError = '';

  $: u = $meUser.user;
  $: email = u?.email ?? '';
  $: displayName = (() => {
    const dn = u?.display_name?.trim();
    return dn || null;
  })();
  $: loading = !$meUser.loaded;
  $: isAdmin = u?.role === 'admin';

  async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    showAccountMenu = false;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      resetMeStores();
      setAgentSessionUser(null);
      agentSessionReady.set(true);
      await goto('/', { replaceState: true });
    } finally {
      loggingOut = false;
    }
  }

  function openDeleteDialog() {
    showAccountMenu = false;
    deleteError = '';
    showDeleteDialog = true;
  }

  async function confirmDeleteAccount() {
    deleting = true;
    deleteError = '';
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
      resetMeStores();
      setAgentSessionUser(null);
      agentSessionReady.set(true);
      showDeleteDialog = false;
      await goto('/', { replaceState: true });
    } catch (e) {
      deleteError = e instanceof Error ? e.message : String(e);
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>Account — {PRODUCT_NAME}</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="page-header-row">
      <div class="page-header-text">
        <h1 class="page-title">Account</h1>
        <p class="page-sub">
          {#if loading}
            Loading…
          {:else if displayName && email && displayName !== email}
            <span class="page-sub-line">{displayName}</span>
            <span class="page-sub-line page-sub-muted">{email}</span>
          {:else}
            {displayName || email || '—'}
          {/if}
        </p>
      </div>
      {#if !loading}
        <Popover.Root bind:open={showAccountMenu} onOpenChange={(v) => (showAccountMenu = v)}>
          <Popover.Trigger
            type="button"
            class="options-menu-trigger"
            title="账户选项"
            aria-label="账户选项"
            aria-haspopup="menu"
            disabled={loggingOut || deleting}
          >
            <MoreVertical size={18} aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="options-menu-panel" side="bottom" align="end" sideOffset={6}>
              <button
                type="button"
                class="options-menu-item"
                disabled={loggingOut}
                on:click={() => void logout()}
              >
                {loggingOut ? '退出中…' : '退出'}
              </button>
              <button type="button" class="options-menu-item options-menu-item-danger" disabled={deleting} on:click={openDeleteDialog}>
                删除账号
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      {/if}
    </div>
    {#if !loading && isAdmin}
      <a href="/admin" class="admin-entry">
        <LayoutDashboard size={16} aria-hidden="true" />
        <span>管理后台</span>
      </a>
    {/if}
  </header>

  <div class="page-body">
    <AgentTasksEditor />
  </div>
</div>

<Dialog.Root
  open={showDeleteDialog}
  onOpenChange={(open) => {
    showDeleteDialog = open;
    if (!open) deleteError = '';
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="me-dialog-overlay" />
    <Dialog.Content class="me-dialog-content" aria-describedby="delete-account-desc">
      <div class="me-dialog-header">
        <Dialog.Title class="me-dialog-title">确认注销账号</Dialog.Title>
        <Dialog.Close class="me-dialog-close" aria-label="关闭">×</Dialog.Close>
      </div>
      <div class="me-dialog-body">
        <p id="delete-account-desc" class="me-dialog-text">
          此操作不可撤销。确定要永久删除当前账号及全部关联数据吗？
        </p>
        {#if deleteError}
          <p class="me-dialog-error" role="alert">{deleteError}</p>
        {/if}
        <div class="me-dialog-actions">
          <button
            type="button"
            class="me-dialog-cancel"
            disabled={deleting}
            on:click={() => (showDeleteDialog = false)}
          >
            取消
          </button>
          <button type="button" class="me-dialog-confirm" disabled={deleting} on:click={confirmDeleteAccount}>
            {deleting ? '处理中…' : '确认注销'}
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .page {
    box-sizing: border-box;
    width: 100%;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    color: var(--color-foreground);
    padding-top: 2.35rem;
  }

  .page-header {
    flex-shrink: 0;
    padding: 0.2rem 0 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .admin-entry {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.85rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-foreground);
    text-decoration: none;
    padding: 0.35rem 0;
    border-radius: 6px;
    width: fit-content;
  }

  .admin-entry:hover {
    color: var(--color-muted-foreground);
  }

  .admin-entry:focus-visible {
    outline: 2px solid var(--color-ring, #888);
    outline-offset: 2px;
  }

  .page-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem 1rem;
  }

  .page-header-text {
    flex: 1;
    min-width: 0;
  }

  .page-title {
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 0.25rem;
    color: var(--color-foreground);
  }

  .page-sub {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    margin: 0;
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .page-sub-line {
    display: block;
  }

  .page-sub-muted {
    color: var(--color-muted-foreground-soft);
    font-size: 0.6875rem;
  }

  .page-body {
    flex: 1;
    min-height: 0;
    /* 仅由 #layout-inner-scroll 滚动，避免与主布局双滚动条 */
    overflow: visible;
    padding: 2.75rem 0 1.5rem;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .page-body :global(.feed-wrap) {
    margin: 0;
    padding-bottom: 1.5rem;
    max-width: none;
  }

  :global(.me-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.35);
  }

  :global(.me-dialog-content) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    background: var(--color-card-elevated);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    max-width: 420px;
    width: calc(100% - 2rem);
    overflow: auto;
  }

  :global(.me-dialog-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  :global(.me-dialog-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
  }

  :global(.me-dialog-close) {
    font-size: 1.25rem;
    line-height: 1;
    padding: 0.2rem;
    color: var(--color-muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 4px;
  }

  :global(.me-dialog-close:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  :global(.me-dialog-body) {
    padding: 1rem 1.25rem 1.25rem;
  }

  :global(.me-dialog-text) {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    line-height: 1.55;
    margin: 0 0 1rem;
  }

  :global(.me-dialog-error) {
    font-size: 0.75rem;
    color: var(--color-destructive, #b91c1c);
    margin: 0 0 0.75rem;
  }

  :global(.me-dialog-actions) {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  :global(.me-dialog-cancel) {
    font-size: 0.8125rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-background);
    color: var(--color-foreground);
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
  }

  :global(.me-dialog-confirm) {
    font-size: 0.8125rem;
    padding: 0.4rem 0.75rem;
    border: none;
    background: var(--color-destructive, #b91c1c);
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
  }

  :global(.me-dialog-confirm:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
