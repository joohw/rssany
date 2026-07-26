import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'

export function PluginCodeEditor({ content, typescript, onChange }: {
  content: string
  typescript?: boolean
  onChange: (content: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const initialContentRef = useRef(content)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!rootRef.current) return
    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        basicSetup,
        javascript({ typescript }),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
            minHeight: '0',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: '0.8125rem',
            lineHeight: '1.5',
          },
          '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
          '.cm-gutters': {
            minWidth: '2.75rem',
            backgroundColor: 'var(--background)',
            color: 'var(--muted-foreground)',
            borderRight: '1px solid var(--border)',
          },
          '.cm-activeLine, .cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 7%, transparent)',
          },
          '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--foreground)' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'color-mix(in srgb, var(--primary) 22%, transparent)',
          },
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: rootRef.current })
    return () => view.destroy()
  }, [typescript])

  return <div ref={rootRef} className="plugin-code-editor" />
}
