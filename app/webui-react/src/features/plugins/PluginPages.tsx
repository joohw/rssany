import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { fieldClass, Notice, Page } from '@/components/Page'
import { cn } from '@/lib/utils'
import { PluginCodeEditor } from './PluginCodeEditor'

type Plugin={id:string;name?:string;filePath?:string;scope?:string;canDelete?:boolean;source?:string}
type PluginContext={reload:()=>void}

export function PluginsLayout(){
  const nav=useNavigate();const {pathname}=useLocation();const [plugins,setPlugins]=useState<Plugin[]>([]);const [query,setQuery]=useState('');const [error,setError]=useState('')
  const load=useCallback(()=>{void api<Plugin[]>('/api/plugins').then(setPlugins).catch(e=>setError(String(e)))},[])
  useEffect(load,[load])
  const filtered=plugins.filter(p=>`${p.id} ${p.name??''}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="master-detail-layout">
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-card">
      <header className="flex items-center gap-2 px-3 py-4">
        <input className={fieldClass} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索插件"/>
        <Button size="icon-sm" onClick={()=>nav('/plugins/new')} aria-label="新建插件"><Plus size={15}/></Button>
      </header>
      {error&&<Notice error>{error}</Notice>}
      <nav className="min-h-0 flex-1 divide-y overflow-y-auto border-t" aria-label="插件列表">
        {filtered.map(p=><NavLink key={p.id} to={`/plugins/${encodeURIComponent(p.id)}`} className={({isActive})=>cn(
          'group flex min-h-14 items-center gap-2 px-3 py-2.5 hover:bg-muted',
          isActive&&'bg-primary/10 text-primary',
        )}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name||p.id}</span><span className="block truncate text-xs text-muted-foreground">{p.id}</span></span>
        </NavLink>)}
        {!filtered.length&&!error&&<p className="p-4 text-center text-xs text-muted-foreground">没有匹配的插件</p>}
      </nav>
    </aside>
    <section className={cn('min-h-0 bg-background px-5 py-6 sm:px-6', pathname==='/plugins'||pathname==='/plugins/new'?'overflow-y-auto':'overflow-hidden')}>
      <Outlet context={{reload:load} satisfies PluginContext}/>
    </section>
  </div>
}

export function PluginsPage(){
  return <div className="grid h-full place-items-center text-center"><div><p className="text-sm font-medium">插件详情</p><p className="mt-1 text-xs text-muted-foreground">从左侧选择插件，或新建一个插件。</p></div></div>
}

export function NewPluginPage(){
  const nav=useNavigate();const {reload}=useOutletContext<PluginContext>();const [id,setId]=useState('');const [pattern,setPattern]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const create=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api('/api/plugins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,listUrlPattern:pattern})});reload();nav(`/plugins/${encodeURIComponent(id.trim())}`)}catch(e){setError(String(e))}finally{setBusy(false)}}
  return <Page title="新建插件" description="从站点模板创建用户插件"><form className="space-y-4" onSubmit={create}>
    <label className="block text-[13px]">插件 ID<input className={`${fieldClass} mt-1.5`} value={id} onChange={e=>setId(e.target.value)} required placeholder="example-site"/></label>
    <label className="block text-[13px]">支持的站点<input className={`${fieldClass} mt-1.5`} value={pattern} onChange={e=>setPattern(e.target.value)} required placeholder="https://example.com/*"/></label>
    <Button type="submit" disabled={busy}>{busy?'创建中…':'创建并编辑'}</Button>{error&&<Notice error>{error}</Notice>}
  </form></Page>
}

export function PluginEditorPage(){
  const nav=useNavigate();const {reload}=useOutletContext<PluginContext>();const {id=''}=useParams();const [content,setContent]=useState('');const [path,setPath]=useState('');const [canDelete,setCanDelete]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true)
  useEffect(()=>{setLoading(true);setError('');api<{content?:string;filePath?:string;canDelete?:boolean}>(`/api/plugins/${encodeURIComponent(id)}`).then(d=>{setContent(d.content??'');setPath(d.filePath??'');setCanDelete(Boolean(d.canDelete))}).catch(e=>setError(String(e))).finally(()=>setLoading(false))},[id])
  const save=async()=>{setBusy(true);setError('');try{await api(`/api/plugins/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})})}catch(e){setError(String(e))}finally{setBusy(false)}}
  const remove=async()=>{if(!window.confirm(`删除插件 ${id}？此操作不可恢复。`))return;setBusy(true);setError('');try{await api(`/api/plugins/${encodeURIComponent(id)}`,{method:'DELETE'});reload();nav('/plugins')}catch(e){setError(String(e));setBusy(false)}}
  return <div className="flex h-full min-h-0 flex-col">
    <header className="mb-4 flex flex-none items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="truncate text-base font-semibold">{id}</h1><p className="mt-1 truncate text-xs text-muted-foreground">{path}</p></div>
      <div className="flex items-center gap-2">
        {canDelete&&<Button variant="destructive" onClick={remove} disabled={busy||loading}><Trash2 size={14}/>删除</Button>}
        <Button onClick={save} disabled={busy||loading}>{busy?'处理中…':'保存'}</Button>
      </div>
    </header>
    {error&&<Notice error>{error}</Notice>}
    {loading
      ? <div className="grid min-h-0 flex-1 place-items-center text-xs text-muted-foreground">加载中…</div>
      : <PluginCodeEditor content={content} typescript={path.endsWith('.ts')} onChange={setContent}/>}
  </div>
}
