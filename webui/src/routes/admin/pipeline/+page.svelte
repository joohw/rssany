<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';
  import { adminFetchJson } from '$lib/adminAuth';
  import { showToast } from '$lib/toastStore.js';

  interface StepConfig {
    id: string;
    enabled: boolean;
  }

  const STEP_LABELS: Record<string, string> = {
    qualityFilter: '质量过滤',
    tagger: '打标签',
    translator: '翻译',
  };

  let steps: StepConfig[] = [];
  let availableIds: string[] = [];
  let loading = true;
  let saving = false;
  let draggedIndex: number | null = null;

  async function load() {
    loading = true;
    try {
      const data = await adminFetchJson<{
        steps?: StepConfig[];
        availableIds?: string[];
      }>('/api/pipeline');
      steps = data?.steps ?? [];
      availableIds = data?.availableIds ?? [];
    } catch {
      steps = [];
      availableIds = [];
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const data = await adminFetchJson<{ ok?: boolean; message?: string; steps?: StepConfig[] }>(
        '/api/pipeline',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steps }),
        }
      );
      if (!data?.ok) throw new Error(data?.message ?? '保存失败');
      steps = data?.steps ?? steps;
      showToast('已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      saving = false;
    }
  }

  function toggleStep(index: number) {
    steps = steps.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s));
  }

  function handleDragStart(index: number) {
    draggedIndex = index;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(dropIndex: number) {
    if (draggedIndex == null) return;
    const arr = [...steps];
    const [removed] = arr.splice(draggedIndex, 1);
    arr.splice(dropIndex, 0, removed);
    steps = arr;
    draggedIndex = null;
  }

  function addStep() {
    const existing = new Set(steps.map((s) => s.id));
    const toAdd = availableIds.find((id) => !existing.has(id));
    if (!toAdd) return;
    steps = [...steps, { id: toAdd, enabled: false }];
  }

  onMount(load);
</script>

<svelte:head>
  <title>Pipeline - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="feed-header">
      <h2>Pipeline</h2>
      <p class="page-desc">
        入库前处理（打标签、翻译），可调整顺序与开关。
      </p>
    </div>

    {#if loading}
      <div class="state">加载中…</div>
    {:else}
      <div class="body">
        <section class="pipeline-section">
          <h3 class="section-title">Pipeline（入库前）</h3>
          <p class="hint">对每条新入库条目执行，顺序由上到下。</p>
          <div class="step-list" role="list">
            {#each steps as step, i}
              <div
                class="step-row"
                class:dragging={draggedIndex === i}
                role="listitem"
                draggable="true"
                on:dragstart={() => handleDragStart(i)}
                on:dragover={handleDragOver}
                on:drop={() => handleDrop(i)}
              >
                <span class="drag-handle" title="拖拽排序">⋮⋮</span>
                <label class="toggle-wrap">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    on:change={() => toggleStep(i)}
                  />
                  <span class="toggle-slider"></span>
                </label>
                <span class="step-label">{STEP_LABELS[step.id] ?? step.id}</span>
              </div>
            {/each}
          </div>
          {#if availableIds.some((id) => !steps.some((s) => s.id === id))}
            <button type="button" class="btn-add" on:click={addStep} disabled={saving}>
              + 添加步骤
            </button>
          {/if}
        </section>

        <div class="save-row">
          <button type="button" class="btn btn-primary" on:click={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .feed-wrap {
    width: 100%;
    max-width: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
    min-height: auto;
  }
  .feed-col {
    display: flex;
    flex-direction: column;
    overflow: visible;
    min-height: auto;
    background: transparent;
  }
  .feed-header {
    padding: 0.875rem 0;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .feed-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
    color: var(--color-foreground);
  }
  .page-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
  }
  .state {
    padding: 2rem;
    text-align: center;
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
  }
  .body {
    flex: 1;
    overflow: visible;
    padding: 1rem 0;
  }
  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    margin: 0 0 0.25rem;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0 0 0.5rem;
  }
  .pipeline-section {
    margin-bottom: 1.5rem;
  }
  .step-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .step-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
    cursor: grab;
  }
  .step-row:last-child {
    border-bottom: none;
  }
  .step-row.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }
  .drag-handle {
    color: var(--color-muted-foreground-soft);
    font-size: 0.875rem;
    cursor: grab;
    user-select: none;
  }
  .toggle-wrap {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .toggle-wrap input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .toggle-slider {
    width: 36px;
    height: 20px;
    background: rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    transition: background 0.2s;
  }
  .toggle-slider::after {
    content: '';
    display: block;
    width: 16px;
    height: 16px;
    background: var(--color-card-elevated);
    border-radius: 50%;
    margin: 2px 0 0 2px;
    transition: transform 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  }
  .toggle-wrap input:checked + .toggle-slider {
    background: var(--color-success);
  }
  .toggle-wrap input:checked + .toggle-slider::after {
    transform: translateX(16px);
  }
  .step-label {
    flex: 1;
    font-size: 0.875rem;
    min-width: 0;
    color: var(--color-foreground);
  }
  .btn-add {
    margin-top: 0.5rem;
    padding: 0.35rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-add:hover:not(:disabled) {
    background: var(--color-accent);
  }
  .save-row {
    margin-top: 1rem;
  }
  .btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .feed-wrap {
      max-width: 100%;
    }
  }
</style>
