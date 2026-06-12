import { useCallback, useEffect, useRef, useState } from 'react'
import { Graph, type Cell, type Edge } from '@antv/x6'
import {
  ArrowLeft,
  GripVertical,
  Layers3,
  Save,
  Waypoints,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useBusinessFlowMetasQuery } from '@/entities/business-flow/api'
import type { LocalBusinessFlowCanvas, SwimlaneComponentListItem } from '@/entities/business-flow'
import {
  ensureBusinessFlowCanvas,
  listPublishedSwimlaneComponentItems,
  placeSwimlaneComponent,
  saveBusinessFlowCanvas,
} from '@/features/business-flow/domain/localBusinessFlowStore'
import {
  createBusinessFlowGraph,
  flowDraftFromGraph,
  graphPointFromEvent,
  readCellData,
  renderBusinessFlowCanvas,
  updateEdgeText,
  updateNodeText,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'

type SelectedBusinessCell =
  | { kind: 'lane'; cell: Cell; displayName: string; ownerRole: string }
  | { kind: 'node'; cell: Cell; title: string; description: string; actor: string; businessRule: string }
  | { kind: 'edge'; cell: Edge; label: string }
  | null

export function BusinessFlowEditor({
  businessFlowId,
  onBack,
}: {
  businessFlowId: string
  onBack: () => void
}) {
  const metasQuery = useBusinessFlowMetasQuery()
  const meta = metasQuery.data?.find((item) => item.id === businessFlowId)
  const graphRef = useRef<Graph | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<LocalBusinessFlowCanvas | null>(null)
  const persistTimer = useRef<number | null>(null)
  const [canvas, setCanvas] = useState<LocalBusinessFlowCanvas>(() =>
    ensureBusinessFlowCanvas({
      id: businessFlowId,
      name: meta?.name ?? businessFlowId,
      code: meta?.code ?? null,
      description: meta?.description ?? null,
    }),
  )
  const [palette, setPalette] = useState<SwimlaneComponentListItem[]>(() =>
    listPublishedSwimlaneComponentItems(),
  )
  const [selected, setSelected] = useState<SelectedBusinessCell>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  canvasRef.current = canvas

  useEffect(() => {
    const next = ensureBusinessFlowCanvas({
      id: businessFlowId,
      name: meta?.name ?? canvas.name,
      code: meta?.code ?? canvas.code,
      description: meta?.description ?? canvas.description,
    })
    setCanvas(next)
    canvasRef.current = next
  }, [businessFlowId, canvas.code, canvas.description, canvas.name, meta?.code, meta?.description, meta?.name])

  const persistCanvas = useCallback(() => {
    const graph = graphRef.current
    const current = canvasRef.current
    if (!graph || !current) return
    const draft = flowDraftFromGraph(graph, current)
    const saved = saveBusinessFlowCanvas(draft)
    canvasRef.current = saved
    setCanvas(saved)
    setSavedAt(new Date().toLocaleTimeString())
  }, [])

  const schedulePersist = useCallback(() => {
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null
      persistCanvas()
    }, 120)
  }, [persistCanvas])

  useEffect(() => {
    if (!containerRef.current) return
    const graph = createBusinessFlowGraph(containerRef.current)
    graphRef.current = graph
    renderBusinessFlowCanvas(graph, canvasRef.current ?? ensureBusinessFlowCanvas({ id: businessFlowId }))

    graph.on('cell:click', ({ cell }) => setSelected(readSelectedBusinessCell(cell)))
    graph.on('blank:click', () => setSelected(null))
    graph.on('node:moved', schedulePersist)
    graph.on('node:resized', schedulePersist)
    graph.on('edge:connected', ({ edge }) => {
      const data = readCellData(edge)
      edge.setData({
        ...data,
        cellRole: 'FLOW_EDGE',
        businessFlowId,
        edgeKey: data.edgeKey ?? edge.id,
        title: '',
      })
      setSelected(readSelectedBusinessCell(edge))
      schedulePersist()
    })
    graph.on('edge:removed', schedulePersist)
    graph.on('node:removed', schedulePersist)
    return () => {
      if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
      graph.dispose()
      graphRef.current = null
    }
  }, [businessFlowId, schedulePersist])

  useEffect(() => {
    setPalette(listPublishedSwimlaneComponentItems())
  }, [])

  function dropComponent(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const graph = graphRef.current
    if (!graph) return
    const componentVersionId = event.dataTransfer.getData('application/x-swimlane-component')
    if (!componentVersionId) return
    const point = graphPointFromEvent(graph, event.nativeEvent)
    const result = placeSwimlaneComponent(businessFlowId, componentVersionId, {
      x: point.x - 160,
      y: point.y - 28,
    })
    if (!result) return
    canvasRef.current = result.canvas
    setCanvas(result.canvas)
    renderBusinessFlowCanvas(graph, result.canvas)
    setSavedAt(new Date().toLocaleTimeString())
  }

  function forceSave() {
    persistCanvas()
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            返回业务图列表
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{canvas.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{canvas.code || businessFlowId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            {canvas.laneInstances.length} 泳道
          </Badge>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {canvas.edges.filter((edge) => edge.isCrossLane).length} 跨泳道线
          </Badge>
          {savedAt ? <span className="text-xs text-muted-foreground">已保存 {savedAt}</span> : null}
          <Button size="sm" onClick={forceSave}>
            <Save className="size-4" />
            保存
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_310px]">
        <SwimlaneComponentPalette items={palette} />
        <div
          className="relative min-h-0"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropComponent}
        >
          <div ref={containerRef} className="h-full w-full" />
          {canvas.laneInstances.length === 0 ? (
            <div className="pointer-events-none absolute left-1/2 top-10 w-80 -translate-x-1/2 rounded-md border border-dashed border-border bg-card/85 px-4 py-3 text-center text-xs text-muted-foreground shadow-sm">
              从左侧拖入泳道组件，生成业务图中的泳道实例。
            </div>
          ) : null}
        </div>
        <aside className="min-h-0 border-l border-border bg-card">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Waypoints className="size-4 text-primary" />
                  业务图投影
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="泳道" value={canvas.laneInstances.length} />
                  <Metric label="节点" value={canvas.nodes.length} />
                  <Metric label="连线" value={canvas.edges.length} />
                </div>
              </div>
              <Separator />
              <BusinessInspector selected={selected} onChange={setSelected} onPersist={schedulePersist} />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </section>
  )
}

