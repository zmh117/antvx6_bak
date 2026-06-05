import { Database, Network, Send, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getDefaultGraphId, useGraphsQuery } from '@/entities/er-graph/api'
import { useBusinessFlowsQuery } from '@/entities/business-flow/api'

export type AgentAskDraft = {
  question: string
  context: {
    productIds: string[]
    erDiagramIds: string[]
    businessFlowIds: string[]
  }
}

export function AgentPanelPage() {
  const graphsQuery = useGraphsQuery()
  const graphs = graphsQuery.data ?? []
  const [selectedGraphIds, setSelectedGraphIds] = useState<string[]>([])
  const activeGraphId = selectedGraphIds[0] ?? graphs[0]?.id ?? getDefaultGraphId()
  const flowsQuery = useBusinessFlowsQuery(activeGraphId)
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')

  useEffect(() => {
    if (!selectedGraphIds.length && graphs.length) {
      setSelectedGraphIds([graphs[0].id])
    }
  }, [graphs, selectedGraphIds.length])

  const toggleGraph = (graphId: string) => {
    setSelectedGraphIds((current) =>
      current.includes(graphId)
        ? current.filter((id) => id !== graphId)
        : [...current, graphId],
    )
  }

  const toggleFlow = (flowKey: string) => {
    setSelectedFlowIds((current) =>
      current.includes(flowKey)
        ? current.filter((id) => id !== flowKey)
        : [...current, flowKey],
    )
  }

  const draft: AgentAskDraft = {
    question,
    context: {
      productIds: [],
      erDiagramIds: selectedGraphIds,
      businessFlowIds: selectedFlowIds,
    },
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Agent 输入框</h3>
          <p className="text-xs text-muted-foreground">状态：入口预留</p>
        </div>
        <div className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          待接入
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Database className="size-4" />
                ER 图上下文
              </div>
              <div className="space-y-1">
                {graphs.length ? (
                  graphs.map((graph) => (
                    <label
                      key={graph.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGraphIds.includes(graph.id)}
                        onChange={() => toggleGraph(graph.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{graph.name}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {graphsQuery.isLoading ? '加载中...' : '暂无 ER 图'}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Network className="size-4" />
                业务图上下文
              </div>
              <div className="space-y-1">
                {flowsQuery.data?.length ? (
                  flowsQuery.data.map((flow) => (
                    <label
                      key={flow.flow_key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFlowIds.includes(flow.flow_key)}
                        onChange={() => toggleFlow(flow.flow_key)}
                      />
                      <span className="min-w-0 flex-1 truncate">{flow.name}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {flowsQuery.isLoading ? '加载中...' : '暂无业务图'}
                  </div>
                )}
              </div>
            </section>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col p-4">
          <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
              ER {draft.context.erDiagramIds.length} · 业务图 {draft.context.businessFlowIds.length}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              <Textarea
                className="min-h-36 resize-none"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="输入问题..."
              />
              <div className="flex justify-end">
                <Button disabled>
                  <Send className="size-4" />
                  发送
                </Button>
              </div>
              <div className="min-h-0 flex-1 rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Agent 结果区
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
