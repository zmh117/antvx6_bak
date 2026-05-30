import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  clearAuthSession,
  fetchMe,
  getCurrentUser,
  login,
  register,
  setAuthSession,
  subscribeAuth,
  type CurrentUser,
} from '@/entities/auth'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => getCurrentUser())
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeAuth(() => setUser(getCurrentUser()))
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetchMe().catch(() => {
      clearAuthSession()
      setUser(null)
    })
  }, [user])

  const title = useMemo(() => (mode === 'login' ? '登录 ER 协同编辑' : '创建本地账号'), [mode])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password, displayName || email.split('@')[0])
      setAuthSession(response.access_token, response.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (user) {
    return (
      <>
        <div className="absolute right-28 top-3 z-40 flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
          <span className="max-w-40 truncate">{user.display_name || user.email}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={clearAuthSession}
          >
            退出
          </button>
        </div>
        {children}
      </>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            登录后才会连接 Yjs 协同房间，并按图成员权限控制编辑。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {mode === 'register' ? (
          <div className="space-y-2">
            <Label htmlFor="display-name">显示名</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：明浩"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error ? (
          <Alert variant="destructive" className="py-2">
            <AlertTitle className="text-xs">认证失败</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册并进入'}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode((v) => (v === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? '没有账号，创建一个' : '已有账号，返回登录'}
        </button>
      </form>
    </section>
  )
}
