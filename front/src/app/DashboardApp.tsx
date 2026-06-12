import React, { Suspense, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import {
  businessFlowEditPath,
  dashboardMenus,
  erDiagramEditPath,
  swimlaneComponentEditPath,
  useDashboardRoute,
  type DashboardRoute,
} from '@/app/router/dashboardRoutes'
import { AgentPanelPage } from '@/features/agent-panel/AgentPanelPage'
import { BusinessFlowEditor } from '@/features/business-flow-editor'
import { BusinessFlowListPage } from '@/features/business-flow-list/BusinessFlowListPage'
import { ErDiagramListPage } from '@/features/er-diagram-list/ErDiagramListPage'
import {
  SwimlaneComponentEditorPage,
  SwimlaneComponentListPage,
} from '@/features/swimlane-component/presentation/SwimlaneComponentPages'

const ErDiagramEditor = React.lazy(() =>
  import('@/features/er-diagram-editor').then((module) => ({
    default: module.ErDiagramEditor,
  })),
)

function routeTitle(route: DashboardRoute) {
  if (route.name === 'er-diagram-edit') return 'ER 图编辑器'
  if (route.name === 'business-flow-edit') return '业务图编辑器'
  if (route.name === 'swimlane-component-edit') return '泳道组件编辑器'
  return dashboardMenus.find((item) => item.key === route.name)?.title ?? 'ER 建模工作台'
}

function routeSubtitle(route: DashboardRoute) {
  if (route.name === 'er-diagram-edit') return 'AntV X6 · 工业数据建模'
  if (route.name === 'business-flow-edit') return '可复用泳道组件实例化编排'
  if (route.name === 'swimlane-component-edit') return '预画可复用流程组件'
  if (route.name === 'business-flows') return '业务流程与 ER 图绑定'
  if (route.name === 'swimlane-components') return '泳道模板组件库'
  if (route.name === 'agent') return '上下文驱动的智能入口'
  return '图谱资产入口'
}

export function DashboardApp() {
  const { navigate, route } = useDashboardRoute()
  const activeMenu =
    route.name === 'er-diagram-edit'
      ? 'er-diagrams'
      : route.name === 'business-flow-edit'
        ? 'business-flows'
        : route.name === 'swimlane-component-edit'
          ? 'swimlane-components'
          : route.name
  const shellTitle = useMemo(() => routeTitle(route), [route])
  const shellSubtitle = useMemo(() => routeSubtitle(route), [route])

  let content: React.ReactNode
  if (route.name === 'business-flows') {
    content = <BusinessFlowListPage onOpenCanvas={(flowId) => navigate(businessFlowEditPath(flowId))} />
  } else if (route.name === 'business-flow-edit') {
    content = (
      <BusinessFlowEditor
        key={route.businessFlowId}
        businessFlowId={route.businessFlowId}
        onBack={() => navigate('/dashboard/business-flows')}
      />
    )
  } else if (route.name === 'swimlane-components') {
    content = (
      <SwimlaneComponentListPage
        onCreate={(componentId) => navigate(swimlaneComponentEditPath(componentId))}
        onEdit={(componentId) => navigate(swimlaneComponentEditPath(componentId))}
      />
    )
  } else if (route.name === 'swimlane-component-edit') {
    content = (
      <SwimlaneComponentEditorPage
        key={route.componentId}
        componentId={route.componentId}
        onBack={() => navigate('/dashboard/swimlane-components')}
      />
    )
  } else if (route.name === 'agent') {
    content = <AgentPanelPage />
  } else if (route.name === 'er-diagram-edit') {
    content = (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/er-diagrams')}>
            <ArrowLeft className="size-4" />
            返回列表
          </Button>
          <div className="truncate text-xs text-muted-foreground">{route.graphId}</div>
        </div>
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">加载画布...</div>}>
          <ErDiagramEditor key={route.graphId} graphId={route.graphId} />
        </Suspense>
      </section>
    )
  } else {
    content = <ErDiagramListPage onEditGraph={(graphId) => navigate(erDiagramEditPath(graphId))} />
  }

  return (
    <AppShell
      activeRoute={activeMenu}
      onNavigate={navigate}
      title={shellTitle}
      subtitle={shellSubtitle}
    >
      {content}
    </AppShell>
  )
}
