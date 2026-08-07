import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60'

export function Page({ title, description, back, actions, children, className }: {
  title: string
  description?: string
  back?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return <div className={cn('mx-auto w-full max-w-4xl', className)}>
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {back && <Link to={back} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={13} />返回</Link>}
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
    {children}
  </div>
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`mt-3 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`} role={error ? 'alert' : undefined}>{children}</p>
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="mb-7">
    {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
    {children}
  </section>
}
