<script lang="ts">
  import { setContext } from 'svelte';
  import AgentPage from '../routes/agent/+page.svelte';
  import { agentInOverlayKey } from '$lib/agentInOverlay';

  setContext(agentInOverlayKey, true);
</script>

<AgentPage />
