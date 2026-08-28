import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, Copy, ExternalLink, LoaderCircle, Monitor, MoreHorizontal, Pencil, Plus, RefreshCw, Trash, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fieldClass } from '@/components/Page'
import { FeedItemCard, type FeedItem } from './FeedItemCard'

type SourceProxyMode='none'|'default'|'custom'
type Source={ref:string;label?:string;description?:string;group?:string[];refresh?:string;proxyMode?:SourceProxyMode;proxy?:string;weight?:number}
type Feed={items?:FeedItem[];hasMore?:boolean;total?:number}
type PullStatus={ref:string;status:'idle'|'pending'|'running'|'done'|'error';pending:number;running:number;error?:string}
type SourceOverview=Source&{stats:{count:number;count7d:number;latestAt:string|null};pull:PullStatus}
type SourceStatsRow={source_url:string;count:number;count_7d:number;latest_at:string|null}
type SourceGroupTreeNode={name:string;path:string[];sourceCount:number;children:SourceGroupTreeNode[]}
type ProxySettings={globalProxy:string;proxyList:string[]}
type SourceSort='configured'|'name-asc'|'name-desc'|'count-desc'|'count-asc'
type SourceDropTarget={kind:'source';ref:string;position:'before'|'after'}|{kind:'group';path:string[]}
const intervals=['10min','30min','1h','6h','12h','1day','3day','7day']
const sourceNameCollator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})
const collapsedGroupsStorageKey='rssany.sources.collapsed-groups.v1'
const customProxyPrefix='custom:'
const sourceDragType='application/x-rssany-source'
const showError=(cause:unknown)=>toast.error(cause instanceof Error?cause.message:String(cause),{duration:3500})

