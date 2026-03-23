<script lang="ts">
  /// <reference path="../lucide-svelte.d.ts" />
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import MessageCircle from 'lucide-svelte/icons/message-circle';
  import Settings from 'lucide-svelte/icons/settings';
  import FeedsNavBar from '$lib/components/FeedsNavBar.svelte';
  import { agentOverlayOpen } from '$lib/agentOverlay';
  import AgentOverlayHost from '$lib/AgentOverlayHost.svelte';
  import { syncAgentSessionFromApi } from '$lib/agentSession';
  import '../app.css';

  onMount(() => {
    if (!browser) return;
    void syncAgentSessionFromApi();
  });

  $: isFeedsRoute = $page.url.pathname === '/feeds';

  function closeAgentOverlay() {
    agentOverlayOpen.set(false);
  }

  function toggleAgentOverlay() {
    agentOverlayOpen.update((o) => !o);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!$agentOverlayOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAgentOverlay();
    }
  }

  $: if (browser) {
    document.documentElement.style.overflow = $agentOverlayOpen ? 'hidden' : '';
  }

  onDestroy(() => {
    if (browser) document.documentElement.style.overflow = '';
  });

  // Home is marketing/login only: no app chrome
  $: bareHome = $page.url.pathname === '/';

</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if bareHome}
  <div class="layout-bare">
    <slot />
  </div>
{:else}
  <div class="layout-outer">
    <header class="topbar">
      <div class="topbar-inner">
        <nav class="topbar-left" aria-label="Primary">
          <button
            type="button"
            class="topbar-link {$agentOverlayOpen ? 'topbar-link-active' : ''}"
            title="Ask"
            aria-label="Ask"
            aria-expanded={$agentOverlayOpen}
            aria-pressed={$agentOverlayOpen}
            on:click={toggleAgentOverlay}
          >
            <span class="topbar-icon"><MessageCircle size={20} /></span>
          </button>
        </nav>
        <div class="topbar-center">
          <FeedsNavBar />
        </div>
        <a href="/me" class="topbar-right" title="Settings" aria-label="Settings">
          <span class="topbar-icon"><Settings size={20} /></span>
        </a>
      </div>
    </header>
    <div id="layout-inner-scroll" class="layout-inner">
      <main class="main" class:main-feeds={isFeedsRoute}>
        <slot />
      </main>
    </div>
  </div>
  {#if $agentOverlayOpen}
    <div
      class="agent-me-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="NewsClaw"
    >
      <div class="agent-me-overlay-body">
        <AgentOverlayHost />
      </div>
    </div>
  {/if}
{/if}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Default styles only for buttons with no class; styled buttons (e.g. Tailwind) keep their own */
  :global(button:not([class])),
  :global(button[class='']) {
    font: inherit;
    cursor: pointer;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-sm, 6px);
    background: var(--color-card-elevated);
    color: var(--color-foreground);
  }
  :global(button:not([class]):hover:not(:disabled)),
  :global(button[class='']:hover:not(:disabled)) {
    background: var(--color-accent);
    border-color: var(--color-border);
  }
  :global(button:not([class]):disabled),
  :global(button[class='']:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .layout-bare {
    width: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .layout-outer {
    --shell-gutter: clamp(0.75rem, 2.5vw, 1.5rem);
    /* Same max width as main/feeds: fluid with viewport, soft cap for line length */
    --feeds-column-max: min(960px, calc(100vw - 2 * var(--shell-gutter)));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .topbar {
    flex-shrink: 0;
    width: 100%;
    z-index: 20;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }
  .topbar-inner {
    box-sizing: border-box;
    width: 100%;
    display: grid;
    /* Left: Ask/Tasks | Center: feeds (same max width as main) | Right: settings */
    grid-template-columns: 1fr minmax(0, var(--feeds-column-max)) 1fr;
    align-items: start;
    column-gap: clamp(0.5rem, 2vw, 1rem);
    padding: 0.65rem var(--shell-gutter);
  }
  .topbar-left {
    display: flex;
    flex-direction: row;
    gap: 0.2rem;
    align-items: center;
    justify-self: start;
    justify-content: flex-start;
    flex-shrink: 0;
  }
  .topbar-center {
    min-width: 0;
    width: 100%;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    padding-top: 0.1rem;
  }
  .layout-inner {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    padding-top: 0.75rem;
    padding-inline: var(--shell-gutter);
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
  }
  .topbar-link {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-foreground);
    text-decoration: none;
    padding: 0.45rem;
    border-radius: var(--radius-sm, 6px);
    transition: color 0.12s ease, background 0.12s ease;
  }
  button.topbar-link {
    appearance: none;
    border: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .topbar-link:hover {
    color: var(--color-accent-foreground);
    background: var(--color-muted);
  }
  .topbar-link-active {
    color: var(--color-primary-foreground);
    background: var(--color-primary);
  }
  .topbar-link-active:hover {
    color: var(--color-primary-foreground);
    background: var(--color-primary-hover);
  }
  .topbar-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }
  .topbar-icon :global(svg) {
    width: 20px;
    height: 20px;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: end;
    color: var(--color-muted-foreground);
    padding: 0.5rem;
    border-radius: 8px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar-right:hover {
    color: var(--color-primary);
    background: var(--color-muted);
  }
  .main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    width: 100%;
    max-width: var(--feeds-column-max);
    margin-left: auto;
    margin-right: auto;
  }
  .main-feeds {
    display: flex;
    flex-direction: column;
  }

  .agent-me-overlay {
    --shell-gutter: clamp(0.75rem, 2.5vw, 1.5rem);
    --feeds-column-max: min(960px, calc(100vw - 2 * var(--shell-gutter)));
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--color-background);
    overflow: hidden;
  }
  .agent-me-overlay-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
