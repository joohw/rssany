<script lang="ts">
  import { goto } from '$app/navigation';

  let submitting = false;
  let errorText = '';

  async function completeInitialization() {
    submitting = true;
    errorText = '';
    try {
      const response = await fetch('/api/initialization', { method: 'POST' });
      if (!response.ok) throw new Error(`初始化失败：HTTP ${response.status}`);
      await goto('/');
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>初始化 RssAny</title>
</svelte:head>

<main class="initialize-page">
  <section class="initialize-card">
    <div class="brand">RSSANY</div>
    <h1>开始使用 RssAny</h1>
    <p>
      配置已经集中到单一的 <code>config.json</code>。完成初始化后即可添加信源、设置抓取管线和投递 Gateway。
    </p>
    <button type="button" on:click={completeInitialization} disabled={submitting}>
      {submitting ? '正在初始化…' : '完成初始化'}
    </button>
    {#if errorText}
      <p class="error" role="alert">{errorText}</p>
    {/if}
  </section>
</main>

<style>
  .initialize-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background:
      radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 32rem),
      var(--color-background);
  }

  .initialize-card {
    width: min(100%, 34rem);
    padding: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    background: var(--color-card);
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 10%);
  }

  .brand {
    margin-bottom: 1rem;
    color: var(--color-primary);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  h1 {
    margin: 0;
    color: var(--color-foreground);
    font-size: clamp(1.8rem, 5vw, 2.5rem);
  }

  p {
    margin: 1rem 0 0;
    color: var(--color-muted-foreground);
    line-height: 1.7;
  }

  code {
    color: var(--color-foreground);
  }

  button {
    width: 100%;
    margin-top: 2rem;
    padding: 0.8rem 1rem;
    border: 0;
    border-radius: 0.55rem;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .error {
    color: var(--color-destructive);
  }
</style>
