import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { completeInitialization } from '@/api/server'

export function InitializePage() {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function initialize() {
    setPending(true)
    setError(null)
    try {
      await completeInitialization()
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-lg px-2 py-8">
        <h1 className="text-base font-semibold tracking-tight">开始使用 RssAny</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">完成初始化后即可添加信源、设置抓取管线和投递 Gateway。</p>
        <Button className="mt-8 w-full" size="lg" onClick={initialize} disabled={pending}>{pending ? '正在初始化…' : '完成初始化'}</Button>
        {error && <p className="mt-4 text-sm text-destructive" role="alert">初始化失败：{error}</p>}
      </section>
    </main>
  )
}
