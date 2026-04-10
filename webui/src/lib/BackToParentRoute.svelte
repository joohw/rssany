<script lang="ts">
  import { page } from '$app/stores';

  /**
   * 上一层路径：/admin/tags → /admin；/plugins/foo → /plugins；
   * 根下独立页 /plugins、/logs → 首页 /；/admin 不设返回。
   */
  function parentHref(pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) {
      if (parts[0] === 'admin') return null;
      if (parts[0] === 'plugins' || parts[0] === 'logs') return '/';
      return null;
    }
    parts.pop();
    return '/' + parts.join('/');
  }

  $: href = parentHref($page.url.pathname);
</script>

{#if href}
  <a
    class="back-to-parent admin-toolbar-btn admin-toolbar-btn--secondary"
    href={href}
    data-sveltekit-preload-data="hover"
    aria-label="返回上一层"
  >
    返回
  </a>
{/if}

<style>
  /** 与正文区拉开距离；外观见 app.css 中 .admin-toolbar-btn */
  .back-to-parent {
    margin: 0 0 1.125rem;
    text-decoration: none;
    width: fit-content;
  }
</style>
