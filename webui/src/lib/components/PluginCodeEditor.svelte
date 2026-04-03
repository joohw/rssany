<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { oneDark } from '@codemirror/theme-one-dark';

  interface Props {
    content: string;
    /** 与文件扩展名一致，影响 TS/JS 高亮 */
    typescript?: boolean;
    /** 用户编辑时回调（用于标记未保存） */
    onedit?: () => void;
  }

  let { content = $bindable(''), typescript = false, onedit }: Props = $props();

  let el: HTMLDivElement | undefined;

  onMount(() => {
    if (!el) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        javascript({ typescript }),
        oneDark,
        EditorView.theme({
          '&': {
            height: 'min(70vh, 560px)',
            minHeight: '320px',
            fontSize: '0.8125rem',
            lineHeight: '1.5',
          },
          '.cm-scroller': {
            fontFamily: "ui-monospace, 'Cascadia Code', 'Consolas', monospace",
          },
        }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((e) => {
          if (e.docChanged) {
            content = e.state.doc.toString();
            onedit?.();
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: el });
    return () => view.destroy();
  });
</script>

<div class="cm-root" bind:this={el}></div>

<style>
  .cm-root {
    width: 100%;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-card);
  }
  .cm-root :global(.cm-editor) {
    height: 100%;
    border-radius: inherit;
  }
  .cm-root :global(.cm-editor.cm-focused) {
    outline: none;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
</style>
