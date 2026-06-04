<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  /** 旧「新建插件」独立页：改为列表页上的 Dialog，保留此路由以免外链失效 */
  onMount(() => {
    goto('/plugins?openAdd=1', { replaceState: true });
  });
</script>

<svelte:head>
  <title>插件</title>
</svelte:head>

<p class="redirect-msg">正在打开添加插件…</p>

<style>
  .redirect-msg {
    margin: 0;
    padding: 1.5rem;
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
    text-align: center;
  }
</style>
