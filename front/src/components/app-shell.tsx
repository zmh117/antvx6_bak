import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm font-semibold tracking-tight">ER 图编辑器</h1>
          <p className="truncate text-xs text-muted-foreground">AntV X6 · 工业数据建模</p>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
