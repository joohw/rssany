import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FileArchive, Server } from 'lucide-react'
import { getSkill, type SkillBundleMetadata } from '@/api/server'
import { Button } from '@/components/ui/button'
import { Notice, Page } from '@/components/Page'

export function SkillPage() {
  const [bundle, setBundle] = useState<SkillBundleMetadata | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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

  const copy = async () => {
    if (!bundle) return
    await navigator.clipboard.writeText(bundle.skill)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const actions = <div className="flex flex-wrap items-center justify-end gap-2">
    <Button variant="outline" onClick={() => void copy()} disabled={!bundle}>
      {copied ? '已复制' : '复制 SKILL.md'}
    </Button>
    {bundle
      ? <Button asChild><a href={bundle.downloadUrl} download>下载完整 ZIP</a></Button>
      : <Button disabled>下载完整 ZIP</Button>}
  </div>

  return <Page
    title="RssAny Skill"
    description="供 Agent 使用的官方操作、MCP、插件开发与排错知识包"
    actions={actions}
    className="flex h-full min-h-0 flex-col"
  >
    {error && <Notice error>{error}</Notice>}

    {bundle && <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <InfoCard icon={<FileArchive />} label="Skill 版本" value={bundle.version} />
        <InfoCard icon={<Server />} label="本地 MCP" value={`${window.location.origin}/mcp/sse`} />
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">SKILL.md</h2>
          <span className="text-xs text-muted-foreground">详细内容按需读取 references/</span>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-5 text-sm leading-6">{bundle.skill}</pre>
      </section>
    </div>}

    {loading && !bundle && <p className="py-16 text-center text-sm text-muted-foreground">正在读取官方 Skill…</p>}
  </Page>
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border bg-card p-4">
    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
    <p className="truncate text-sm font-medium" title={value}>{value}</p>
  </div>
}
