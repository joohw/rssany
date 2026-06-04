<script lang="ts">
  import SourcesList from '$lib/sources/SourcesList.svelte';
  import { PRODUCT_NAME } from '$lib/brand';
</script>

<svelte:head>
  <title>Sources — {PRODUCT_NAME}</title>
  <meta
    name="description"
    content="Subscribed sources: labels, counts, pull and manage feeds."
  />
</svelte:head>

<SourcesList />
