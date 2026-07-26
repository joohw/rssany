import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getUpdateSettings, getUpdateStatus, saveUpdateSettings, type UpdateSettings, type UpdateStatus } from '@/api/server'
import { Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const initialSettings: UpdateSettings = { autoUpdate: true, autoRestart: true }

export function UpdateSettingsPage() {
  const [settings, setSettings] = useState<UpdateSettings>(initialSettings)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([getUpdateSettings(), getUpdateStatus()])
      .then(([nextSettings, nextStatus]) => { setSettings(nextSettings); setStatus(nextStatus) })
      .catch((cause: unknown) => toast.error(`加载失败：${cause instanceof Error ? cause.message : String(cause)}`))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const result = await saveUpdateSettings(settings)
      setSettings({ autoUpdate: result.autoUpdate, autoRestart: result.autoRestart })
      toast.success('已保存')
    } catch (cause) {
      toast.error(`保存失败：${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page
      title="自动更新"
      description="每 6 小时检查 npm 新版本；仅通过 rssany start 托管的服务会执行自动安装。"
      actions={<Button onClick={save} disabled={loading || saving}>{saving ? '保存中…' : '保存'}</Button>}
    >
      {loading ? <p className="py-12 text-center text-sm text-muted-foreground">加载中…</p> : <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">更新策略</h2>
          <div className="divide-y rounded-lg border bg-card">
            <SettingRow id="auto-update" label="自动更新" description="发现新版本后自动下载并安装" checked={settings.autoUpdate} onCheckedChange={(autoUpdate) => setSettings((previous) => ({ ...previous, autoUpdate }))} />
            <SettingRow id="auto-restart" label="更新后自动重启" description="安装完成后自动恢复服务运行" checked={settings.autoRestart} disabled={!settings.autoUpdate} onCheckedChange={(autoRestart) => setSettings((previous) => ({ ...previous, autoRestart }))} />
          </div>
        </div>
        {status && <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">版本状态</h2>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm">当前版本 <code>{status.currentVersion}</code>{status.latestVersion && <> · 最新版本 <code>{status.latestVersion}</code></>}</p>
            <p className="mt-1 text-sm text-muted-foreground">{!status.latestVersion ? '暂时无法连接 npm' : status.updateAvailable ? '检测到可用更新' : '已是最新版本'}</p>
          </div>
          {!status.managed && <p className="text-sm text-muted-foreground">当前进程不是由 rssany 命令托管，自动安装不会执行；开发模式下这是正常现象。</p>}
        </div>}
      </div>}
    </Page>
  )
}

function SettingRow({ id, label, description, checked, disabled, onCheckedChange }: { id: string; label: string; description: string; checked: boolean; disabled?: boolean; onCheckedChange: (value: boolean) => void }) {
  return <div className="flex items-center gap-4 px-4 py-3 data-[disabled=true]:opacity-50" data-disabled={disabled}>
    <div className="min-w-0 flex-1"><Label htmlFor={id} className="text-sm font-medium">{label}</Label><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
    <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
  </div>
}
