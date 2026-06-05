import { useCallback, useEffect, useMemo, useState } from 'react'

export type DashboardRoute =
  | { name: 'er-diagrams' }
  | { name: 'business-flows' }
  | { name: 'agent' }
  | { name: 'er-diagram-edit'; graphId: string }

export type DashboardMenuItem = {
  key: DashboardRoute['name']
  title: string
  path: string
}

export const dashboardMenus: DashboardMenuItem[] = [
  { key: 'er-diagrams', title: 'ER 图列表', path: '/dashboard/er-diagrams' },
  { key: 'business-flows', title: '业务图列表', path: '/dashboard/business-flows' },
  { key: 'agent', title: 'Agent 输入框', path: '/dashboard/agent' },
]

const NAVIGATION_EVENT = 'dashboard:navigate'

export function parseDashboardRoute(pathname: string): DashboardRoute {
  const erEditMatch = pathname.match(/^\/dashboard\/er-diagrams\/([^/]+)\/edit$/)
  if (erEditMatch?.[1]) {
    return { name: 'er-diagram-edit', graphId: decodeURIComponent(erEditMatch[1]) }
  }
  if (pathname === '/dashboard/business-flows') return { name: 'business-flows' }
  if (pathname === '/dashboard/agent') return { name: 'agent' }
  return { name: 'er-diagrams' }
}

export function erDiagramEditPath(graphId: string) {
  return `/dashboard/er-diagrams/${encodeURIComponent(graphId)}/edit`
}

export function dashboardPathWithSearch(path: string, search?: URLSearchParams | string) {
  if (!search) return path
  const query = typeof search === 'string' ? search.replace(/^\?/, '') : search.toString()
  return query ? `${path}?${query}` : path
}

export function useDashboardRoute() {
  const getRoute = useCallback(() => parseDashboardRoute(window.location.pathname), [])
  const [route, setRoute] = useState<DashboardRoute>(() => getRoute())

  useEffect(() => {
    const onChange = () => setRoute(getRoute())
    window.addEventListener('popstate', onChange)
    window.addEventListener(NAVIGATION_EVENT, onChange)
    if (window.location.pathname === '/') {
      window.history.replaceState(null, '', '/dashboard/er-diagrams')
      onChange()
    }
    return () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener(NAVIGATION_EVENT, onChange)
    }
  }, [getRoute])

  const navigate = useCallback((path: string, search?: URLSearchParams | string) => {
    const nextPath = dashboardPathWithSearch(path, search)
    if (`${window.location.pathname}${window.location.search}` === nextPath) return
    window.history.pushState(null, '', nextPath)
    window.dispatchEvent(new Event(NAVIGATION_EVENT))
  }, [])

  return useMemo(() => ({ route, navigate }), [navigate, route])
}
