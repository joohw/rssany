import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { fieldClass, Notice, Page } from '@/components/Page'
import { cn } from '@/lib/utils'

const settingsNavigation = [
  ['/admin/update', '自动更新', '检查并安装新版本'],
  ['/admin/tags', '标签', '管理系统标签库'],
  ['/admin/llm', 'LLM', 'OpenAI 兼容 API 配置'],
  ['/admin/proxy', '代理', '全局代理与代理列表'],
  ['/admin/deliver', '投递', '下游 URL 与 Bearer 令牌'],
  ['/admin/backup', '备份与恢复', '导入导出全部信源和条目'],
] as const

export function SettingsLayout() {
  return <div className="master-detail-layout">
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-card max-md:border-b max-md:border-r-0">
      <header className="flex h-[4.5rem] flex-col justify-center border-b px-3">
        <h1 className="text-base font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-xs text-muted-foreground">管理应用配置</p>
      </header>
      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="设置项目">
        {settingsNavigation.map(([href, label, description]) =>
          <NavLink key={href} to={href} className={({ isActive }) => cn(
            'skill-chapter-button',
            isActive && 'skill-chapter-button--active',
          )}>
            <span>{label}</span>
            <small>{description}</small>
          </NavLink>)}
      </nav>
    </aside>
    <section className="settings-detail min-h-0 overflow-y-auto bg-background px-5 py-6 sm:px-6">
      <Outlet />
    </section>
  </div>
}

function SavePage({ title, description, load, save, children }: {
  title: string; description: string
  load: () => Promise<void>; save: () => Promise<void>
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setBusy(true); load().catch(e => setMessage(String(e))).finally(() => setBusy(false)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => { setBusy(true); setMessage(''); try { await save(); setMessage('已保存') } catch (e) { setMessage(String(e)) } finally { setBusy(false) } }
  return <Page title={title} description={description} actions={<Button onClick={submit} disabled={busy}>{busy ? '处理中…' : '保存'}</Button>}>
    <div className="space-y-4">{children}</div>{message && <Notice error={message !== '已保存'}>{message}</Notice>}
  </Page>
}

export function DeliverPage() {
  const [gateway, setGateway] = useState(''); const [token, setToken] = useState(''); const [test, setTest] = useState('')
  const load = async () => { const d = await api<{gateway?:string;token?:string}>('/api/deliver'); setGateway(d.gateway ?? ''); setToken(d.token ?? '') }
  const save = async () => { await api('/api/deliver', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({gateway,token}) }) }
  const testIt = async () => { setTest('测试中…'); try { await api('/api/deliver/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gateway,token})}); setTest('连接成功') } catch(e){setTest(String(e))} }
  return <SavePage title="投递" description="Pipeline 完成后向下游 POST 条目" load={load} save={save}>
    <label className="block text-sm">下游 URL<input className={`${fieldClass} mt-1.5`} value={gateway} onChange={e=>setGateway(e.target.value)} placeholder="https://example.com/webhook" /></label>
    <label className="block text-sm">Bearer Token<input className={`${fieldClass} mt-1.5`} value={token} onChange={e=>setToken(e.target.value)} type="password" /></label>
    <div className="flex items-center gap-3 pt-1"><Button variant="outline" onClick={testIt}>测试连接</Button>{test && <span className={`text-sm ${!test.includes('成功') && !test.includes('中') ? 'text-destructive' : 'text-muted-foreground'}`}>{test}</span>}</div>
  </SavePage>
}

export function LlmPage() {
  const [baseUrl,setBaseUrl]=useState(''); const [model,setModel]=useState(''); const [apiKey,setApiKey]=useState(''); const [hasKey,setHasKey]=useState(false); const [test,setTest]=useState('')
  const load=async()=>{const d=await api<{baseUrl?:string;model?:string;hasApiKey?:boolean}>('/api/llm');setBaseUrl(d.baseUrl??'');setModel(d.model??'');setHasKey(Boolean(d.hasApiKey))}
  const save=async()=>{const d=await api<{hasApiKey?:boolean}>('/api/llm',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl,model,...(apiKey?{apiKey}: {})})});setHasKey(Boolean(d.hasApiKey));setApiKey('')}
  const testIt=async()=>{setTest('测试中…');try{const d=await api<{reply?:string}>('/api/llm/test',{method:'POST'});setTest(`连接成功${d.reply?`：${d.reply}`:''}`)}catch(e){setTest(String(e))}}
  return <SavePage title="LLM" description="配置 OpenAI 兼容接口" load={load} save={save}>
    <label className="block text-sm">Base URL<input className={`${fieldClass} mt-1.5`} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} /></label>
    <label className="block text-sm">模型<input className={`${fieldClass} mt-1.5`} value={model} onChange={e=>setModel(e.target.value)} /></label>
    <label className="block text-sm">API Key<input className={`${fieldClass} mt-1.5`} value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password" placeholder={hasKey?'已配置；留空保持不变':'sk-…'} /></label>
    <div className="flex items-center gap-3 pt-1"><Button variant="outline" onClick={testIt}>测试连接</Button>{test&&<span className={`text-sm ${!test.includes('成功')&&!test.includes('中')?'text-destructive':'text-muted-foreground'}`}>{test}</span>}</div>
  </SavePage>
}

