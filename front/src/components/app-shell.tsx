import type { ReactNode } from 'react'
import { Database, Layers3, LogOut, Network, Sparkles } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { clearAuthSession, getCurrentUser } from '@/entities/auth'
import { dashboardMenus, type DashboardRoute } from '@/app/router/dashboardRoutes'
import { cn } from '@/lib/utils'

const menuIcons: Record<string, typeof Database> = {
  'er-diagrams': Database,
  'business-flows': Network,
  'swimlane-components': Layers3,
  agent: Sparkles,
}

export function AppShell({
  activeRoute,
  children,
  onNavigate,
  subtitle,
  title,
}: {
  activeRoute: DashboardRoute['name']
  children: ReactNode
  onNavigate: (path: string) => void
  subtitle?: string
  title: string
}) {
  const user = getCurrentUser()

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <div className="flex h-14 shrink-0 flex-col justify-center border-b border-sidebar-border px-4">
          <h1 className="truncate text-sm font-semibold tracking-tight">ER 建模工作台</h1>
          <p className="truncate text-xs text-muted-foreground">AntV X6 · 工业数据建模</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {dashboardMenus.map((item) => {
            const Icon = menuIcons[item.key] ?? Database
            const active = activeRoute === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
                onClick={() => onNavigate(item.path)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3 md:px-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <span className="max-w-40 truncate">{user.display_name || user.email}</span>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                  onClick={clearAuthSession}
                  title="退出"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            ) : null}
            <ThemeToggle />
          </div>
        </header>
        <div className="flex gap-1 border-b border-border bg-card px-2 py-1 md:hidden">
          {dashboardMenus.map((item) => {
            const Icon = menuIcons[item.key] ?? Database
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'inline-flex h-9 flex-1 items-center justify-center rounded-md px-2 text-xs',
                  activeRoute === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                onClick={() => onNavigate(item.path)}
                title={item.title}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </section>
    </div>
  )
}
