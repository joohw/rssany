<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { resetMeStores, setMeUserFromAuthBody } from '$lib/meAreaStore';

  /**
   * 鉴权只放在 /me 子树：根布局始终挂顶栏。
   * 首次进入 /me 时校验；在 /me 内跳转时本 layout 不卸载，ready 保持 true，顶栏不会「刷新」。
   * 同时将用户信息写入 meUser，供子页面复用，避免重复请求 /api/auth/me。
   */
  let ready = false;

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        resetMeStores();
        await goto('/', { replaceState: true });
        return;
      }
      const data = await res.json();
      setMeUserFromAuthBody(data);
    } catch {
      resetMeStores();
      await goto('/', { replaceState: true });
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <div class="me-root">
    <slot />
  </div>
{:else}
  <div class="me-auth-pending" aria-busy="true"></div>
{/if}

<style>
  .me-root {
    box-sizing: border-box;
    width: 100%;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .me-auth-pending {
    flex: 1;
    min-height: 12rem;
    min-width: 0;
  }
</style>
