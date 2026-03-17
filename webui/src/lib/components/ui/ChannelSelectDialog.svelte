<script lang="ts">
  import { Popover } from 'bits-ui';

  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  export let onSelect: ((channelId: string) => void) | undefined = undefined;
  export let channels: { id: string; title: string }[] = [];
  export let currentChannelId = 'all';
  export let triggerLabel = '频道';

  function select(channelId: string) {
    onSelect?.(channelId);
    onClose?.();
  }

  function handleOpenChange(v: boolean) {
    if (!v) onClose?.();
  }
</script>

<Popover.Root bind:open onOpenChange={handleOpenChange}>
  <Popover.Trigger class="filter-tag-btn">
    {triggerLabel}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="dropdown-panel"
      sideOffset={4}
      align="start"
    >
      <div class="channel-chips">
        <button
          type="button"
          class="channel-chip"
          class:active={currentChannelId === 'all'}
          on:click={() => select('all')}
        >
          全部
        </button>
        {#each channels as ch}
          <button
            type="button"
            class="channel-chip"
            class:active={currentChannelId === ch.id}
            on:click={() => select(ch.id)}
          >
            {ch.title}
          </button>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.filter-tag-btn) {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    color: var(--color-muted-foreground);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  :global(.filter-tag-btn:hover) {
    background: var(--color-accent);
    color: var(--color-accent-foreground);
  }
  /* Popover.Content 在 Portal 中渲染，需 :global */
  :global(.dropdown-panel) {
    z-index: 50;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    overflow: auto;
    max-height: min(70vh, 320px);
  }
  .channel-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.75rem;
  }
  .channel-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.65rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: var(--color-muted);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .channel-chip:hover {
    background: var(--color-accent);
    color: var(--color-accent-foreground);
  }
  .channel-chip.active {
    color: var(--color-primary-foreground);
    background: var(--color-primary);
  }
</style>
