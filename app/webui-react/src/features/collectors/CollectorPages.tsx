import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { Plus } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { fieldClass, Notice, Page } from '@/components/Page'
import { cn } from '@/lib/utils'
import { ScriptCodeEditor } from './ScriptCodeEditor'

type Collector={id:string;name?:string;filePath?:string;scope?:string;canDelete?:boolean;source?:string}
type CollectorContext={reload:()=>void}

export function CollectorsLayout(){
  const nav=useNavigate();const {pathname}=useLocation();const [collectors,setCollectors]=useState<Collector[]>([]);const [query,setQuery]=useState('');const [error,setError]=useState('')
  const load=useCallback(()=>{void api<Collector[]>('/api/collectors').then(setCollectors).catch(e=>setError(String(e)))},[])
  useEffect(load,[load])
  const filtered=collectors.filter(collector=>`${collector.id} ${collector.name??''}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="master-detail-layout">
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-card">
      <header className="sidebar-toolbar">
        <input className={`${fieldClass} sidebar-filter-input`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索采集器"/>
        <Button size="icon-sm" onClick={()=>nav('/collectors/new')} aria-label="新建采集器"><Plus size={15}/></Button>
      </header>
      <nav className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="采集器列表">
        {error&&<div className="sidebar-error"><Notice error>{error}</Notice></div>}
        {filtered.map(collector=><NavLink key={collector.id} to={`/collectors/${encodeURIComponent(collector.id)}`} className={({isActive})=>cn(
          'group flex min-h-14 items-center gap-2 px-3 py-2.5 hover:bg-muted',
          isActive&&'bg-primary/10 text-primary',
        )}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{collector.name||collector.id}</span><span className="block truncate text-xs text-muted-foreground">{collector.id}</span></span>
        </NavLink>)}
        {!filtered.length&&!error&&<p className="p-4 text-center text-xs text-muted-foreground">没有匹配的采集器</p>}
      </nav>
    </aside>
    <section className={cn(
      'min-h-0 bg-background',
      pathname==='/collectors'||pathname==='/collectors/new'
        ? 'overflow-y-auto px-5 py-6 sm:px-6'
        : 'overflow-hidden',
    )}>
      <Outlet context={{reload:load} satisfies CollectorContext}/>
    </section>
  </div>
}

export function CollectorsPage(){
  return <div className="grid h-full place-items-center text-center"><div><p className="text-sm font-medium">采集器详情</p><p className="mt-1 text-xs text-muted-foreground">从左侧选择采集器，或新建一个采集器。</p></div></div>
}

export function NewCollectorPage(){
  const nav=useNavigate();const {reload}=useOutletContext<CollectorContext>();const [id,setId]=useState('');const [pattern,setPattern]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const create=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api('/api/collectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,listUrlPattern:pattern})});reload();nav(`/collectors/${encodeURIComponent(id.trim())}`)}catch(e){setError(String(e))}finally{setBusy(false)}}
  return <Page title="新建采集器" description="从站点模板创建用户采集器"><form className="space-y-4" onSubmit={create}>
    <label className="block text-[13px]">采集器 ID<input className={`${fieldClass} mt-1.5`} value={id} onChange={e=>setId(e.target.value)} required placeholder="example-site"/></label>
    <label className="block text-[13px]">支持的站点<input className={`${fieldClass} mt-1.5`} value={pattern} onChange={e=>setPattern(e.target.value)} required placeholder="https://example.com/*"/></label>
    <Button type="submit" disabled={busy}>{busy?'创建中…':'创建并编辑'}</Button>{error&&<Notice error>{error}</Notice>}
  </form></Page>
}

export function CollectorEditorPage(){
  const nav=useNavigate();const {reload}=useOutletContext<CollectorContext>();const {id=''}=useParams();const [content,setContent]=useState('');const [path,setPath]=useState('');const [canDelete,setCanDelete]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true)
  useEffect(()=>{setLoading(true);setError('');api<{content?:string;filePath?:string;canDelete?:boolean}>(`/api/collectors/${encodeURIComponent(id)}`).then(d=>{setContent(d.content??'');setPath(d.filePath??'');setCanDelete(Boolean(d.canDelete))}).catch(e=>setError(String(e))).finally(()=>setLoading(false))},[id])
  const save=async()=>{setBusy(true);setError('');try{await api(`/api/collectors/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})})}catch(e){setError(String(e))}finally{setBusy(false)}}
  const remove=async()=>{if(!window.confirm(`删除采集器 ${id}？此操作不可恢复。`))return;setBusy(true);setError('');try{await api(`/api/collectors/${encodeURIComponent(id)}`,{method:'DELETE'});reload();nav('/collectors')}catch(e){setError(String(e));setBusy(false)}}
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex flex-none items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
      <div className="min-w-0"><h1 className="truncate text-base font-semibold">{id}</h1><p className="mt-1 truncate text-xs text-muted-foreground">{path}</p></div>
      <div className="flex items-center gap-2">
        {canDelete&&<Button variant="destructive" onClick={remove} disabled={busy||loading}>删除</Button>}
        <Button onClick={save} disabled={busy||loading}>{busy?'处理中…':'保存'}</Button>
      </div>
    </header>
    {error&&<Notice error>{error}</Notice>}
    {loading
      ? <div className="grid min-h-0 flex-1 place-items-center text-xs text-muted-foreground">加载中…</div>
      : <ScriptCodeEditor content={content} typescript={path.endsWith('.ts')} onChange={setContent}/>}
  </div>
}
