<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Toast from '$lib/components/ui/Toast.svelte';

  /** 仅 role 为 admin 的用户可访问 /admin/*；与后端 requireAdmin（users.role === 'admin'）一致 */
  let ready = false;

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        await goto('/', { replaceState: true });
        return;
      }
      const data = (await res.json()) as { user?: { role?: string } };
      if (data?.user?.role !== 'admin') {
        await goto('/', { replaceState: true });
        return;
      }
    } catch {
      await goto('/', { replaceState: true });
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <div class="admin-auth-pending" aria-busy="true"></div>
{/if}
<Toast />

<style>
  .admin-auth-pending {
    flex: 1;
    min-height: 12rem;
    min-width: 0;
  }
</style>