export function SourcesPage(){
  const [sources,setSources]=useState<Source[]>([]);const [sourceGroups,setSourceGroups]=useState<SourceGroupTreeNode[]>([]);const [proxySettings,setProxySettings]=useState<ProxySettings>({globalProxy:'',proxyList:[]});const [stats,setStats]=useState<Record<string,number>>({});const [items,setItems]=useState<FeedItem[]>([]);const [selected,setSelected]=useState<Source|null>(null);const [editing,setEditing]=useState<Source|null>(null);const [adding,setAdding]=useState(false);const [query,setQuery]=useState('');const [sort,setSort]=useState<SourceSort>('configured');const [collapsedGroups,setCollapsedGroups]=useState<Set<string>>(loadCollapsedGroups);const [pullingRefs,setPullingRefs]=useState<Record<string,boolean>>({});const [itemsLoading,setItemsLoading]=useState(false);const [sourcesLoading,setSourcesLoading]=useState(true);const [draggedRef,setDraggedRef]=useState<string|null>(null);const [dropTarget,setDropTarget]=useState<SourceDropTarget|null>(null);const [reordering,setReordering]=useState(false)
  const detailRequestId=useRef(0)
  const detailAbortController=useRef<AbortController|null>(null)
  const selectedRef=useRef<Source|null>(null)
  const statsRefreshTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const reloadStats=useCallback(async()=>{
    try{
      const rows=await api<SourceStatsRow[]>('/api/sources/stats')
      setStats(Object.fromEntries(rows.map(row=>[canonicalSourceRef(row.source_url),row.count])))
    }catch{/* 后台同步失败时保留现有统计，下次事件或轮询会重试 */}
  },[])
  const scheduleStatsRefresh=useCallback(()=>{
    if(statsRefreshTimer.current!==null)clearTimeout(statsRefreshTimer.current)
    statsRefreshTimer.current=setTimeout(()=>{statsRefreshTimer.current=null;void reloadStats()},300)
  },[reloadStats])
  const load=useCallback(async()=>{
    try{
      const [response,groupsResponse,proxyResponse]=await Promise.all([api<{sources?:SourceOverview[]}>('/api/sources'),api<{groups?:SourceGroupTreeNode[]}>('/api/sources/groups'),api<Partial<ProxySettings>>('/api/proxy')])
      const rows=response.sources??[]
      setSourceGroups(groupsResponse.groups??[])
      setProxySettings({globalProxy:proxyResponse.globalProxy??'',proxyList:proxyResponse.proxyList??[]})
      setSources(rows.map(({stats:_stats,pull:_pull,...source})=>source))
      setStats(Object.fromEntries(rows.map(row=>[canonicalSourceRef(row.ref),row.stats.count])))
      setPullingRefs(Object.fromEntries(rows
        .filter(row=>row.pull.status==='pending'||row.pull.status==='running')
        .map(row=>[canonicalSourceRef(row.ref),true])))
    }catch(e){showError(e)}finally{setSourcesLoading(false)}
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    const events=new EventSource('/api/events')
    events.onmessage=event=>{
      try{
        const data=JSON.parse(event.data) as {type?:string}
        if(data.type==='feed:updated')scheduleStatsRefresh()
      }catch{/* 忽略无法识别的事件，等待后续事件或轮询 */}
    }
    const handleVisibilityChange=()=>{if(document.visibilityState==='visible')void reloadStats()}
    document.addEventListener('visibilitychange',handleVisibilityChange)
    return()=>{
      events.close()
      document.removeEventListener('visibilitychange',handleVisibilityChange)
      if(statsRefreshTimer.current!==null){clearTimeout(statsRefreshTimer.current);statsRefreshTimer.current=null}
    }
  },[reloadStats,scheduleStatsRefresh])
  useEffect(()=>{try{localStorage.setItem(collapsedGroupsStorageKey,JSON.stringify([...collapsedGroups]))}catch{/* 浏览器禁用存储时仍可在当前会话使用 */}},[collapsedGroups])
  useEffect(()=>()=>detailAbortController.current?.abort(),[])
  const open=useCallback(async(s:Source)=>{
    const requestId=++detailRequestId.current
    detailAbortController.current?.abort()
    const controller=new AbortController()
    detailAbortController.current=controller
    selectedRef.current=s;setSelected(s);setItems([]);setItemsLoading(true)
    try{
      let d:Feed
      try{
        d=await api<Feed>(`/api/items?ref=${encodeURIComponent(s.ref)}&limit=100`,{signal:controller.signal})
      }catch(e){
        if(controller.signal.aborted)throw e
        d=await api<Feed>(`/api/feed?ref=${encodeURIComponent(s.ref)}&limit=100`,{signal:controller.signal})
      }
      if(requestId===detailRequestId.current){
        setItems(d.items??[])
        if(typeof d.total==='number')setStats(current=>({...current,[canonicalSourceRef(s.ref)]:d.total as number}))
      }
    }catch(e){
      if(!controller.signal.aborted&&requestId===detailRequestId.current){setItems([]);showError(e)}
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
        scheduleStatsRefresh()
        const current=selectedRef.current
        if(current&&canonicalSourceRef(current.ref)===canonicalSourceRef(data.source.ref))void open(current)
        if(data.source.status==='error'&&data.source.error)showError(data.source.error)
      }
    }
    return()=>events.close()
  },[open,scheduleStatsRefresh])
  const closeDetails=()=>{detailRequestId.current+=1;detailAbortController.current?.abort();detailAbortController.current=null;selectedRef.current=null;setSelected(null);setItems([]);setItemsLoading(false)}
  const persist=async(next:Source[])=>{await api('/api/sources/raw',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:next})});const groupsResponse=await api<{groups?:SourceGroupTreeNode[]}>('/api/sources/groups');setSources(next);setSourceGroups(groupsResponse.groups??[])}
  const resetSourceDrag=()=>{setDraggedRef(null);setDropTarget(null)}
  const reorderSource=async(target:SourceDropTarget)=>{
    if(!draggedRef||reordering)return resetSourceDrag()
    const previous=sources
    const next=moveSourceToTarget(previous,draggedRef,target)
    resetSourceDrag()
    if(next===previous)return
    setSources(next);setReordering(true)
    try{await persist(next)}catch(e){setSources(previous);showError(e)}finally{setReordering(false)}
  }
  const sourceTargetAt=(event:DragEvent<HTMLElement>,ref:string):SourceDropTarget=>{
    const bounds=event.currentTarget.getBoundingClientRect()
    return {kind:'source',ref,position:event.clientY<bounds.top+bounds.height/2?'before':'after'}
  }
  const acceptsSourceDrag=(event:DragEvent)=>event.dataTransfer.types.includes(sourceDragType)
  const remove=async(s:Source)=>{if(!window.confirm(`删除信源“${s.label||s.ref}”及其条目？`))return;await api(`/api/items/by-source?source_url=${encodeURIComponent(s.ref)}`,{method:'DELETE'});await persist(sources.filter(x=>x.ref!==s.ref));if(selected?.ref===s.ref)closeDetails()}
  const pull=async(ref:string,headless=true)=>{
    const key=canonicalSourceRef(ref)
    if(pullingRefs[key])return
    try{
      await api<{taskId:string}>('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'source-pull',ref,headless})})
    }catch(e){
      showError(e)
    }
  }
  const clearItems=async(s:Source)=>{if(!window.confirm('确定要清空该信源下的所有条目吗？此操作不可恢复。'))return;await api(`/api/items/by-source?source_url=${encodeURIComponent(s.ref)}`,{method:'DELETE'});setStats(current=>({...current,[canonicalSourceRef(s.ref)]:0}));if(selected?.ref===s.ref)setItems([])}
  const copyRss=async(ref:string)=>{const url=new URL('/rss',window.location.origin);url.searchParams.set('ref',ref);await navigator.clipboard.writeText(url.href)}
  const openLink=async(ref:string)=>{await api('/api/sources/open-browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:ref})})}
  const filtered=sortSources(sources.filter(s=>`${s.label??''} ${s.ref} ${s.description??''} ${(s.group??[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())),sort,stats)
  const displayEntries=groupSourcesForDisplay(filtered,query?new Set():collapsedGroups)
  const dragEnabled=sort==='configured'&&!query&&!reordering
  const toggleGroup=(path:string[])=>setCollapsedGroups(current=>{const next=new Set(current);const key=groupPathKey(path);if(next.has(key))next.delete(key);else next.add(key);return next})
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
          <button className="sources-add-button" title="添加信源" aria-label="添加信源" onClick={()=>{setEditing({ref:'',group:[],refresh:'1day',proxyMode:'none',weight:0});setAdding(true)}}><Plus aria-hidden="true"/></button>
        </div>
      </header>
      <div className="sources-list-scroll">
      {displayEntries.map(entry=>{if(entry.kind==='group'){const isDropTarget=dropTarget?.kind==='group'&&groupPathKey(dropTarget.path)===groupPathKey(entry.path);return <button key={`group:${groupPathKey(entry.path)}`} type="button" className={`source-group-row ${isDropTarget?'source-group-row--drop-target':''}`} title={dragEnabled?`${entry.path.join(' / ')} · 可拖入此分组`:entry.path.join(' / ')} aria-expanded={!entry.collapsed} onClick={()=>{if(!query)toggleGroup(entry.path)}} onDragOver={event=>{if(!dragEnabled||!acceptsSourceDrag(event))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setDropTarget({kind:'group',path:entry.path})}} onDrop={event=>{if(!dragEnabled||!acceptsSourceDrag(event))return;event.preventDefault();event.stopPropagation();void reorderSource({kind:'group',path:entry.path})}}>{entry.collapsed?<ChevronRight aria-hidden="true"/>:<ChevronDown aria-hidden="true"/>}<span>{entry.name}</span><span className="source-group-count">{entry.sourceCount}</span></button>}const s=entry.source;const host=sourceHostname(s.ref);const before=dropTarget?.kind==='source'&&dropTarget.ref===s.ref&&dropTarget.position==='before';const after=dropTarget?.kind==='source'&&dropTarget.ref===s.ref&&dropTarget.position==='after';return <article key={s.ref} draggable={dragEnabled} title={dragEnabled?'拖拽排序':undefined} className={`source-row ${dragEnabled?'source-row--draggable':''} ${selected?.ref===s.ref?'source-row--active':''} ${draggedRef===s.ref?'source-row--dragging':''} ${before?'source-row--drop-before':''} ${after?'source-row--drop-after':''}`} onClick={()=>void open(s)} onDragStart={event=>{if(!dragEnabled){event.preventDefault();return}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(sourceDragType,s.ref);setDraggedRef(s.ref)}} onDragEnd={resetSourceDrag} onDragOver={event=>{if(!dragEnabled||!acceptsSourceDrag(event)||draggedRef===s.ref)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setDropTarget(sourceTargetAt(event,s.ref))}} onDrop={event=>{if(!dragEnabled||!acceptsSourceDrag(event)||draggedRef===s.ref)return;event.preventDefault();event.stopPropagation();void reorderSource(sourceTargetAt(event,s.ref))}}>
        <button className="source-row-main" title={s.ref}>
          <span className="source-favicon-slot">{host&&<img src={`/api/feed-favicon?domain=${encodeURIComponent(host)}`} alt="" loading="lazy" decoding="async"/>}</span>
          <span className="source-row-title">{s.label||s.ref}</span>
          <span className="source-row-count">{pullingRefs[canonicalSourceRef(s.ref)]?<LoaderCircle className="source-row-loader" aria-label="正在拉取"/>:stats[canonicalSourceRef(s.ref)]??0}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="source-row-more" aria-label="更多" title="更多" onClick={event=>event.stopPropagation()}><MoreHorizontal/></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={event=>event.stopPropagation()}>
            <DropdownMenuItem disabled={!!pullingRefs[canonicalSourceRef(s.ref)]} onSelect={()=>void pull(s.ref)}><RefreshCw/>拉取</DropdownMenuItem>
            <DropdownMenuItem disabled={!!pullingRefs[canonicalSourceRef(s.ref)]} onSelect={()=>void pull(s.ref,false)}><Monitor/>前台拉取</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{setEditing({...s});setAdding(false)}}><Pencil/>编辑</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>void copyRss(s.ref)}><Copy/>复制 RSS 地址</DropdownMenuItem>
            {host&&<DropdownMenuItem onSelect={()=>void openLink(s.ref)}><ExternalLink/>打开链接</DropdownMenuItem>}
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={()=>void clearItems(s)}><Trash/>清空该源条目</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={()=>void remove(s)}><Trash2/>移除信源</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </article>})}
      {sourcesLoading
        ? <div className="sources-list-empty">加载中…</div>
        : !filtered.length&&<div className="sources-list-empty">{sources.length?'没有匹配的信源':'暂无信源'}</div>}
      </div>
    </section>
    <ItemsPanel source={selected} items={items} loading={itemsLoading} onDelete={async item=>{
      await api(`/api/items/${encodeURIComponent(item.id)}`,{method:'DELETE'})
      setItems(current=>current.filter(x=>x.id!==item.id))
      if(selected){
        const key=canonicalSourceRef(selected.ref)
        setStats(current=>({...current,[key]:Math.max(0,(current[key]??1)-1)}))
      }
      scheduleStatsRefresh()
    }}/>
    {editing&&<SourceDialog value={editing} groups={sourceGroups} proxySettings={proxySettings} adding={adding} onClose={()=>setEditing(null)} onSave={async value=>{
      const previousRef=editing.ref
      const next=adding?[...sources,value]:sources.map(s=>s.ref===previousRef?value:s)
      await persist(next)
      if(!adding&&selected?.ref===previousRef){
        selectedRef.current=value
        setSelected(value)
        if(canonicalSourceRef(previousRef)!==canonicalSourceRef(value.ref))void open(value)
      }
      setEditing(null)
    }}/>}
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

function sameGroup(left:string[]|undefined,right:string[]|undefined){
  const a=left??[];const b=right??[]
  return a.length===b.length&&a.every((segment,index)=>segment===b[index])
}

function isDescendantGroup(group:string[]|undefined,parent:string[]){
  const path=group??[]
  return path.length>parent.length&&parent.every((segment,index)=>path[index]===segment)
}

function moveSourceToTarget(sources:Source[],draggedRef:string,target:SourceDropTarget):Source[]{
  const fromIndex=sources.findIndex(source=>source.ref===draggedRef)
  if(fromIndex<0||(target.kind==='source'&&target.ref===draggedRef))return sources
  const dragged={...sources[fromIndex]}
  const next=sources.filter((_,index)=>index!==fromIndex)
  let insertIndex:number
  if(target.kind==='source'){
    const targetIndex=next.findIndex(source=>source.ref===target.ref)
    if(targetIndex<0)return sources
    dragged.group=[...(next[targetIndex].group??[])]
    insertIndex=targetIndex+(target.position==='after'?1:0)
  }else{
    dragged.group=[...target.path]
    let lastDirectIndex=-1
    for(let index=0;index<next.length;index++)if(sameGroup(next[index].group,target.path))lastDirectIndex=index
    if(lastDirectIndex>=0)insertIndex=lastDirectIndex+1
    else{
      const firstDescendantIndex=next.findIndex(source=>isDescendantGroup(source.group,target.path))
      insertIndex=firstDescendantIndex>=0?firstDescendantIndex:next.length
    }
  }
  next.splice(insertIndex,0,dragged)
  const unchanged=next.length===sources.length&&next.every((source,index)=>source.ref===sources[index].ref&&sameGroup(source.group,sources[index].group))
  return unchanged?sources:next
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

type SourceDisplayEntry={kind:'group';name:string;path:string[];depth:number;collapsed:boolean;sourceCount:number}|{kind:'source';source:Source;depth:number}
type SourceGroupNode={name:string;path:string[];sources:Source[];children:Map<string,SourceGroupNode>}

function groupPathKey(path:string[]){return path.join('\u0000')}

function loadCollapsedGroups():Set<string>{
  try{
    const stored=JSON.parse(localStorage.getItem(collapsedGroupsStorageKey)??'[]') as unknown
    return new Set(Array.isArray(stored)?stored.filter((value):value is string=>typeof value==='string'):[])
  }catch{return new Set()}
}

function groupSourcesForDisplay(sources:Source[],collapsedGroups:Set<string>):SourceDisplayEntry[]{
  const root:SourceGroupNode={name:'',path:[],sources:[],children:new Map()}
  for(const source of sources){
    let node=root
    for(const rawSegment of source.group??[]){
      const segment=rawSegment.trim()
      if(!segment)continue
      let child=node.children.get(segment)
      if(!child){child={name:segment,path:[...node.path,segment],sources:[],children:new Map()};node.children.set(segment,child)}
      node=child
    }
    node.sources.push(source)
  }
  const entries:SourceDisplayEntry[]=[]
  const countSources=(node:SourceGroupNode):number=>node.sources.length+[...node.children.values()].reduce((total,child)=>total+countSources(child),0)
  const visit=(node:SourceGroupNode,depth:number)=>{
    const collapsed=node!==root&&collapsedGroups.has(groupPathKey(node.path))
    if(node!==root)entries.push({kind:'group',name:node.name,path:node.path,depth,collapsed,sourceCount:countSources(node)})
    if(collapsed)return
    for(const source of node.sources)entries.push({kind:'source',source,depth:node===root?0:depth+1})
    for(const child of node.children.values())visit(child,node===root?0:depth+1)
  }
  visit(root,0)
  return entries
}

function flattenSourceGroups(groups:SourceGroupTreeNode[]):SourceGroupTreeNode[]{return groups.flatMap(group=>[group,...flattenSourceGroups(group.children)])}

function SourceDialog({value,groups,proxySettings,adding,onClose,onSave}:{value:Source;groups:SourceGroupTreeNode[];proxySettings:ProxySettings;adding:boolean;onClose:()=>void;onSave:(v:Source)=>Promise<void>}){
  const [form,setForm]=useState(value);const [busy,setBusy]=useState(false);const change=(key:keyof Source,val:string|number)=>setForm({...form,[key]:val})
  const groupOptions=flattenSourceGroups(groups)
  const groupValue=(form.group??[]).join(' / ')
  const configuredProxies=[...new Set(proxySettings.proxyList.map(proxy=>proxy.trim()).filter(Boolean))]
  const currentProxy=form.proxy?.trim()??''
  const proxyOptions=currentProxy&&!configuredProxies.includes(currentProxy)?[...configuredProxies,currentProxy]:configuredProxies
  const proxyMode=form.proxyMode??(currentProxy?'custom':'none')
  const proxySelectValue=proxyMode==='custom'&&currentProxy?`${customProxyPrefix}${currentProxy}`:proxyMode
  const selectProxy=(selected:string)=>{
    if(selected==='none'||selected==='default')setForm({...form,proxyMode:selected,proxy:undefined})
    else if(selected.startsWith(customProxyPrefix))setForm({...form,proxyMode:'custom',proxy:selected.slice(customProxyPrefix.length)})
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="w-full max-w-lg space-y-4 rounded-xl bg-card p-6 shadow-xl" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await onSave({...form,ref:form.ref.trim(),group:(form.group??[]).map(x=>x.trim()).filter(Boolean),proxyMode,proxy:proxyMode==='custom'?currentProxy||undefined:undefined})}finally{setBusy(false)}}}>
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{adding?'添加信源':'编辑信源'}</h2><Button type="button" size="sm" variant="ghost" onClick={onClose}><X size={16}/></Button></div>
    <label className="block text-sm">URL / Ref<input required className={`${fieldClass} mt-1`} value={form.ref} onChange={e=>change('ref',e.target.value)}/></label>
    <label className="block text-sm">名称<input className={`${fieldClass} mt-1`} value={form.label??''} onChange={e=>change('label',e.target.value)}/></label>
    <label className="block text-sm">描述<textarea className={`${fieldClass} mt-1`} value={form.description??''} onChange={e=>change('description',e.target.value)}/></label>
    <label className="block text-sm">分组路径<input className={`${fieldClass} mt-1`} list="source-group-path-options" value={groupValue} placeholder="选择已有分组，或输入新路径" onChange={e=>setForm({...form,group:e.target.value.split('/').map(x=>x.trim()).filter(Boolean)})}/></label>
    <datalist id="source-group-path-options">{groupOptions.map(group=><option key={groupPathKey(group.path)} value={group.path.join(' / ')}>{group.sourceCount} 个信源</option>)}</datalist>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">刷新间隔<select className={`${fieldClass} mt-1`} value={form.refresh??'1day'} onChange={e=>change('refresh',e.target.value)}>{intervals.map(x=><option key={x}>{x}</option>)}</select></label><label className="text-sm">权重<input className={`${fieldClass} mt-1`} type="number" min="0" max="1" step=".1" value={form.weight??0} onChange={e=>change('weight',Number(e.target.value))}/></label></div>
    <label className="block text-sm">代理<Select value={proxySelectValue} onValueChange={selectProxy}><SelectTrigger className="mt-1 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">无（直连）</SelectItem><SelectItem value="default" disabled={!proxySettings.globalProxy}>默认代理{proxySettings.globalProxy?` · ${proxySettings.globalProxy}`:'（未配置）'}</SelectItem>{proxyOptions.map(proxy=><SelectItem key={proxy} value={`${customProxyPrefix}${proxy}`}>自定义代理 · {proxy}</SelectItem>)}</SelectContent></Select></label>
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
