import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fieldClass, Notice, Page } from '@/components/Page'

type LogItem={id:number;level:string;category?:string;message:string;payload?:string|null;details?:unknown;created_at?:string;createdAt?:string}
const PAGE_SIZE=100

export function LogsPage(){
  const [items,setItems]=useState<LogItem[]>([]);const [total,setTotal]=useState(0);const [level,setLevel]=useState('');const [categoryInput,setCategoryInput]=useState('');const [category,setCategory]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [offset,setOffset]=useState(0)
  const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setError('');try{const p=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(offset)});if(level)p.set('level',level);if(category.trim())p.set('category',category.trim());const d=await api<{items?:LogItem[];total?:number}>(`/api/logs?${p}`,{signal});setItems(d.items??[]);setTotal(d.total??0)}catch(e){if((e as Error).name!=='AbortError')setError(String(e))}finally{if(!signal?.aborted)setLoading(false)}},[level,category,offset])
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort()},[load])
  useEffect(()=>{const timer=window.setTimeout(()=>{setOffset(0);setCategory(categoryInput.trim())},350);return()=>window.clearTimeout(timer)},[categoryInput])
  const clear=async()=>{if(!window.confirm('清空全部日志？'))return;await api('/api/logs',{method:'DELETE'});setItems([]);setTotal(0)}
  return <Page title="日志" description={`共 ${total} 条`} actions={<Button variant="outline" onClick={clear}><Trash2 size={15}/>清空</Button>}>
    <div className="logs-filter-grid">
      <Select value={level||'all'} onValueChange={value=>{setOffset(0);setLevel(value==='all'?'':value)}}>
        <SelectTrigger aria-label="日志级别"><SelectValue placeholder="全部级别"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部级别</SelectItem>
          <SelectItem value="error">error</SelectItem>
          <SelectItem value="warn">warn</SelectItem>
          <SelectItem value="info">info</SelectItem>
          <SelectItem value="debug">debug</SelectItem>
        </SelectContent>
      </Select>
      <input className={`${fieldClass} h-9`} value={categoryInput} onChange={e=>setCategoryInput(e.target.value)} placeholder="分类筛选" aria-label="日志分类"/>
    </div>
    {error&&<Notice error>{error}</Notice>}
    <div className="divide-y overflow-hidden rounded-lg border bg-card">{items.map(item=><details key={item.id} className="group px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm"><span className={`w-12 text-xs font-semibold ${item.level==='error'?'text-destructive':'text-muted-foreground'}`}>{item.level}</span><span className="min-w-0 flex-1 truncate">{item.message}</span><time className="text-xs text-muted-foreground">{new Date(item.created_at??item.createdAt??'').toLocaleString()}</time></summary>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{item.category&&`[${item.category}]\n`}{formatPayload(item)}</pre>
    </details>)}</div>
    {!!total&&<div className="mt-4 flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">共 {total} 条，当前 {items.length?`${offset+1}–${offset+items.length}`:'—'}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={loading||offset<=0} onClick={()=>setOffset(value=>Math.max(0,value-PAGE_SIZE))}><ChevronLeft/>上一页</Button>
        <Button size="sm" variant="outline" disabled={loading||offset+items.length>=total} onClick={()=>setOffset(value=>value+PAGE_SIZE)}>下一页<ChevronRight/></Button>
      </div>
    </div>}
    {loading&&<Notice>加载中…</Notice>}{!loading&&!items.length&&!error&&<Notice>暂无日志</Notice>}
  </Page>
}

function formatPayload(item:LogItem){
  if(item.details)return JSON.stringify(item.details,null,2)
  if(!item.payload)return ''
  try{return JSON.stringify(JSON.parse(item.payload),null,2)}catch{return item.payload}
}
