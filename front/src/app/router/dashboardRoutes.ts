import { useCallback, useEffect, useMemo, useState } from 'react'

export type DashboardRoute =
  | { name: 'er-diagrams' }
  | { name: 'products' }
  | { name: 'business-flows' }
  | { name: 'swimlane-components' }
  | { name: 'agent' }
  | { name: 'er-diagram-edit'; graphId: string }
  | { name: 'business-flow-edit'; businessFlowId: string }
  | { name: 'swimlane-component-edit'; componentId: string }

export type DashboardMenuItem = {
  key: DashboardRoute['name']
  title: string
  path: string
}

export const dashboardMenus: DashboardMenuItem[] = [
  { key: 'products', title: '产品', path: '/dashboard/products' },
  { key: 'er-diagrams', title: 'ER 图列表', path: '/dashboard/er-diagrams' },
  { key: 'business-flows', title: '业务图列表', path: '/dashboard/business-flows' },
  { key: 'swimlane-components', title: '泳道组件', path: '/dashboard/swimlane-components' },
  { key: 'agent', title: 'Agent 输入框', path: '/dashboard/agent' },
]

const NAVIGATION_EVENT = 'dashboard:navigate'

export function parseDashboardRoute(pathname: string): DashboardRoute {
  const erEditMatch = pathname.match(/^\/dashboard\/er-diagrams\/([^/]+)\/edit$/)
  if (erEditMatch?.[1]) {
    return { name: 'er-diagram-edit', graphId: decodeURIComponent(erEditMatch[1]) }
  }
  const businessFlowEditMatch = pathname.match(/^\/dashboard\/business-flows\/([^/]+)\/edit$/)
  if (businessFlowEditMatch?.[1]) {
    return {
      name: 'business-flow-edit',
      businessFlowId: decodeURIComponent(businessFlowEditMatch[1]),
    }
  }
  const swimlaneComponentEditMatch = pathname.match(
    /^\/dashboard\/swimlane-components\/([^/]+)\/edit$/,
  )
  if (swimlaneComponentEditMatch?.[1]) {
    return {
      name: 'swimlane-component-edit',
      componentId: decodeURIComponent(swimlaneComponentEditMatch[1]),
    }
  }
  if (pathname === '/dashboard/business-flows') return { name: 'business-flows' }
  if (pathname === '/dashboard/products') return { name: 'products' }
  if (pathname === '/dashboard/swimlane-components') return { name: 'swimlane-components' }
  if (pathname === '/dashboard/agent') return { name: 'agent' }
  return { name: 'er-diagrams' }
}

export function erDiagramEditPath(graphId: string) {
  return `/dashboard/er-diagrams/${encodeURIComponent(graphId)}/edit`
}

export function businessFlowEditPath(businessFlowId: string) {
  return `/dashboard/business-flows/${encodeURIComponent(businessFlowId)}/edit`
}

export function swimlaneComponentEditPath(componentId: string) {
  return `/dashboard/swimlane-components/${encodeURIComponent(componentId)}/edit`
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
