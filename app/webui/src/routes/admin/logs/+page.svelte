<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  /** 旧路径 /admin/logs → /logs */
  onMount(() => {
    goto('/logs' + $page.url.search, { replaceState: true });
  });
</script>

<p class="muted">正在跳转…</p>

<style>
  .muted {
    margin: 0;
    padding: 1.5rem;
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
    text-align: center;
  }
</style>
