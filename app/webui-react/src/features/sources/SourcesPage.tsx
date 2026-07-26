import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpDown, CloudDownload, Copy, ExternalLink, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Trash, Trash2, X } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fieldClass, Notice } from '@/components/Page'
import { FeedItemCard, type FeedItem } from './FeedItemCard'

type Source={ref:string;label?:string;description?:string;refresh?:string;proxy?:string;weight?:number}
type Feed={items?:FeedItem[];hasMore?:boolean}
type SourceStat={source_url:string;count:number}
type PullStatus={ref:string;status:'idle'|'pending'|'running'|'done'|'error';pending:number;running:number;error?:string}
type SourceSort='configured'|'name-asc'|'name-desc'|'count-desc'|'count-asc'
const intervals=['10min','30min','1h','6h','12h','1day','3day','7day']
const sourceNameCollator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})

export function SourcesPage(){
  const [sources,setSources]=useState<Source[]>([]);const [stats,setStats]=useState<Record<string,number>>({});const [items,setItems]=useState<FeedItem[]>([]);const [selected,setSelected]=useState<Source|null>(null);const [editing,setEditing]=useState<Source|null>(null);const [adding,setAdding]=useState(false);const [query,setQuery]=useState('');const [sort,setSort]=useState<SourceSort>('configured');const [error,setError]=useState('');const [pullingRefs,setPullingRefs]=useState<Record<string,boolean>>({});const [itemsLoading,setItemsLoading]=useState(false)
  const detailRequestId=useRef(0)
  const detailAbortController=useRef<AbortController|null>(null)
  const selectedRef=useRef<Source|null>(null)
  const load=useCallback(async()=>{try{const [raw,rows]=await Promise.all([api<{sources?:Source[]}>('/api/sources/raw'),api<SourceStat[]>('/api/sources/stats').catch(()=>[])]);setSources(raw.sources??[]);setStats(Object.fromEntries(rows.map(row=>[canonicalSourceRef(row.source_url),row.count])))}catch(e){setError(String(e))}},[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>()=>detailAbortController.current?.abort(),[])
  const open=useCallback(async(s:Source)=>{
    const requestId=++detailRequestId.current
    detailAbortController.current?.abort()
    const controller=new AbortController()
    detailAbortController.current=controller
    selectedRef.current=s;setSelected(s);setItems([]);setItemsLoading(true);setError('')
    try{
      let d:Feed
      try{
        d=await api<Feed>(`/api/items?ref=${encodeURIComponent(s.ref)}&limit=100`,{signal:controller.signal})
      }catch(e){
        if(controller.signal.aborted)throw e
        d=await api<Feed>(`/api/feed?ref=${encodeURIComponent(s.ref)}&limit=100`,{signal:controller.signal})
      }
      if(requestId===detailRequestId.current)setItems(d.items??[])
    }catch(e){
      if(!controller.signal.aborted&&requestId===detailRequestId.current){setItems([]);setError(String(e))}
    }finally{
      if(requestId===detailRequestId.current){setItemsLoading(false);detailAbortController.current=null}
    }
  },[])
  useEffect(()=>{
    const events=new EventSource('/api/sources/pull-status/events')
    events.onmessage=event=>{
      const data=JSON.parse(event.data) as {type:'snapshot';sources:PullStatus[]}|{type:'status';source:PullStatus}
      const statuses=data.type==='snapshot'?data.sources:[data.source]
      setPullingRefs(current=>{
        const next:Record<string,boolean>=data.type==='snapshot'?{}:{...current}
        for(const status of statuses){
          const key=canonicalSourceRef(status.ref)
          if(status.status==='pending'||status.status==='running')next[key]=true
          else delete next[key]
        }
        return next
      })
      if(data.type==='status'&&(data.source.status==='done'||data.source.status==='error')){
        void load()
        const current=selectedRef.current
        if(current&&canonicalSourceRef(current.ref)===canonicalSourceRef(data.source.ref))void open(current)
        if(data.source.status==='error'&&data.source.error)setError(data.source.error)
      }
    }
    return()=>events.close()
  },[load,open])
  const closeDetails=()=>{detailRequestId.current+=1;detailAbortController.current?.abort();detailAbortController.current=null;selectedRef.current=null;setSelected(null);setItems([]);setItemsLoading(false)}
  const persist=async(next:Source[])=>{await api('/api/sources/raw',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:next})});setSources(next)}
  const remove=async(s:Source)=>{if(!window.confirm(`删除信源“${s.label||s.ref}”及其条目？`))return;await api(`/api/items/by-source?source_url=${encodeURIComponent(s.ref)}`,{method:'DELETE'});await persist(sources.filter(x=>x.ref!==s.ref));if(selected?.ref===s.ref)closeDetails()}
  const pull=async(ref:string,headless=false)=>{
    const key=canonicalSourceRef(ref)
    if(pullingRefs[key])return
    try{
      await api<{taskId:string}>('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'source-pull',ref,...(headless?{headless:true}:{})})})
    }catch(e){
      setError(String(e))
    }
  }
  const clearItems=async(s:Source)=>{if(!window.confirm('确定要清空该信源下的所有条目吗？此操作不可恢复。'))return;await api(`/api/items/by-source?source_url=${encodeURIComponent(s.ref)}`,{method:'DELETE'});setStats(current=>({...current,[canonicalSourceRef(s.ref)]:0}));if(selected?.ref===s.ref)setItems([])}
  const copyRss=async(ref:string)=>{const url=new URL('/rss',window.location.origin);url.searchParams.set('ref',ref);await navigator.clipboard.writeText(url.href)}
  const openLink=async(ref:string)=>{await api('/api/sources/open-browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:ref})})}
  const filtered=sortSources(sources.filter(s=>`${s.label??''} ${s.ref} ${s.description??''}`.toLowerCase().includes(query.toLowerCase())),sort,stats)
  return <div className="sources-split">
    <section className="sources-list-pane">
      <header className="sources-toolbar">
        <input className={`${fieldClass} sidebar-filter-input sources-filter-input`} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="过滤…"/>
        <div className="sources-toolbar-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="sources-sort-button" title="排序信源" aria-label="排序信源"><ArrowUpDown aria-hidden="true"/></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>排序方式</DropdownMenuLabel>
              <DropdownMenuSeparator/>
              <DropdownMenuRadioGroup value={sort} onValueChange={value=>setSort(value as SourceSort)}>
                <DropdownMenuRadioItem value="configured">配置顺序</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-asc">名称 A–Z</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-desc">名称 Z–A</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="count-desc">条目数：从多到少</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="count-asc">条目数：从少到多</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="sources-add-button" title="添加信源" aria-label="添加信源" onClick={()=>{setEditing({ref:'',refresh:'1day',weight:0});setAdding(true)}}><Plus aria-hidden="true"/></button>
        </div>
      </header>
      <div className="sources-list-scroll">
      {error&&<div className="sidebar-error"><Notice error>{error}</Notice></div>}
      {filtered.map(s=>{const host=sourceHostname(s.ref);return <article key={s.ref} className={`source-row ${selected?.ref===s.ref?'source-row--active':''}`} onClick={()=>void open(s)}>
        <button className="source-row-main" title={s.ref}>
          <span className="source-favicon-slot">{host&&<img src={`/api/feed-favicon?domain=${encodeURIComponent(host)}`} alt=""/>}</span>
          <span className="source-row-title">{s.label||s.ref}</span>
          <span className="source-row-count">{pullingRefs[canonicalSourceRef(s.ref)]?<LoaderCircle className="source-row-loader" aria-label="正在拉取"/>:stats[canonicalSourceRef(s.ref)]??0}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="source-row-more" aria-label="更多" title="更多" onClick={event=>event.stopPropagation()}><MoreHorizontal/></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={event=>event.stopPropagation()}>
            <DropdownMenuItem disabled={!!pullingRefs[canonicalSourceRef(s.ref)]} onSelect={()=>void pull(s.ref)}><RefreshCw/>拉取</DropdownMenuItem>
            <DropdownMenuItem disabled={!!pullingRefs[canonicalSourceRef(s.ref)]} onSelect={()=>void pull(s.ref,true)}><CloudDownload/>后台拉取</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{setEditing({...s});setAdding(false)}}><Pencil/>编辑</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>void copyRss(s.ref)}><Copy/>复制 RSS 地址</DropdownMenuItem>
            {host&&<DropdownMenuItem onSelect={()=>void openLink(s.ref)}><ExternalLink/>打开链接</DropdownMenuItem>}
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={()=>void clearItems(s)}><Trash/>清空该源条目</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={()=>void remove(s)}><Trash2/>移除信源</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </article>})}
      {!filtered.length&&!error&&<Notice>暂无信源</Notice>}</div>
    </section>
    <ItemsPanel source={selected} items={items} loading={itemsLoading} onDelete={async item=>{await api(`/api/items/${encodeURIComponent(item.id)}`,{method:'DELETE'});setItems(current=>current.filter(x=>x.id!==item.id))}}/>
    {editing&&<SourceDialog value={editing} adding={adding} onClose={()=>setEditing(null)} onSave={async value=>{const next=adding?[...sources,value]:sources.map(s=>s.ref===editing.ref?value:s);await persist(next);setEditing(null)}}/>}
  </div>
}