function SwimlaneComponentPalette({ items }: { items: SwimlaneComponentListItem[] }) {
  return (
    <aside className="min-h-0 border-r border-border bg-card">
      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Layers3 className="size-4 text-primary" />
              泳道组件库
            </div>
            <p className="mt-1 text-xs text-muted-foreground">拖入业务画布后复制为独立实例。</p>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.componentVersionId}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-swimlane-component', item.componentVersionId)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                className="flex w-full items-start gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary/60 hover:bg-accent"
              >
                <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{item.ownerRole || '未设置角色'}</span>
                    <span>v{item.versionNo}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function BusinessInspector({
  selected,
  onChange,
  onPersist,
}: {
  selected: SelectedBusinessCell
  onChange: (selected: SelectedBusinessCell) => void
  onPersist: () => void
}) {
  if (!selected) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        选择泳道、节点或连线后编辑属性。
      </div>
    )
  }
  if (selected.kind === 'lane') {
    return (
      <div>
        <div className="text-xs font-semibold">泳道实例</div>
        <FieldGroup className="mt-3">
          <Field>
            <FieldLabel>展示名称</FieldLabel>
            <Input
              value={selected.displayName}
              onChange={(event) => {
                const displayName = event.target.value
                selected.cell.attr('label/text', displayName)
                selected.cell.setData({ ...readCellData(selected.cell), title: displayName })
                onChange({ ...selected, displayName })
                onPersist()
              }}
            />
          </Field>
          <Field>
            <FieldLabel>负责角色</FieldLabel>
            <Input
              value={selected.ownerRole}
              onChange={(event) => {
                const ownerRole = event.target.value
                selected.cell.attr('owner/text', ownerRole)
                onChange({ ...selected, ownerRole })
                onPersist()
              }}
            />
          </Field>
        </FieldGroup>
      </div>
    )
  }
  if (selected.kind === 'edge') {
    return (
      <div>
        <div className="text-xs font-semibold">连线属性</div>
        <FieldGroup className="mt-3">
          <Field>
            <FieldLabel>标签</FieldLabel>
            <Input
              value={selected.label}
              onChange={(event) => {
                const label = event.target.value
                updateEdgeText(selected.cell, label)
                onChange({ ...selected, label })
                onPersist()
              }}
            />
          </Field>
        </FieldGroup>
      </div>
    )
  }
  return (
    <div>
      <div className="text-xs font-semibold">流程节点</div>
      <FieldGroup className="mt-3">
        <Field>
          <FieldLabel>标题</FieldLabel>
          <Input
            value={selected.title}
            onChange={(event) => {
              const title = event.target.value
              updateNodeText(selected.cell, title)
              onChange({ ...selected, title })
              onPersist()
            }}
          />
        </Field>
        <Field>
          <FieldLabel>描述</FieldLabel>
          <Textarea
            rows={3}
            value={selected.description}
            onChange={(event) => {
              const description = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), description })
              onChange({ ...selected, description })
              onPersist()
            }}
          />
        </Field>
        <Field>
          <FieldLabel>角色</FieldLabel>
          <Input
            value={selected.actor}
            onChange={(event) => {
              const actor = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), actor })
              onChange({ ...selected, actor })
              onPersist()
            }}
          />
        </Field>
        <Field>
          <FieldLabel>业务规则</FieldLabel>
          <Textarea
            rows={3}
            value={selected.businessRule}
            onChange={(event) => {
              const businessRule = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), businessRule })
              onChange({ ...selected, businessRule })
              onPersist()
            }}
          />
        </Field>
      </FieldGroup>
    </div>
  )
}

function readSelectedBusinessCell(cell: Cell): SelectedBusinessCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
    }
  }
  if (data.cellRole === 'LANE_INSTANCE') {
    return {
      kind: 'lane',
      cell,
      displayName: String(cell.attr('label/text') ?? data.title ?? ''),
      ownerRole: String(cell.attr('owner/text') ?? ''),
    }
  }
  if (data.cellRole === 'FLOW_NODE') {
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      description: data.description ?? '',
      actor: data.actor ?? '',
      businessRule: data.businessRule ?? '',
    }
  }
  return null
}

export default BusinessFlowEditor
