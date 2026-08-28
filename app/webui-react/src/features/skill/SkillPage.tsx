import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { marked } from 'marked'
import { BookOpen } from 'lucide-react'
import { getSkill, type SkillBundleMetadata } from '@/api/server'
import { Button } from '@/components/ui/button'

export function SkillPage() {
  const [bundle, setBundle] = useState<SkillBundleMetadata | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [selectedPath, setSelectedPath] = useState('SKILL.md')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setBundle(await getSkill())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const activeChapter = bundle?.chapters.find(chapter => chapter.path === selectedPath) ?? bundle?.chapters[0]
  const renderedChapter = useMemo(() => {
    if (!activeChapter) return ''
    const markdown = activeChapter.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
    return marked.parse(markdown, { async: false }) as string
  }, [activeChapter])

  const copy = async () => {
    if (!activeChapter) return
    await navigator.clipboard.writeText(activeChapter.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const openMarkdownLink = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href || !bundle) return
    const target = activeChapter?.path === 'SKILL.md'
      ? href
      : `references/${href.replace(/^\.\//u, '')}`
    if (!bundle.chapters.some(chapter => chapter.path === target)) return
    event.preventDefault()
    setSelectedPath(target)
  }

  return <div className="skill-split">
    <aside className="skill-chapter-pane">
      <header className="skill-chapter-header">
        <div><h1>RssAny Skill</h1><p>供 Agent 使用的操作知识包</p></div>
      </header>
      <div className="skill-chapter-heading"><BookOpen aria-hidden="true" /><span>章节</span></div>
      <nav aria-label="Skill 章节">
        {bundle?.chapters.map(chapter => <button
          key={chapter.path}
          type="button"
          className={chapter.path === activeChapter?.path ? 'skill-chapter-button skill-chapter-button--active' : 'skill-chapter-button'}
          onClick={() => setSelectedPath(chapter.path)}
        >
          <span>{chapter.title}</span>
          <small>{chapter.path}</small>
        </button>)}
        {loading && !bundle && <p className="skill-pane-state">正在读取…</p>}
      </nav>
    </aside>
    <section className="skill-preview-pane">
      <header>
        <div><h2>{activeChapter?.title ?? '预览'}</h2><p>{activeChapter?.path ?? '选择左侧章节'}</p></div>
        <div className="skill-preview-actions">
          <Button variant="outline" onClick={() => void copy()} disabled={!activeChapter}>{copied ? '已复制' : '复制本章'}</Button>
          {bundle
            ? <Button asChild><a href={bundle.downloadUrl} download>下载 ZIP</a></Button>
            : <Button disabled>下载 ZIP</Button>}
        </div>
      </header>
      {error
        ? <p className="skill-pane-state text-destructive" role="alert">{error}</p>
        : <div
            className="skill-markdown"
            onClick={openMarkdownLink}
            dangerouslySetInnerHTML={{ __html: renderedChapter }}
          />}
    </section>
  </div>
}
