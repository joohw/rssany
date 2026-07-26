import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { fieldClass, Notice, Page } from '@/components/Page'
import { cn } from '@/lib/utils'

const settingsNavigation = [
  ['/admin/update', '自动更新', '检查并安装新版本'],
  ['/admin/tags', '标签', '管理系统标签库'],
  ['/admin/pipeline', 'Pipeline', '配置条目处理顺序与开关'],
  ['/admin/llm', 'LLM', 'OpenAI 兼容 API 配置'],
  ['/admin/proxy', '代理', '全局代理与代理列表'],
  ['/admin/deliver', '投递', '下游 URL 与 Bearer 令牌'],
  ['/admin/logs', '日志', '查看运行与抓取日志'],
] as const

export function SettingsLayout() {
  return <div className="master-detail-layout">
    <aside className="min-h-0 border-r bg-card px-3 py-5 max-md:border-b max-md:border-r-0">
      <header className="mb-5">
        <h1 className="text-base font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-xs text-muted-foreground">管理应用配置</p>
      </header>
      <nav className="space-y-1" aria-label="设置项目">
        {settingsNavigation.map(([href, label, description]) =>
          <NavLink key={href} to={href} className={({ isActive }) => cn(
            'block rounded-md px-3 py-2.5 transition-colors hover:bg-muted',
            isActive && 'bg-primary/10 text-primary',
          )}>
            <span className="block text-sm font-medium">{label}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
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

type Step={id:string;enabled:boolean}
export function PipelinePage(){
  const [steps,setSteps]=useState<Step[]>([]);const [available,setAvailable]=useState<string[]>([])
  const load=async()=>{const d=await api<{steps?:Step[];availableIds?:string[]}>('/api/pipeline');setSteps(d.steps??[]);setAvailable(d.availableIds??[])}
  const save=async()=>{await api('/api/pipeline',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({steps})})}
  const move=(i:number,d:number)=>{const n=[...steps];const [v]=n.splice(i,1);n.splice(i+d,0,v);setSteps(n)}
  return <SavePage title="Pipeline" description="配置入库后的处理顺序" load={load} save={save}>
    <div className="divide-y rounded-lg border">{steps.map((s,i)=><div key={s.id} className="flex items-center gap-3 px-4 py-3">
      <input type="checkbox" checked={s.enabled} onChange={e=>setSteps(steps.map((x,j)=>j===i?{...x,enabled:e.target.checked}:x))}/><span className="flex-1 text-sm font-medium">{s.id}</span>
      <Button size="sm" variant="ghost" disabled={i===0} onClick={()=>move(i,-1)}>↑</Button><Button size="sm" variant="ghost" disabled={i===steps.length-1} onClick={()=>move(i,1)}>↓</Button>
    </div>)}</div>
    {available.some(id=>!steps.some(s=>s.id===id))&&<Button variant="outline" onClick={()=>{const id=available.find(id=>!steps.some(s=>s.id===id));if(id)setSteps([...steps,{id,enabled:true}])}}>添加步骤</Button>}
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
