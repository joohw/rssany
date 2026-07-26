import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Bot, Puzzle, Rss, ScrollText, Settings } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getInitialization } from '@/api/server'
import { cn } from '@/lib/utils'

const navigation = [
  { to: '/', label: '信源', icon: Rss, end: true },
  { to: '/logs', label: '日志', icon: ScrollText },
  { to: '/plugins', label: '插件', icon: Puzzle },
  { to: '/skill', label: 'Skill', icon: Bot },
  { to: '/admin', label: '设置', icon: Settings },
]

const GITHUB_REPO_URL = 'https://github.com/joohw/rssany'

export function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [checkedInitialization, setCheckedInitialization] = useState(false)

  useEffect(() => {
    void getInitialization()
      .then(({ initialized }) => {
        if (!initialized && pathname !== '/init') navigate('/init', { replace: true })
      })
      .finally(() => setCheckedInitialization(true))
  }, [navigate, pathname])

  if (!checkedInitialization && pathname !== '/init') return null
  if (pathname === '/init') return <><Outlet /><Toaster richColors /></>

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh bg-background p-2 sm:p-3">
        <div className="app-frame">
          <aside className="app-nav-rail">
            <nav className="app-nav-links" aria-label="主导航">
              {navigation.map(({ to, label, icon: Icon, end }) => (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={to}
                      end={end}
                      aria-label={label}
                      className="app-nav-link"
                    >
                      <Icon className="app-nav-icon" aria-hidden="true" />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </nav>
            <footer className="app-nav-footer">
              <a
                className="app-nav-github"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="在 GitHub 打开源码仓库"
                title="GitHub"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 1.7a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-2.04c-2.93.64-3.55-1.24-3.55-1.24-.48-1.22-1.17-1.54-1.17-1.54-.96-.66.07-.64.07-.64 1.06.07 1.62 1.09 1.62 1.09.94 1.62 2.47 1.15 3.08.88.1-.68.37-1.15.67-1.42-2.34-.27-4.8-1.17-4.8-5.2 0-1.15.41-2.09 1.08-2.83-.11-.27-.47-1.34.1-2.8 0 0 .88-.28 2.89 1.08a10 10 0 0 1 5.26 0c2-1.36 2.88-1.08 2.88-1.08.58 1.46.22 2.53.11 2.8.67.74 1.08 1.68 1.08 2.83 0 4.05-2.47 4.93-4.82 5.19.38.33.72.97.72 1.95v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.7Z"
                  />
                </svg>
              </a>
              <NavLink className="app-nav-brand" to="/" aria-label="返回信源首页" title="rssany">
                rssany
              </NavLink>
            </footer>
          </aside>
          <main className={cn(
            'min-h-0 min-w-0 flex-1',
            pathname === '/' || pathname.startsWith('/admin') || pathname.startsWith('/plugins') ? 'overflow-hidden' : 'overflow-auto px-5 py-6 sm:px-8',
          )}><Outlet /></main>
        </div>
      </div>
      <Toaster richColors />
    </TooltipProvider>
  )
}
