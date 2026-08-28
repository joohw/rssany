import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/Page'
import { cn } from '@/lib/utils'
import { ScriptCodeEditor } from '@/features/collectors/ScriptCodeEditor'

type Step = { id: string }
type DragPayload = { kind: 'step'; index: number }
type PipelineSummary = { id: string; name: string; description?: string; scope: 'builtin' | 'user'; canDelete: boolean }
type PipelineFile = PipelineSummary & { content: string; filePath: string }

const PIPELINE_DRAG_TYPE = 'application/x-rssany-pipeline'

export function PipelinePage() {
  const [steps, setSteps] = useState<Step[]>([])
  const [available, setAvailable] = useState<PipelineSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState<PipelineFile | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const uploadInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    const data = await api<{ steps?: Step[]; available?: PipelineSummary[] }>('/api/pipeline')
    setSteps(data.steps ?? [])
    setAvailable(data.available ?? [])
  }

  useEffect(() => {
    void load()
      .catch(error => toast.error(String(error)))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const arrangedIds = useMemo(() => new Set(steps.map(step => step.id)), [steps])
  const filteredAvailable = available.filter(pipeline => `${pipeline.id} ${pipeline.name} ${pipeline.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  const addStep = (id: string) => {
    if (arrangedIds.has(id)) return
    setSteps([...steps, { id }])
  }

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return
    const next = [...steps]
    const [step] = next.splice(fromIndex, 1)
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
    next.splice(adjustedIndex, 0, step)
    setSteps(next)
  }

  const moveBy = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSteps(next)
  }

  const readDragPayload = (event: React.DragEvent): DragPayload | null => {
    try {
      return JSON.parse(event.dataTransfer.getData(PIPELINE_DRAG_TYPE)) as DragPayload
    } catch {
      return null
    }
  }

  const dropAt = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    const payload = readDragPayload(event)
    setDropIndex(null)
    if (!payload) return
    moveStep(payload.index, index)
  }

  const dropIndexAt = (container: HTMLElement, clientY: number) => {
    const cards = Array.from(container.querySelectorAll<HTMLElement>('.pipeline-step-card'))
    const index = cards.findIndex(card => {
      const bounds = card.getBoundingClientRect()
      return clientY < bounds.top + bounds.height / 2
    })
    return index === -1 ? cards.length : index
  }

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: steps.map(({ id }) => ({ id, enabled: true })) }),
      })
      toast.success('流水线编排已保存')
    } catch (error) {
      toast.error(String(error))
    } finally {
      setSaving(false)
    }
  }

  const uploadPipeline = async (file: File) => {
    const id = file.name.replace(/\.rssany\.js$/i, '').replace(/\.js$/i, '')
    try {
      await api('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: await file.text() }),
      })
      await load()
      toast.success(`流水线 ${id} 已上传`)
    } catch (error) {
      toast.error(String(error))
    } finally {
      if (uploadInput.current) uploadInput.current.value = ''
    }
  }

  const openEditor = async (pipeline: PipelineSummary) => {
    try {
      setEditing(await api<PipelineFile>(`/api/pipelines/${encodeURIComponent(pipeline.id)}`))
    } catch (error) {
      toast.error(String(error))
    }
  }

  const saveEditor = async () => {
    if (!editing) return
    setEditorBusy(true)
    try {
      await api(`/api/pipelines/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editing.content }),
      })
      await load()
      setEditing(null)
      toast.success(`流水线 ${editing.id} 已更新`)
    } catch (error) {
      toast.error(String(error))
    } finally {
      setEditorBusy(false)
    }
  }

  const removePipeline = async (pipeline: PipelineSummary) => {
    if (!window.confirm(`删除流水线“${pipeline.name}”？此操作不可恢复。`)) return
    try {
      await api(`/api/pipelines/${encodeURIComponent(pipeline.id)}`, { method: 'DELETE' })
      setSteps(current => current.filter(step => step.id !== pipeline.id))
      await load()
      toast.success(`流水线 ${pipeline.id} 已删除`)
    } catch (error) {
      toast.error(String(error))
    }
  }

  return <><div className="pipeline-split">
    <section className="pipeline-catalog-pane">
      <header className="sidebar-toolbar">
        <input className={`${fieldClass} sidebar-filter-input`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索流水线…" />
        <Button size="icon-sm" onClick={() => uploadInput.current?.click()} aria-label="上传流水线" title="上传 .rssany.js"><Upload size={15} /></Button>
        <input ref={uploadInput} className="hidden" type="file" accept=".js,.rssany.js,text/javascript" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadPipeline(file) }} />
      </header>
      <div className="pipeline-catalog-list">
        {loading
          ? <div className="pipeline-pane-state">加载中…</div>
          : filteredAvailable.map(pipeline => {
            const arranged = arrangedIds.has(pipeline.id)
            return <article key={pipeline.id} className={cn('pipeline-catalog-row', arranged && 'pipeline-catalog-row--arranged')}>
              <span className="pipeline-catalog-copy" title={pipeline.description ?? pipeline.id}>
                <strong>{pipeline.name}</strong>
                <small>{pipeline.description ?? pipeline.id}</small>
              </span>
              <span className="pipeline-catalog-actions">
                {arranged
                  ? <span className="pipeline-arranged-status"><Check aria-hidden="true" />已编排</span>
                  : <button className="pipeline-add-button" type="button" onClick={() => addStep(pipeline.id)} aria-label={`添加 ${pipeline.name}`} title="添加到编排"><Plus aria-hidden="true" /></button>}
                {pipeline.scope === 'user' && <>
                  <button type="button" onClick={() => void openEditor(pipeline)} aria-label={`编辑 ${pipeline.name}`} title="编辑源码"><Pencil aria-hidden="true" /></button>
                  <button className="pipeline-delete-button" type="button" onClick={() => void removePipeline(pipeline)} aria-label={`删除 ${pipeline.name}`} title="删除"><Trash2 aria-hidden="true" /></button>
                </>}
              </span>
            </article>
          })}
        {!loading && !filteredAvailable.length && <div className="pipeline-pane-state">{available.length ? '没有匹配的流水线' : '暂无可用流水线'}</div>}
      </div>
    </section>

    <section className="pipeline-arrangement-pane">
      <header className="pipeline-arrangement-header">
        <div><h2>编排</h2><p>抓取的条目会依次经过流水线</p></div>
        <Button onClick={() => void save()} disabled={loading || saving}>{saving ? '保存中…' : '保存编排'}</Button>
      </header>
      <div
        className={cn('pipeline-arrangement-scroll', !steps.length && 'pipeline-arrangement-scroll--empty')}
        onDragOver={event => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropIndex(dropIndexAt(event.currentTarget, event.clientY))
        }}
        onDragLeave={event => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDropIndex(null)
        }}
        onDrop={event => dropAt(event, dropIndexAt(event.currentTarget, event.clientY))}
      >
        <div className="pipeline-sequence">
          {!!steps.length && <DropSlot active={dropIndex === 0} />}
          {steps.map((step, index) => <div key={step.id}>
            <article
              className="pipeline-step-card"
              draggable
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData(PIPELINE_DRAG_TYPE, JSON.stringify({ kind: 'step', index } satisfies DragPayload))
              }}
              onDragEnd={() => setDropIndex(null)}
            >
              <GripVertical className="pipeline-drag-handle" aria-label="拖拽排序" />
              <span className="pipeline-step-number">{index + 1}</span>
              <div className="pipeline-step-copy"><strong>{step.id}</strong></div>
              <div className="pipeline-step-actions">
                <button type="button" disabled={index === 0} onClick={() => moveBy(index, -1)} aria-label={`上移 ${step.id}`} title="上移"><ArrowUp /></button>
                <button type="button" disabled={index === steps.length - 1} onClick={() => moveBy(index, 1)} aria-label={`下移 ${step.id}`} title="下移"><ArrowDown /></button>
                <button type="button" className="pipeline-remove-step" onClick={() => setSteps(steps.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${step.id}`} title="从编排移除"><Trash2 /></button>
              </div>
            </article>
            <DropSlot active={dropIndex === index + 1} />
          </div>)}
          {!steps.length && !loading && <div className="grid min-h-0 flex-1 place-items-center text-center">
            <div><p className="text-sm font-medium">还没有编排流水线</p><p className="mt-1 text-xs text-muted-foreground">点击左侧项目后的添加按钮</p></div>
          </div>}
        </div>
      </div>
    </section>
  </div>
  {editing && <div className="pipeline-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !editorBusy) setEditing(null) }}>
    <section className="pipeline-editor-dialog">
      <header>
        <div><h2>{editing.name}</h2><p>{editing.filePath}</p></div>
        <div><Button onClick={() => void saveEditor()} disabled={editorBusy}>{editorBusy ? '保存中…' : '保存'}</Button><button type="button" onClick={() => setEditing(null)} disabled={editorBusy} aria-label="关闭"><X /></button></div>
      </header>
      <div className="pipeline-editor-code"><ScriptCodeEditor content={editing.content} typescript={false} onChange={content => setEditing({ ...editing, content })} /></div>
    </section>
  </div>}
  </>
}

function DropSlot({ active }: { active: boolean }) {
  return <div className={cn('pipeline-drop-slot', active && 'pipeline-drop-slot--active')}><span /></div>
}
