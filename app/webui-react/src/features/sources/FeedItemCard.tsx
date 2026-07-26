import { useEffect, useMemo, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

export type FeedItem = {
  id:string
  title?:string|null
  summary?:string|null
  content?:string|null
  link?:string|null
  url?:string|null
  author?:string[]|string|null
  image_url?:string|null
  pub_date?:string|null
  pubDate?:string|null
  fetched_at?:string|null
  source_url?:string|null
}

export function FeedItemCard({item,sourceRef,onDelete}:{item:FeedItem;sourceRef:string;onDelete:(item:FeedItem)=>void|Promise<void>}){
  const [faviconFailed,setFaviconFailed]=useState(false)
  const link=(item.url||item.link||'').trim()
  const authors=normalizeAuthors(item.author)
  const bodyRaw=(item.content?.trim()||item.summary?.trim()||'').trim()
  const summary=stripHtml(removeInlineImages(bodyRaw))
  const cover=(item.image_url?.trim()||extractInlineImage(bodyRaw)||'').trim()
  const hostname=siteHostname(link,sourceRef)
  const favicon=hostname?`/api/feed-favicon?domain=${encodeURIComponent(hostname)}`:''
  const letter=firstLetter(hostname)||firstLetter(authors[0]||'')||firstLetter(sourceRef)||'?'
  const avatarBackground=useMemo(()=>stableAvatarColor(item.id||link||sourceRef||letter),[item.id,letter,link,sourceRef])
  const publishedAt=item.pub_date||item.pubDate||item.fetched_at||''
  const hasTitle=Boolean(item.title?.trim())

  useEffect(()=>setFaviconFailed(false),[favicon])

  const copyJson=async()=>{
    try{
      await navigator.clipboard.writeText(JSON.stringify(item,null,2))
      toast.success('已复制 JSON')
    }catch{toast.error('复制失败')}
  }

  return <ContextMenu>
    <ContextMenuTrigger asChild>
      <article className="feed-item-card">
        <div className="feed-item-avatar" style={{backgroundColor:favicon&&!faviconFailed?'transparent':avatarBackground}}>
          {favicon&&!faviconFailed
            ?<img src={favicon} alt="" loading="lazy" decoding="async" onError={()=>setFaviconFailed(true)}/>
            :<span aria-hidden="true">{letter}</span>}
        </div>
        <div className="feed-item-main">
          <div className="feed-item-byline">
            <span className={authors.length?'feed-item-author':'feed-item-author feed-item-author--empty'}>{authors.length?authors.join('、'):'未署名'}</span>
            {publishedAt&&<time dateTime={publishedAt} title={publishedAt}>{formatPublishTime(publishedAt)}</time>}
          </div>
          {hasTitle&&(link
            ?<a className="feed-item-title" href={link} target="_blank" rel="noopener noreferrer">{item.title}</a>
            :<span className="feed-item-title">{item.title}</span>)}
          {summary&&(link&&!hasTitle
            ?<a className="feed-item-summary-link" href={link} target="_blank" rel="noopener noreferrer"><p className="feed-item-summary">{summary}</p></a>
            :<p className="feed-item-summary">{summary}</p>)}
          {!hasTitle&&!summary&&link&&<a className="feed-item-open-original" href={link} target="_blank" rel="noopener noreferrer">查看原文</a>}
          {cover&&<div className="feed-item-media">{link
            ?<a href={link} target="_blank" rel="noopener noreferrer" title="打开原文"><img src={cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/></a>
            :<img src={cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>}</div>}
        </div>
      </article>
    </ContextMenuTrigger>
    <ContextMenuContent className="min-w-36">
      <ContextMenuItem onSelect={()=>void copyJson()}><Copy/>复制 JSON</ContextMenuItem>
      <ContextMenuSeparator/>
      <ContextMenuItem variant="destructive" onSelect={()=>void onDelete(item)}><Trash2/>删除</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
}

function normalizeAuthors(author:FeedItem['author']):string[]{
  if(Array.isArray(author))return author.map(String).map(value=>value.trim()).filter(Boolean)
  if(typeof author==='string'&&author.trim())return author.split(/[,，]/).map(value=>value.trim()).filter(Boolean)
  return []
}

function stripHtml(value:string):string{
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,'')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function extractInlineImage(value:string):string{
  const markdown=value.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/)
  if(markdown?.[1])return markdown[1].trim()
  return value.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1]?.trim()||''
}

function removeInlineImages(value:string):string{
  return value
    .replace(/!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g,' ')
    .replace(/<img\b[^>]*>/gi,' ')
}

function siteHostname(link:string,sourceRef:string):string{
  for(const value of [link,sourceRef]){
    try{
      const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`)
      if(url.hostname)return url.hostname.replace(/^www\./i,'')
    }catch{/* 尝试下一个地址 */}
  }
  return ''
}

function firstLetter(value:string):string{
  const letter=value.trim().charAt(0)
  return /[a-z0-9\u4e00-\u9fff]/i.test(letter)?letter.toUpperCase():''
}

function stableAvatarColor(seed:string):string{
  let hash=2166136261
  for(let index=0;index<seed.length;index++){hash^=seed.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return `hsl(${(hash>>>0)%360} 46% 46%)`
}

function formatPublishTime(value:string):string{
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return ''
  const diff=Date.now()-date.getTime()
  const dateLabel=date.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})
  if(diff<0)return dateLabel
  const days=Math.floor(diff/86_400_000)
  const hours=Math.floor(diff/3_600_000)
  if(days>=7)return dateLabel
  if(days>=1)return `${days} day${days===1?'':'s'} ago`
  if(hours>=1)return `${hours} hour${hours===1?'':'s'} ago`
  return 'just now'
}
