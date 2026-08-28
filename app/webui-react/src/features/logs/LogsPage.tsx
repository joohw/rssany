import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fieldClass, Notice } from '@/components/Page'

type LogItem={id:number;level:string;category?:string;message:string;payload?:string|null;details?:unknown;created_at?:string;createdAt?:string}
const PAGE_SIZE=100
const RECENT_DAYS=30

type DateOption={value:string;label:string;description:string;since:Date;until:Date}

function getRecentDates():DateOption[]{
  const today=new Date();today.setHours(0,0,0,0)
  return Array.from({length:RECENT_DAYS},(_,index)=>{
    const since=new Date(today);since.setDate(today.getDate()-index)
    const until=new Date(since);until.setDate(since.getDate()+1)
    const dateLabel=since.toLocaleDateString('zh-CN',{month:'long',day:'numeric'})
    return {
      value:[since.getFullYear(),String(since.getMonth()+1).padStart(2,'0'),String(since.getDate()).padStart(2,'0')].join('-'),
      label:dateLabel,
      description:since.toLocaleDateString('zh-CN',{year:'numeric',weekday:'long'}),
      since,
      until,
    }
  })
}

export function LogsPage(){
  const dates=useMemo(getRecentDates,[]);const [selectedDate,setSelectedDate]=useState('recent');const [items,setItems]=useState<LogItem[]>([]);const [total,setTotal]=useState(0);const [level,setLevel]=useState('');const [categoryInput,setCategoryInput]=useState('');const [category,setCategory]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [offset,setOffset]=useState(0)
  const selectedOption=dates.find(option=>option.value===selectedDate)
  const selectedLabel=selectedOption?.label??'最近 30 天'
  const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setError('');try{const range=selectedDate==='recent'?{since:dates.at(-1)?.since}:selectedOption;const p=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(offset)});if(range?.since)p.set('since',range.since.toISOString());if(selectedDate!=='recent'&&selectedOption)p.set('until',selectedOption.until.toISOString());if(level)p.set('level',level);if(category.trim())p.set('category',category.trim());const d=await api<{items?:LogItem[];total?:number}>(`/api/logs?${p}`,{signal});setItems(d.items??[]);setTotal(d.total??0)}catch(e){if((e as Error).name!=='AbortError')setError(String(e))}finally{if(!signal?.aborted)setLoading(false)}},[level,category,offset,dates,selectedDate,selectedOption])
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort()},[load])
  useEffect(()=>{const timer=window.setTimeout(()=>{setOffset(0);setCategory(categoryInput.trim())},350);return()=>window.clearTimeout(timer)},[categoryInput])
  const clear=async()=>{if(!window.confirm('清空全部日志？'))return;await api('/api/logs',{method:'DELETE'});setItems([]);setTotal(0)}
  const selectDate=(value:string)=>{setSelectedDate(value);setOffset(0)}
  return <div className="master-detail-layout">
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-card max-md:border-b max-md:border-r-0">
      <header className="flex h-[4.5rem] flex-none flex-col justify-center border-b px-3">
        <h1 className="text-base font-semibold tracking-tight">日期</h1>
        <p className="mt-1 text-xs text-muted-foreground">最近 30 天</p>
      </header>
      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="日志日期">
        <button type="button" className={`skill-chapter-button${selectedDate==='recent'?' skill-chapter-button--active':''}`} onClick={()=>selectDate('recent')}>
          <span>最近 30 天</span>
          <small>{dates.at(-1)?.label} – {dates[0]?.label}</small>
        </button>
        {dates.map(option=><button key={option.value} type="button" className={`skill-chapter-button${selectedDate===option.value?' skill-chapter-button--active':''}`} onClick={()=>selectDate(option.value)}>
          <span>{option.label}</span>
          <small>{option.description}</small>
        </button>)}
      </nav>
    </aside>
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-[4.5rem] flex-none items-center justify-between gap-4 border-b px-5 sm:px-8">
        <div>
          <h1 className="text-base font-semibold tracking-tight">日志</h1>
          <p className="mt-1 text-xs text-muted-foreground">{selectedLabel} · 共 {total} 条</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-32">
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
          </div>
          <div className="w-40">
            <input className={`${fieldClass} h-9`} value={categoryInput} onChange={e=>setCategoryInput(e.target.value)} placeholder="分类筛选" aria-label="日志分类"/>
          </div>
          <Button variant="outline" onClick={clear}><Trash2 size={15}/>清空</Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
          {error&&<div className="px-5 sm:px-8"><Notice error>{error}</Notice></div>}
          <div className="divide-y">{items.map(item=><details key={item.id} className="group px-5 py-3 sm:px-8">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm"><span className={`w-12 text-xs font-semibold ${item.level==='error'?'text-destructive':'text-muted-foreground'}`}>{item.level}</span><span className="min-w-0 flex-1 truncate">{item.message}</span><time className="text-xs text-muted-foreground">{new Date(item.created_at??item.createdAt??'').toLocaleString()}</time></summary>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{item.category&&`[${item.category}]\n`}{formatPayload(item)}</pre>
          </details>)}</div>
          {!!total&&<div className="flex items-center justify-between gap-4 border-t px-5 py-4 sm:px-8">
      <span className="text-sm text-muted-foreground">共 {total} 条，当前 {items.length?`${offset+1}–${offset+items.length}`:'—'}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={loading||offset<=0} onClick={()=>setOffset(value=>Math.max(0,value-PAGE_SIZE))}><ChevronLeft/>上一页</Button>
        <Button size="sm" variant="outline" disabled={loading||offset+items.length>=total} onClick={()=>setOffset(value=>value+PAGE_SIZE)}>下一页<ChevronRight/></Button>
      </div>
          </div>}
          {loading&&<div className="px-5 sm:px-8"><Notice>加载中…</Notice></div>}{!loading&&!items.length&&!error&&<div className="px-5 sm:px-8"><Notice>暂无日志</Notice></div>}
      </div>
    </section>
  </div>
}

function formatPayload(item:LogItem){
  if(item.details)return JSON.stringify(item.details,null,2)
  if(!item.payload)return ''
  try{return JSON.stringify(JSON.parse(item.payload),null,2)}catch{return item.payload}
}
