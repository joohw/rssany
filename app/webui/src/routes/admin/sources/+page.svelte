<script lang="ts">
  import SourcesList from '$lib/sources/SourcesList.svelte';
  import BackToParentRoute from '$lib/BackToParentRoute.svelte';
  import { PRODUCT_NAME } from '$lib/brand';
</script>

<svelte:head>
  <title>Sources — {PRODUCT_NAME}</title>
</svelte:head>

<div class="admin-sources-back">
  <BackToParentRoute />
</div>
<SourcesList />

<style>
  /** 与 SourcesList 顶栏错开，避免与 feed-wrap 负边距叠在一起时显得挤 */
  .admin-sources-back {
    padding-top: 0.35rem;
    padding-bottom: 0.15rem;
  }
</style>
