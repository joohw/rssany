<script lang="ts">
  import { PRODUCT_NAME } from "$lib/brand";
  import { adminFetch } from "$lib/adminAuth";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Dialog } from "bits-ui";
  import Plus from "lucide-svelte/icons/plus";
  import { showToast } from "$lib/toastStore.js";

  interface Plugin {
    id: string;
    listUrlPattern: string;
    hasAuth: boolean;
    kind?: "site" | "source";
  }

  let plugins: Plugin[] = [];
  let loadError = "";
  let loading = true;

  let showAddDialog = false;
  let newPluginId = "";
  /** 对应插件内 listUrlPattern，用于匹配订阅 ref / 站点 URL */
  let newListUrlPattern = "";
  let addBusy = false;
  let filterQuery = "";

  $: filterLower = filterQuery.trim().toLowerCase();
  $: filteredPlugins = filterLower
    ? plugins.filter(
        (p) =>
          p.id.toLowerCase().includes(filterLower) ||
          p.listUrlPattern.toLowerCase().includes(filterLower),
      )
    : plugins;

  function openAddDialog() {
    newPluginId = "";
    newListUrlPattern = "";
    showAddDialog = true;
  }

  function onAddDialogOpenChange(open: boolean) {
    showAddDialog = open;
    if (!open) {
      newPluginId = "";
      newListUrlPattern = "";
    }
  }

  async function submitNewPlugin(e: Event) {
    e.preventDefault();
    const id = newPluginId.trim();
    const listUrlPattern = newListUrlPattern.trim();
    if (!id) {
      showToast("请填写插件 id", "error");
      return;
    }
    if (!listUrlPattern) {
      showToast("请填写支持的站点（URL 或匹配规则）", "error");
      return;
    }
    addBusy = true;
    try {
      const res = await adminFetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, listUrlPattern }),
      });
      const txt = await res.text();
      let j: { error?: string; ok?: boolean } = {};
      try {
        j = txt ? (JSON.parse(txt) as { error?: string; ok?: boolean }) : {};
      } catch {
        j = {};
      }
      if (!res.ok) {
        showToast(j.error || txt || `HTTP ${res.status}`, "error");
        return;
      }
      if (j.ok) {
        showToast("已创建插件文件", "success");
        showAddDialog = false;
        newPluginId = "";
        newListUrlPattern = "";
        await loadPlugins();
        await goto("/plugins/" + encodeURIComponent(id));
      }
    } catch (err) {
      showToast(
        "请求失败: " + (err instanceof Error ? err.message : String(err)),
        "error",
      );
    } finally {
      addBusy = false;
    }
  }

  async function loadPlugins() {
    loading = true;
    loadError = "";
    try {
      const res = await adminFetch("/api/plugins");
      const list = (await res.json()) as Plugin[];
      // 需要登录的放前面
      plugins = [...list].sort(
        (a, b) => (b.hasAuth ? 1 : 0) - (a.hasAuth ? 1 : 0),
      );
    } catch (err) {
      loadError =
        "加载失败: " + (err instanceof Error ? err.message : String(err));
    } finally {
      loading = false;
    }
  }

  async function checkAuth(plugin: Plugin, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await adminFetch(
        `/auth/check?siteId=${encodeURIComponent(plugin.id)}`,
      );
      const result = await res.json();
      if (result.ok) {
        showToast(
          `${plugin.id}：${result.authenticated ? "✓ 已登录" : "✗ 未登录"}`,
          result.authenticated ? "success" : "error",
        );
      } else {
        showToast(result.message || "检查失败", "error");
      }
    } catch (err) {
      showToast(
        "请求失败: " + (err instanceof Error ? err.message : String(err)),
        "error",
      );
    }
  }

  async function openLogin(plugin: Plugin, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await adminFetch(
        `/auth/open?siteId=${encodeURIComponent(plugin.id)}`,
        { method: "POST" },
      );
      const result = await res.json();
      if (result.ok) {
        showToast(result.message || "已打开登录页面", "success");
      } else {
        showToast(result.message || "打开失败", "error");
      }
    } catch (err) {
      showToast(
        "请求失败: " + (err instanceof Error ? err.message : String(err)),
        "error",
      );
    }
  }

  onMount(() => {
    loadPlugins();
    const url = get(page).url;
    if (url.searchParams.get("openAdd") === "1") {
      newPluginId = "";
      newListUrlPattern = "";
      showAddDialog = true;
      goto("/plugins", { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>插件 - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="plugins-toolbar-block">
      <div class="feed-header">
        <div class="header-left">
          <input
            class="filter-input"
            type="search"
            placeholder="过滤…"
            bind:value={filterQuery}
            autocomplete="off"
            spellcheck={false}
          />
        </div>
        <div class="header-right">
          <button
            type="button"
            class="btn-add"
            title="添加插件"
            aria-label="添加插件"
            onclick={openAddDialog}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <div class="plugins-body-scroll">
      {#if loading}
        <div class="state">加载中…</div>
      {:else if loadError}
        <div class="state error">{loadError}</div>
      {:else if plugins.length === 0}
        <div class="state">
          暂无已加载插件。可
          <button type="button" class="link-btn" onclick={openAddDialog}
            >添加插件</button
          >
          从模板创建，或在 <code>app/plugins/builtin/</code>、<code
            >.rssany/plugins/</code
          > 放置 *.rssany.js / *.rssany.ts
        </div>
      {:else if filteredPlugins.length === 0}
        <div class="state">无匹配结果</div>
      {:else}
        <div class="plugin-table-wrap">
          <table class="plugin-table">
            <thead>
              <tr>
                <th class="th-name" scope="col">插件名</th>
                <th class="th-pattern" scope="col">匹配规则</th>
                <th class="th-login" scope="col">登录</th>
                <th class="th-check" scope="col">检查登录</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredPlugins as plugin (plugin.id)}
                <tr class="plugin-row">
                  <td class="td-name">
                    <div class="name-cell">
                      <a
                        class="plugin-id-link"
                        href="/plugins/{encodeURIComponent(plugin.id)}"
                        >{plugin.id}</a
                      >
                      {#if plugin.kind === "source"}
                        <span class="kind-badge">Source</span>
                      {/if}
                    </div>
                  </td>
                  <td class="td-pattern">
                    <span class="pattern-text" title={plugin.listUrlPattern}
                      >{plugin.listUrlPattern}</span
                    >
                  </td>
                  <td class="td-login">
                    {#if plugin.hasAuth}
                      <button
                        type="button"
                        class="cell-btn cell-btn--primary"
                        onclick={(e) => openLogin(plugin, e)}>登录</button
                      >
                    {:else}
                      <span class="cell-dash" title="未声明站点登录">—</span>
                    {/if}
                  </td>
                  <td class="td-check">
                    {#if plugin.hasAuth}
                      <button
                        type="button"
                        class="cell-btn cell-btn--secondary"
                        onclick={(e) => checkAuth(plugin, e)}>检查登录</button
                      >
                    {:else}
                      <span class="cell-dash" title="未声明站点登录">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</div>

<Dialog.Root open={showAddDialog} onOpenChange={onAddDialogOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" aria-describedby={undefined}>
      <div class="modal-header">
        <Dialog.Title class="modal-title">添加插件</Dialog.Title>
        <Dialog.Close class="modal-close" aria-label="关闭">✕</Dialog.Close>
      </div>
      <form class="modal-body" onsubmit={submitNewPlugin}>
        <p class="add-hint">
          对于不支持RSS的站点，添加插件可以覆盖特定站点的解析规则
        </p>
        <div class="field">
          <span class="field-label">站点匹配规则</span>
          <input
            class="field-input"
            type="text"
            name="listUrlPattern"
            bind:value={newListUrlPattern}
            placeholder="例如 https://www.example.com/* 或 https://example.com/list/&#123;segment&#125;"
            autocomplete="off"
            spellcheck={false}
          />
        </div>
        <div class="field">
          <span class="field-label">插件 id</span>
          <input
            class="field-input"
            type="text"
            name="pluginId"
            bind:value={newPluginId}
            placeholder="例如 my-site"
            autocomplete="off"
            spellcheck={false}
          />
        </div>

        <div class="modal-footer">
          <div class="modal-footer-right">
            <Dialog.Close class="btn-cancel" disabled={addBusy} type="button"
              >取消</Dialog.Close
            >
            <button type="submit" class="btn-save" disabled={addBusy}
              >{addBusy ? "创建中…" : "创建并打开编辑"}</button
            >
          </div>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /**
   * 与首页信源列表一致：对消 main padding；顶栏过滤 + 添加；仅 `.plugins-body-scroll` 内滚动。
   * 与 SourcesList 相同：`--feed-sticky-gap-after: 0`，避免工具栏底边线与表格表头之间出现全局默认 1rem 空隙。
   */
  .feed-wrap {
    --feed-sticky-gap-after: 0;
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

  .plugins-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: var(--feed-sticky-gap-after);
  }

  .feed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .filter-input {
    flex: 1;
    min-width: 7rem;
    max-width: 18rem;
    width: auto;
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm);
    outline: none;
    background: var(--color-card-elevated);
    color: var(--color-foreground);
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .filter-input:focus {
    border-color: var(--color-primary);
    background: var(--color-card);
  }
  .filter-input::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .btn-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    flex-shrink: 0;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  .btn-add:hover {
    opacity: 0.9;
    background: var(--color-primary-hover, var(--color-primary));
  }

  .plugins-body-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .plugins-body-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .plugins-body-scroll::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 2px;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--color-primary);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    font-size: inherit;
  }
  .link-btn:hover {
    color: var(--color-primary-hover);
  }
  .state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .state.error {
    color: var(--color-destructive);
  }

  .plugin-table-wrap {
    width: 100%;
    min-width: min(100%, 520px);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .plugin-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  .plugin-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-card-elevated);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-muted-foreground-soft);
    text-align: left;
    padding: 0.55rem 0.5rem 0.6rem 0;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .th-pattern {
    width: 38%;
  }
  .th-login,
  .th-check {
    width: 6.5rem;
    text-align: right;
  }
  .plugin-table tbody td {
    padding: 0.55rem 0.5rem 0.55rem 0;
    font-size: 0.8125rem;
    vertical-align: middle;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .plugin-row:hover {
    background: var(--color-muted);
  }
  .plugin-row:last-child td {
    border-bottom: none;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    min-width: 0;
  }
  .kind-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-muted-foreground-strong);
    border: 1px solid var(--color-border-muted);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
  }
  .plugin-id-link {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-foreground);
    text-decoration: none;
  }
  .plugin-id-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .pattern-text {
    display: block;
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
    color: var(--color-muted-foreground-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .td-login,
  .td-check {
    text-align: right;
    white-space: nowrap;
  }
  .cell-dash {
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
  }
  .cell-btn {
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
  }
  .cell-btn--primary {
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .cell-btn--primary:hover {
    opacity: 0.92;
    background: var(--color-primary-hover, var(--color-primary));
  }
  .cell-btn--secondary {
    background: var(--color-muted);
    color: var(--color-foreground);
    border: 1px solid var(--color-border);
  }
  .cell-btn--secondary:hover {
    background: var(--color-accent);
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
    .th-pattern {
      width: 28%;
    }
  }

  /* bits-ui Dialog Portal */
  :global(.modal-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
  }
  :global(.modal) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--color-card-elevated);
    border-radius: 10px;
    width: calc(100% - 2rem);
    max-width: 520px;
    box-shadow: var(--shadow-panel);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 101;
  }
  :global(.modal) .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--color-border-muted);
  }
  :global(.modal-title) {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
  }
  :global(.modal-close) {
    background: none;
    border: none;
    padding: 0.25rem;
    font-size: 1rem;
    color: var(--color-muted-foreground);
    cursor: pointer;
    line-height: 1;
    border-radius: 4px;
  }
  :global(.modal-close:hover) {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .modal-body {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .add-hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--color-muted-foreground-soft);
  }
  .add-hint code {
    font-size: 0.68rem;
    word-break: break-all;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field-label {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
  }
  .field-input {
    padding: 0.5rem 0.65rem;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-input);
    background: var(--color-card);
    color: var(--color-foreground);
    font-family: ui-monospace, monospace;
    font-size: 0.875rem;
    width: 100%;
    outline: none;
  }
  .field-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.25rem;
    border-top: none;
  }
  .modal-footer-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  :global(.btn-cancel) {
    padding: 0.4rem 1rem;
    font-size: 0.875rem;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.btn-cancel:hover:not(:disabled)) {
    background: var(--color-accent);
  }
  .btn-save {
    padding: 0.4rem 1.2rem;
    font-size: 0.875rem;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-save:hover:not(:disabled) {
    opacity: 0.85;
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