function sourceHostname(ref:string){
  try{return /^https?:\/\//i.test(ref)?new URL(ref).hostname.replace(/^www\./i,''):''}catch{return ''}
}

function canonicalSourceRef(ref:string){
  const value=ref.trim()
  if(!/^https?:\/\//i.test(value))return value.toLowerCase()
  try{
    const url=new URL(value)
    const path=url.pathname.length>1&&url.pathname.endsWith('/')?url.pathname.slice(0,-1):url.pathname
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${url.search}${url.hash}`
  }catch{return value.toLowerCase()}
}

function sortSources(sources:Source[],sort:SourceSort,stats:Record<string,number>){
  if(sort==='configured')return sources
  return [...sources].sort((a,b)=>{
    const nameComparison=sourceNameCollator.compare(a.label||a.ref,b.label||b.ref)
    if(sort==='name-asc')return nameComparison
    if(sort==='name-desc')return -nameComparison
    const countComparison=(stats[canonicalSourceRef(a.ref)]??0)-(stats[canonicalSourceRef(b.ref)]??0)
    return (sort==='count-asc'?countComparison:-countComparison)||nameComparison
  })
}

function SourceDialog({value,adding,onClose,onSave}:{value:Source;adding:boolean;onClose:()=>void;onSave:(v:Source)=>Promise<void>}){
  const [form,setForm]=useState(value);const [busy,setBusy]=useState(false);const change=(key:keyof Source,val:string|number)=>setForm({...form,[key]:val})
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="w-full max-w-lg space-y-4 rounded-xl bg-card p-6 shadow-xl" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await onSave({...form,ref:form.ref.trim()})}finally{setBusy(false)}}}>
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{adding?'添加信源':'编辑信源'}</h2><Button type="button" size="sm" variant="ghost" onClick={onClose}><X size={16}/></Button></div>
    <label className="block text-sm">URL / Ref<input required disabled={!adding} className={`${fieldClass} mt-1`} value={form.ref} onChange={e=>change('ref',e.target.value)}/></label>
    <label className="block text-sm">名称<input className={`${fieldClass} mt-1`} value={form.label??''} onChange={e=>change('label',e.target.value)}/></label>
    <label className="block text-sm">描述<textarea className={`${fieldClass} mt-1`} value={form.description??''} onChange={e=>change('description',e.target.value)}/></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">刷新间隔<select className={`${fieldClass} mt-1`} value={form.refresh??'1day'} onChange={e=>change('refresh',e.target.value)}>{intervals.map(x=><option key={x}>{x}</option>)}</select></label><label className="text-sm">权重<input className={`${fieldClass} mt-1`} type="number" min="0" max="1" step=".1" value={form.weight??0} onChange={e=>change('weight',Number(e.target.value))}/></label></div>
    <label className="block text-sm">代理<input className={`${fieldClass} mt-1`} value={form.proxy??''} onChange={e=>change('proxy',e.target.value)}/></label>
    <Button className="w-full" disabled={busy}>{busy?'保存中…':'保存'}</Button>
  </form></div>
}

function ItemsPanel({source,items,loading,onDelete}:{source:Source|null;items:FeedItem[];loading:boolean;onDelete:(item:FeedItem)=>void|Promise<void>}){
  if(!source)return <aside className="sources-detail-pane sources-detail-empty"><div><p className="font-semibold">信源条目</p><p className="mt-2 max-w-xs text-sm text-muted-foreground">在左侧列表中点击某一信源，在此查看已拉取的条目。</p></div></aside>
  return <aside className="sources-detail-pane">
    <header className="sources-detail-header"><h2 className="truncate font-semibold">{source.label||source.ref}</h2><p className="truncate text-xs text-muted-foreground">{source.description||source.ref}</p></header>
    {loading
      ? <div className="sources-detail-state">加载中…</div>
      : items.length
        ? <div className="feed-item-list">{items.map(item=><FeedItemCard key={item.id} item={item} sourceRef={source.ref} onDelete={onDelete}/>)}</div>
        : <div className="sources-detail-state">暂无条目</div>}
  </aside>
}