export function ProxyPage() {
  const [globalProxy,setGlobalProxy]=useState('');const [proxyList,setProxyList]=useState('')
  const load=async()=>{const d=await api<{globalProxy?:string;proxyList?:string[]}>('/api/proxy');setGlobalProxy(d.globalProxy??'');setProxyList((d.proxyList??[]).join('\n'))}
  const save=async()=>{await api('/api/proxy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({globalProxy,proxyList:proxyList.split('\n').map(x=>x.trim()).filter(Boolean)})})}
  return <SavePage title="代理" description="维护可选代理并设置全局默认值" load={load} save={save}>
    <label className="block text-sm">全局代理<input className={`${fieldClass} mt-1.5`} value={globalProxy} onChange={e=>setGlobalProxy(e.target.value)} placeholder="http://127.0.0.1:7890" /></label>
    <label className="block text-sm">代理列表（每行一个）<textarea className={`${fieldClass} mt-1.5 min-h-40 font-mono`} value={proxyList} onChange={e=>setProxyList(e.target.value)} /></label>
  </SavePage>
}

type TagStat={tag:string;count:number}
export function TagsPage(){
  const [tags,setTags]=useState<string[]>([]);const [stats,setStats]=useState<TagStat[]>([]);const [newTag,setNewTag]=useState('')
  const load=async()=>{const d=await api<{tags?:string[];stats?:TagStat[]}>('/api/tags');setTags(d.tags??[]);setStats(d.stats??[])}
  const save=async()=>{await api('/api/tags',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tags})})}
  return <SavePage title="标签" description="管理 Pipeline 使用的系统标签" load={load} save={save}>
    <form className="flex gap-2" onSubmit={e=>{e.preventDefault();const t=newTag.trim();if(t&&!tags.includes(t))setTags([...tags,t]);setNewTag('')}}><input className={fieldClass} value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="新标签" /><Button type="submit">添加</Button></form>
    <div className="flex flex-wrap gap-2">{tags.map(tag=><button key={tag} className="rounded-full border bg-card px-3 py-1.5 text-sm hover:border-destructive" title="点击移除" onClick={()=>setTags(tags.filter(t=>t!==tag))}>{tag}<span className="ml-1 text-muted-foreground">{stats.find(s=>s.tag===tag)?.count??0}</span></button>)}</div>
  </SavePage>
}

export function BackupPage() {
  const sourcesInput = useRef<HTMLInputElement>(null)
  const itemsInput = useRef<HTMLInputElement>(null)
  const [sourcesMode, setSourcesMode] = useState<'merge' | 'replace'>('merge')
  const [itemsMode, setItemsMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const exportBackup = async (kind: 'sources' | 'items') => {
    setBusy(`${kind}-export`); setMessage(''); setError(false)
    try {
      const response = await fetch(`/api/backup/${kind}`)
      if (!response.ok) throw new Error(`导出失败（HTTP ${response.status}）`)
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `rssany-${kind}-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = filename; link.click()
      URL.revokeObjectURL(url)
      setMessage(kind === 'sources' ? '信源列表已导出' : 'FeedItem 已导出')
    } catch (e) {
      setError(true); setMessage(String(e))
    } finally {
      setBusy('')
    }
  }

  const importFile = async (kind: 'sources' | 'items', file: File) => {
    setBusy(`${kind}-import`); setMessage(''); setError(false)
    try {
      const backup = JSON.parse(await file.text()) as unknown
      const mode = kind === 'sources' ? sourcesMode : itemsMode
      const result = await api<{ sources?: number; items?: number; insertedItems?: number; updatedItems?: number }>(`/api/backup/${kind}/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, backup }),
      })
      setMessage(kind === 'sources'
        ? `信源导入完成：当前共 ${result.sources ?? 0} 个信源`
        : `FeedItem 导入完成：处理 ${result.items ?? 0} 个条目（新增 ${result.insertedItems ?? 0}，更新 ${result.updatedItems ?? 0}）`)
    } catch (e) {
      setError(true); setMessage(e instanceof SyntaxError ? '所选文件不是有效的 JSON' : String(e))
    } finally {
      const input = kind === 'sources' ? sourcesInput.current : itemsInput.current
      if (input) input.value = ''
      setBusy('')
    }
  }

  return <Page title="备份与恢复" description="信源列表与 FeedItem 分别导入导出，互不影响">
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">信源列表</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">只处理信源配置，不读取或修改 FeedItem。</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void exportBackup('sources')} disabled={Boolean(busy)}>{busy === 'sources-export' ? '导出中…' : '导出信源 JSON'}</Button>
          <Button variant={sourcesMode === 'replace' ? 'destructive' : 'outline'} onClick={() => sourcesInput.current?.click()} disabled={Boolean(busy)}>{busy === 'sources-import' ? '导入中…' : '导入信源 JSON'}</Button>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sourcesMode === 'merge'} onChange={() => setSourcesMode('merge')} />合并</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sourcesMode === 'replace'} onChange={() => setSourcesMode('replace')} />替换</label>
        </div>
        <input ref={sourcesInput} className="hidden" type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile('sources', file) }} />
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">FeedItem 条目</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">只处理全部条目及正文、标签、译文和时间字段，不修改信源列表。</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void exportBackup('items')} disabled={Boolean(busy)}>{busy === 'items-export' ? '导出中…' : '导出 FeedItem JSON'}</Button>
          <Button variant={itemsMode === 'replace' ? 'destructive' : 'outline'} onClick={() => itemsInput.current?.click()} disabled={Boolean(busy)}>{busy === 'items-import' ? '导入中…' : '导入 FeedItem JSON'}</Button>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={itemsMode === 'merge'} onChange={() => setItemsMode('merge')} />合并</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={itemsMode === 'replace'} onChange={() => setItemsMode('replace')} />替换</label>
        </div>
        <input ref={itemsInput} className="hidden" type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile('items', file) }} />
      </section>
    </div>
    {message && <Notice error={error}>{message}</Notice>}
  </Page>
}
