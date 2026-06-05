import { AlertCircle, Database, Edit3, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGraphsQuery, type GraphMeta } from '@/entities/er-graph/api'
import { formatDateTime } from '@/shared/lib/date'

const statusText: Record<string, string> = {
  active: '使用中',
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

function statusLabel(status: string) {
  return statusText[status] ?? status
}

function GraphRow({
  graph,
  onEditGraph,
}: {
  graph: GraphMeta
  onEditGraph: (graphId: string) => void
}) {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(220px,1.5fr)_minmax(120px,0.8fr)_90px_90px_110px_120px_86px] items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Database className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{graph.name}</div>
          <div className="truncate text-xs text-muted-foreground">{graph.description || graph.id}</div>
        </div>
      </div>
      <div className="truncate text-muted-foreground">{graph.business_domain || '默认域'}</div>
      <div className="tabular-nums">{graph.table_count ?? 0}</div>
      <div className="tabular-nums">{graph.relation_count ?? 0}</div>
      <div>
        <span className="inline-flex h-6 items-center rounded-md border border-border px-2 text-xs">
          {statusLabel(graph.status)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{formatDateTime(graph.updated_at)}</div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onEditGraph(graph.id)}>
          <Edit3 className="size-4" />
          编辑
        </Button>
      </div>
    </div>
  )
}

export function ErDiagramListPage({ onEditGraph }: { onEditGraph: (graphId: string) => void }) {
  const graphsQuery = useGraphsQuery()

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">ER 图列表</h3>
          <p className="text-xs text-muted-foreground">按业务域管理数据结构关系</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => graphsQuery.refetch()}
          disabled={graphsQuery.isFetching}
        >
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="min-w-[900px] overflow-hidden rounded-md border border-border bg-card">
          <div className="grid h-9 grid-cols-[minmax(220px,1.5fr)_minmax(120px,0.8fr)_90px_90px_110px_120px_86px] items-center gap-3 border-b border-border bg-muted/50 px-4 text-xs font-medium text-muted-foreground">
            <div>图名称</div>
            <div>业务域</div>
            <div>表</div>
            <div>关系</div>
            <div>状态</div>
            <div>更新时间</div>
            <div className="text-right">操作</div>
          </div>

          {graphsQuery.isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">加载中...</div>
          ) : graphsQuery.error ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {graphsQuery.error instanceof Error ? graphsQuery.error.message : '加载失败'}
            </div>
          ) : graphsQuery.data?.length ? (
            graphsQuery.data.map((graph) => (
              <GraphRow key={graph.id} graph={graph} onEditGraph={onEditGraph} />
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">暂无 ER 图</div>
          )}
        </div>
      </div>
    </section>
  )
}
