import { AlertCircle, Network, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getDefaultGraphId, useGraphsQuery } from '@/entities/er-graph/api'
import { useBusinessFlowsQuery, type BusinessFlowRecord } from '@/entities/business-flow/api'

function FlowRow({ flow }: { flow: BusinessFlowRecord }) {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(220px,1.4fr)_110px_110px_110px_110px] items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Network className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{flow.name}</div>
          <div className="truncate text-xs text-muted-foreground">{flow.description || flow.flow_key}</div>
        </div>
      </div>
      <div className="tabular-nums">{flow.nodes.length}</div>
      <div className="tabular-nums">{flow.edges.length}</div>
      <div className="tabular-nums">{flow.bindings.length}</div>
      <div className="text-muted-foreground">v{flow.version}</div>
    </div>
  )
}

export function BusinessFlowListPage() {
  const graphsQuery = useGraphsQuery()
  const [selectedGraphId, setSelectedGraphId] = useState(() => getDefaultGraphId())
  const graphs = graphsQuery.data ?? []

  useEffect(() => {
    if (graphs.length && !graphs.some((graph) => graph.id === selectedGraphId)) {
      setSelectedGraphId(graphs[0].id)
    }
  }, [graphs, selectedGraphId])

  const selectedGraphName = useMemo(
    () => graphs.find((graph) => graph.id === selectedGraphId)?.name ?? selectedGraphId,
    [graphs, selectedGraphId],
  )
  const flowsQuery = useBusinessFlowsQuery(selectedGraphId)

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">业务图列表</h3>
          <p className="text-xs text-muted-foreground">当前 ER 图：{selectedGraphName}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-8 max-w-64 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedGraphId}
            onChange={(event) => setSelectedGraphId(event.target.value)}
          >
            {graphs.length ? (
              graphs.map((graph) => (
                <option key={graph.id} value={graph.id}>
                  {graph.name}
                </option>
              ))
            ) : (
              <option value={selectedGraphId}>{selectedGraphId}</option>
            )}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => flowsQuery.refetch()}
            disabled={flowsQuery.isFetching}
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="min-w-[720px] overflow-hidden rounded-md border border-border bg-card">
          <div className="grid h-9 grid-cols-[minmax(220px,1.4fr)_110px_110px_110px_110px] items-center gap-3 border-b border-border bg-muted/50 px-4 text-xs font-medium text-muted-foreground">
            <div>业务图</div>
            <div>节点</div>
            <div>边</div>
            <div>绑定</div>
            <div>版本</div>
          </div>
          {flowsQuery.isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">加载中...</div>
          ) : flowsQuery.error ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {flowsQuery.error instanceof Error ? flowsQuery.error.message : '加载失败'}
            </div>
          ) : flowsQuery.data?.length ? (
            flowsQuery.data.map((flow) => <FlowRow key={flow.flow_key} flow={flow} />)
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">暂无业务图</div>
          )}
        </div>
      </div>
    </section>
  )
}
