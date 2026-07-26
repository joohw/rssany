import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/Page'

export function SkillPage(){
  const base=typeof window==='undefined'?'http://127.0.0.1:18473':window.location.origin
  const text=useMemo(()=>`# RssAny Agent 能力增强说明

RssAny 把网页列表、RSS/Atom、邮件等信源转成统一条目库，并输出 JSON / RSS。

## 使用

1. 打开 Web UI：${base}/
2. 读取最新 JSON 条目：${base}/api/feed?limit=50
3. 读取 RSS：${base}/rss?limit=50
4. 指定信源：${base}/api/feed?ref=<sourceRef>&limit=50
5. 管理插件：${base}/plugins
6. 后台设置：${base}/admin

## Agent 原则

- 优先读取 JSON feed，保留标题、链接、来源和发布时间。
- 关键判断回到原文核对；区分事实、推断和建议。
- 按主题、时间和来源过滤噪声，再形成摘要、行动项或监控结果。
- 目标站点没有 Feed 时，在用户插件目录创建 .rssany.js 插件。
- 不要未经用户明确要求删除、重置或破坏用户数据。
`,[base])
  const [copied,setCopied]=useState(false)
  const copy=async()=>{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500)}
  return <Page title="Skill" description="提供给 Agent 的 RssAny 使用说明" actions={<Button onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>}复制</Button>}><pre className="overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-5 text-sm leading-6">{text}</pre></Page>
}
