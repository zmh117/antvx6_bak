import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Graph, Node, type Cell, type Edge } from '@antv/x6'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GripVertical, Layers3, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  useApplyBusinessFlowChangesMutation,
  useBusinessFlowEditorStateQuery,
  useBusinessFlowHistoryQuery,
  useBusinessFlowMetasQuery,
  usePlaceSwimlaneComponentMutation,
  useRestoreBusinessFlowVersionMutation,
  useSwimlaneComponentsQuery,
} from '@/entities/business-flow/api'
import { businessFlowKeys } from '@/entities/business-flow/api/queryKeys'
import type {
  BusinessFlowChangeOpBody,
  BusinessFlowEdgeRecord,
  BusinessFlowNodeRecord,
  LocalBusinessFlowCanvas,
  SwimlaneComponentListItem,
} from '@/entities/business-flow'
import {
  createBusinessFlowGraph,
  fitLaneToChildren,
  flowDraftFromGraph,
  graphPointFromEvent,
  normalizeBusinessFlowLanes,
  readCellData,
  rememberManualLaneSize,
  renderBusinessFlowCanvas,
  updateEdgeText,
  updateNodeText,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'

type SelectedBusinessCell =
  | { kind: 'lane'; cell: Cell; displayName: string; ownerRole: string }
  | {
      kind: 'node'
      cell: Cell
      title: string
      description: string
      actor: string
      businessRule: string
    }
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
  const queryClient = useQueryClient()
  const graphRef = useRef<Graph | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<LocalBusinessFlowCanvas | null>(null)
  const persistTimer = useRef<number | null>(null)
  const persistInFlightRef = useRef(false)
  const persistQueuedRef = useRef(false)
  const persistCanvasRef = useRef<() => Promise<void>>(async () => {})
  const loadedFlowIdRef = useRef<string | null>(null)
  const renderingRef = useRef(false)
  const normalizingRef = useRef(false)
  const laneDraggingRef = useRef<{ laneId: string } | null>(null)
  const laneDragReleaseFrameRef = useRef<number | null>(null)
  const editorQuery = useBusinessFlowEditorStateQuery(businessFlowId, meta)
  const placeComponentMutation =
    usePlaceSwimlaneComponentMutation(businessFlowId)
  const applyChangesMutation =
    useApplyBusinessFlowChangesMutation(businessFlowId)
  const historyQuery = useBusinessFlowHistoryQuery(businessFlowId)
  const restoreMutation = useRestoreBusinessFlowVersionMutation(businessFlowId)
  const [canvas, setCanvas] = useState<LocalBusinessFlowCanvas | null>(null)
  const publishedComponentsQuery = useSwimlaneComponentsQuery(
    meta?.product_id ?? 'none',
    'PUBLISHED',
  )
  const palette: SwimlaneComponentListItem[] = (
    publishedComponentsQuery.data ?? []
  ).flatMap((component) => {
    const version =
      component.versions.find(
        (item) =>
          item.status === 'PUBLISHED' &&
          item.versionNo === component.currentVersionNo,
      ) ??
      component.versions.filter((item) => item.status === 'PUBLISHED').at(-1)
    if (!version) return []
    return [
      {
        componentId: component.id,
        componentVersionId: version.id,
        productId: component.productId,
        name: component.name,
        category: component.category,
        ownerRole: component.ownerRole,
        versionNo: version.versionNo,
        thumbnailUrl: version.thumbnailUrl,
      },
    ]
  })
  const [selected, setSelected] = useState<SelectedBusinessCell>(null)
  const selectedRef = useRef<SelectedBusinessCell>(null)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const businessFlowProductId = meta?.product_id ?? null

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const loadCanvasIntoGraph = useCallback(
    (nextCanvas: LocalBusinessFlowCanvas) => {
      canvasRef.current = nextCanvas
      setCanvas(nextCanvas)
      queryClient.setQueryData(
        businessFlowKeys.editorState(businessFlowId),
        nextCanvas,
      )
      const graph = graphRef.current
      if (!graph) return
      renderingRef.current = true
      try {
        renderBusinessFlowCanvas(graph, nextCanvas)
        loadedFlowIdRef.current = businessFlowId
      } finally {
        renderingRef.current = false
      }
    },
    [businessFlowId, queryClient],
  )

  useEffect(() => {
    if (!editorQuery.data) return
    const currentCanvas = canvasRef.current
    const shouldLoadCanvas =
      loadedFlowIdRef.current !== businessFlowId ||
      !currentCanvas ||
      currentCanvas.businessFlowId !== businessFlowId
    if (!shouldLoadCanvas) return
    loadCanvasIntoGraph(editorQuery.data)
  }, [businessFlowId, editorQuery.data, loadCanvasIntoGraph])

  const runPersistCanvas = useCallback(async () => {
    const graph = graphRef.current
    const previous = canvasRef.current
    if (!graph || !previous || renderingRef.current) return
    const draft = flowDraftFromGraph(graph, previous)
    const ops = buildBusinessFlowOps(previous, draft)
    if (ops.length === 0) return
    const layoutOnly = isLayoutOnlyBusinessFlowOps(ops)
    setSaveState('saving')
    try {
      const result = await applyChangesMutation.mutateAsync({
        baseVersion: previous.version,
        ops,
      })
      const nextCanvas: LocalBusinessFlowCanvas = {
        ...previous,
        ...draft,
        version: result.newVersion,
        updatedAt: new Date().toISOString(),
      }
      canvasRef.current = nextCanvas
      queryClient.setQueryData(
        businessFlowKeys.editorState(businessFlowId),
        nextCanvas,
      )
      if (!layoutOnly) {
        setCanvas(nextCanvas)
      }
      setSaveState('saved')
      setSavedAt(new Date().toLocaleTimeString())
    } catch {
      setSaveState('error')
    }
  }, [applyChangesMutation, businessFlowId, queryClient])

  const persistCanvas = useCallback(async () => {
    if (persistInFlightRef.current) {
      persistQueuedRef.current = true
      return
    }
    persistInFlightRef.current = true
    try {
      await runPersistCanvas()
    } finally {
      persistInFlightRef.current = false
      if (persistQueuedRef.current) {
        persistQueuedRef.current = false
        window.setTimeout(() => {
          void persistCanvasRef.current()
        }, 0)
      }
    }
  }, [runPersistCanvas])

  useEffect(() => {
    persistCanvasRef.current = persistCanvas
  }, [persistCanvas])

  const schedulePersist = useCallback(() => {
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null
      void persistCanvas()
    }, 550)
  }, [persistCanvas])

  useEffect(() => {
    if (!containerRef.current) return
    const graph = createBusinessFlowGraph(containerRef.current)
    graphRef.current = graph
    if (canvasRef.current) {
      renderingRef.current = true
      try {
        renderBusinessFlowCanvas(graph, canvasRef.current)
        loadedFlowIdRef.current = businessFlowId
      } finally {
        renderingRef.current = false
      }
    }

    graph.on('cell:click', ({ cell }) =>
      setSelected(readSelectedBusinessCell(cell)),
    )
    graph.on('blank:click', () => setSelected(null))
    graph.on('node:moving', ({ node }) => {
      if (renderingRef.current) return
      if (readCellData(node).cellRole !== 'LANE_INSTANCE') return
      if (laneDragReleaseFrameRef.current != null) {
        window.cancelAnimationFrame(laneDragReleaseFrameRef.current)
        laneDragReleaseFrameRef.current = null
      }
      laneDraggingRef.current = { laneId: node.id }
    })
    graph.on('node:change:position', ({ node }) => {
      if (renderingRef.current || normalizingRef.current) return
      if (laneDraggingRef.current) return
      if (readCellData(node).cellRole !== 'FLOW_NODE') return
      const parent = node.getParent()
      if (
        !(parent instanceof Node) ||
        readCellData(parent).cellRole !== 'LANE_INSTANCE'
      )
        return
      normalizingRef.current = true
      try {
        graph.batchUpdate(() => {
          fitLaneToChildren(parent, {
            preserveManualSize: true,
            clampChildren: false,
            shrinkToFit: false,
          })
        })
      } finally {
        normalizingRef.current = false
      }
    })
    graph.on('node:moved', ({ node }) => {
      if (renderingRef.current) return
      const role = readCellData(node).cellRole
      if (role === 'LANE_INSTANCE') {
        if (laneDragReleaseFrameRef.current != null) {
          window.cancelAnimationFrame(laneDragReleaseFrameRef.current)
        }
        laneDraggingRef.current = { laneId: node.id }
        laneDragReleaseFrameRef.current = window.requestAnimationFrame(() => {
          laneDragReleaseFrameRef.current = null
          if (laneDraggingRef.current?.laneId === node.id) {
            laneDraggingRef.current = null
          }
        })
        schedulePersist()
        return
      }
      if (laneDraggingRef.current) return
      if (role === 'FLOW_NODE') {
        const parent = node.getParent()
        if (
          parent instanceof Node &&
          readCellData(parent).cellRole === 'LANE_INSTANCE'
        ) {
          normalizingRef.current = true
          try {
            graph.batchUpdate(() => {
              fitLaneToChildren(parent, {
                preserveManualSize: true,
                clampChildren: true,
              })
            })
          } finally {
            normalizingRef.current = false
          }
        }
      }
      schedulePersist()
    })
    graph.on('node:resized', ({ node }) => {
      if (
        renderingRef.current ||
        readCellData(node).cellRole !== 'LANE_INSTANCE'
      )
        return
      normalizingRef.current = true
      try {
        graph.batchUpdate(() => {
          rememberManualLaneSize(node)
          fitLaneToChildren(node, { preserveManualSize: true })
        })
      } finally {
        normalizingRef.current = false
      }
      schedulePersist()
    })
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
    graph.on('node:removed', () => {
      if (renderingRef.current) return
      normalizingRef.current = true
      try {
        graph.batchUpdate(() => {
          normalizeBusinessFlowLanes(graph, { preserveManualSize: true })
        })
      } finally {
        normalizingRef.current = false
      }
      schedulePersist()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const selectedCells = graph.getSelectedCells()
      if (!selectedCells.length && selectedRef.current?.cell)
        selectedCells.push(selectedRef.current.cell)
      if (!selectedCells.length) return
      event.preventDefault()
      selectedCells.forEach((cell) => {
        if (readCellData(cell).cellRole === 'LANE_INSTANCE') return
        cell.remove()
      })
      setSelected(null)
      schedulePersist()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      if (persistTimer.current != null)
        window.clearTimeout(persistTimer.current)
      if (laneDragReleaseFrameRef.current != null) {
        window.cancelAnimationFrame(laneDragReleaseFrameRef.current)
        laneDragReleaseFrameRef.current = null
      }
      laneDraggingRef.current = null
      window.removeEventListener('keydown', handleKeyDown)
      graph.dispose()
      graphRef.current = null
      loadedFlowIdRef.current = null
    }
  }, [businessFlowId, schedulePersist])

  async function dropComponent(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const graph = graphRef.current
    if (!graph) return
    const componentVersionId = event.dataTransfer.getData(
      'application/x-swimlane-component',
    )
    if (!componentVersionId) return
    const point = graphPointFromEvent(graph, event.nativeEvent)
    setSaveState('saving')
    try {
      await placeComponentMutation.mutateAsync({
        componentVersionId,
        position: {
          x: point.x - 160,
          y: point.y - 28,
        },
      })
      const refreshed = await editorQuery.refetch()
      if (refreshed.data) {
        loadCanvasIntoGraph(refreshed.data)
      }
      setSaveState('saved')
      setSavedAt(new Date().toLocaleTimeString())
    } catch {
      setSaveState('error')
    }
  }

  return (
    <section className="business-flow-x6-workbench flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            返回业务图列表
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {canvas?.name ?? meta?.name ?? businessFlowId}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {canvas?.code || meta?.code || businessFlowId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saveState === 'saving'
              ? '保存中...'
              : saveState === 'error'
                ? '保存失败'
                : savedAt
                  ? `已保存 ${savedAt}`
                  : '自动保存'}
          </span>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {canvas?.laneInstances.length ?? 0} 泳道
          </Badge>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {canvas?.edges.filter((edge) => edge.isCrossLane).length ?? 0}{' '}
            跨泳道线
          </Badge>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHistory((value) => !value)}
          >
            历史
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
        <SwimlaneComponentPalette
          items={palette}
          productId={businessFlowProductId}
        />
        <section className="flex min-h-0 min-w-0">
          <div
            className="relative min-h-0 min-w-0 flex-1"
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropComponent}
          >
            <div ref={containerRef} className="h-full w-full" />
            {!editorQuery.isLoading &&
            (canvas?.laneInstances.length ?? 0) === 0 ? (
              <div className="pointer-events-none absolute left-1/2 top-10 w-80 -translate-x-1/2 rounded-md border border-dashed border-border bg-card/85 px-4 py-3 text-center text-xs text-muted-foreground shadow-sm">
                从左侧拖入泳道组件，生成业务图中的泳道实例。
              </div>
            ) : null}
          </div>
          {selected ? (
            <BusinessInspectorDrawer
              selected={selected}
              onChange={setSelected}
              onPersist={schedulePersist}
              onClose={() => {
                graphRef.current?.cleanSelection()
                setSelected(null)
              }}
            />
          ) : null}
          {showHistory ? (
            <BusinessHistoryDrawer
              loading={historyQuery.isLoading || restoreMutation.isPending}
              items={historyQuery.data ?? []}
              onClose={() => setShowHistory(false)}
              onRestore={async (version) => {
                setSaveState('saving')
                try {
                  await restoreMutation.mutateAsync(version)
                  const refreshed = await editorQuery.refetch()
                  if (refreshed.data) {
                    loadCanvasIntoGraph(refreshed.data)
                  }
                  setSaveState('saved')
                  setSavedAt(new Date().toLocaleTimeString())
                } catch {
                  setSaveState('error')
                }
              }}
            />
          ) : null}
        </section>
      </div>
    </section>
  )
}

function BusinessHistoryDrawer({
  items,
  loading,
  onClose,
  onRestore,
}: {
  items: Array<{
    version: number
    summary?: string | null
    createdAt: string
    ops: Array<{ summary?: string | null }>
  }>
  loading: boolean
  onClose: () => void
  onRestore: (version: number) => Promise<void>
}) {
  return (
    <BusinessPanelShell title="历史记录" onClose={onClose}>
      <div className="space-y-2">
        {loading ? (
          <div className="text-xs text-muted-foreground">处理中...</div>
        ) : null}
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            暂无历史记录。
          </div>
        ) : null}
        {items.map((item) => (
          <div
            key={item.version}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">版本 {item.version}</div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={loading}
                onClick={() => void onRestore(item.version)}
              >
                恢复
              </Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {item.summary || '业务图更新'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {item.createdAt}
            </div>
            {item.ops.length ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {item.ops.slice(0, 4).map((op, index) => (
                  <li key={index}>{op.summary || '更新内容'}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </BusinessPanelShell>
  )
}

function BusinessInspectorDrawer({
  selected,
  onChange,
  onPersist,
  onClose,
}: {
  selected: Exclude<SelectedBusinessCell, null>
  onChange: (selected: SelectedBusinessCell) => void
  onPersist: () => void
  onClose: () => void
}) {
  const title =
    selected.kind === 'lane'
      ? '泳道字段'
      : selected.kind === 'edge'
        ? '连线字段'
        : '节点字段'
  return (
    <BusinessPanelShell title={title} onClose={onClose}>
      <BusinessInspector
        selected={selected}
        onChange={onChange}
        onPersist={onPersist}
      />
    </BusinessPanelShell>
  )
}

function BusinessPanelShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <aside
      className="z-30 flex h-full min-h-0 w-[344px] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-sm"
      role="complementary"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <section className="space-y-4 p-4">{children}</section>
      </ScrollArea>
    </aside>
  )
}

function SwimlaneComponentPalette({
  items,
  productId,
}: {
  items: SwimlaneComponentListItem[]
  productId: string | null
}) {
  return (
    <aside className="min-h-0 border-r border-border bg-card">
      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Layers3 className="size-4 text-primary" />
              泳道组件库
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              拖入业务画布后复制为独立实例。
            </p>
          </div>
          <div className="space-y-2">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.componentVersionId}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      'application/x-swimlane-component',
                      item.componentVersionId,
                    )
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="flex w-full items-start gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary/60 hover:bg-accent"
                >
                  <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {item.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate">
                        {item.ownerRole || '未设置角色'}
                      </span>
                      <span>v{item.versionNo}</span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
                {productId
                  ? '当前产品暂无已发布泳道组件。'
                  : '正在识别业务图所属产品...'}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

function buildBusinessFlowOps(
  previous: LocalBusinessFlowCanvas,
  draft: ReturnType<typeof flowDraftFromGraph>,
): BusinessFlowChangeOpBody[] {
  const ops: BusinessFlowChangeOpBody[] = []
  const prevLanes = new Map(
    previous.laneInstances.map((lane) => [lane.instanceKey, lane]),
  )
  const nextLanes = new Map(
    draft.laneInstances.map((lane) => [lane.instanceKey, lane]),
  )
  nextLanes.forEach((lane, key) => {
    const prev = prevLanes.get(key)
    if (!prev) return
    if (
      prev.position.x !== lane.position.x ||
      prev.position.y !== lane.position.y ||
      prev.size.width !== lane.size.width ||
      prev.size.height !== lane.size.height ||
      stableJson(prev.layoutJson ?? null) !==
        stableJson(lane.layoutJson ?? null)
    ) {
      ops.push({
        opType: 'MOVE_LANE_INSTANCE',
        targetType: 'LANE_INSTANCE',
        targetKey: key,
        patch: {
          to: {
            x: lane.position.x,
            y: lane.position.y,
            width: lane.size.width,
            height: lane.size.height,
          },
          layoutJson: lane.layoutJson ?? null,
        },
        summary: `移动泳道：${lane.displayName}`,
      })
    }
    if (
      prev.displayName !== lane.displayName ||
      (prev.ownerRole ?? '') !== (lane.ownerRole ?? '')
    ) {
      ops.push({
        opType: 'RENAME_LANE_INSTANCE',
        targetType: 'LANE_INSTANCE',
        targetKey: key,
        patch: {
          displayName: lane.displayName,
          ownerRole: lane.ownerRole ?? null,
        },
        summary: `更新泳道：${lane.displayName}`,
      })
    }
  })

  const prevNodes = new Map(previous.nodes.map((node) => [node.nodeKey, node]))
  const nextNodes = new Map(draft.nodes.map((node) => [node.nodeKey, node]))
  prevNodes.forEach((node, key) => {
    if (!nextNodes.has(key)) {
      ops.push({
        opType: 'REMOVE_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch: { title: node.title },
        summary: `删除节点：${node.title}`,
      })
    }
  })
  nextNodes.forEach((node, key) => {
    const prev = prevNodes.get(key)
    if (!prev) {
      ops.push({
        opType: 'ADD_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch: {
          laneInstanceKey: laneKeyForNode(draft, node),
          nodeType: node.nodeType,
          title: node.title,
          x: node.position.x,
          y: node.position.y,
          width: node.size.width,
          height: node.size.height,
          description: node.description,
          actor: node.actor,
          businessRule: node.businessRule,
        },
        summary: `新增节点：${node.title}`,
      })
      return
    }
    const patch: Record<string, unknown> = {}
    if (
      prev.position.x !== node.position.x ||
      prev.position.y !== node.position.y ||
      prev.size.width !== node.size.width ||
      prev.size.height !== node.size.height
    ) {
      patch.to = {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }
    }
    if (prev.title !== node.title) patch.title = node.title
    if ((prev.description ?? '') !== (node.description ?? ''))
      patch.description = node.description ?? null
    if ((prev.actor ?? '') !== (node.actor ?? ''))
      patch.actor = node.actor ?? null
    if ((prev.businessRule ?? '') !== (node.businessRule ?? ''))
      patch.businessRule = node.businessRule ?? null
    if (Object.keys(patch).length > 0) {
      ops.push({
        opType: 'UPDATE_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch,
        summary: `更新节点：${node.title}`,
      })
    }
  })

  const prevEdges = new Map(previous.edges.map((edge) => [edge.edgeKey, edge]))
  const nextEdges = new Map(draft.edges.map((edge) => [edge.edgeKey, edge]))
  prevEdges.forEach((edge, key) => {
    if (!nextEdges.has(key)) {
      ops.push({
        opType: 'REMOVE_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: { label: edge.label },
        summary: `删除连线：${edge.label || key}`,
      })
    }
  })
  nextEdges.forEach((edge, key) => {
    const prev = prevEdges.get(key)
    if (!prev) {
      ops.push({
        opType: 'ADD_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: edgePatch(edge),
        summary: `新增连线：${edge.label || key}`,
      })
      return
    }
    if (
      prev.label !== edge.label ||
      prev.edgeType !== edge.edgeType ||
      prev.sourceNodeKey !== edge.sourceNodeKey ||
      prev.targetNodeKey !== edge.targetNodeKey ||
      prev.sourcePort !== edge.sourcePort ||
      prev.targetPort !== edge.targetPort
    ) {
      ops.push({
        opType:
          prev.sourceNodeKey !== edge.sourceNodeKey ||
          prev.targetNodeKey !== edge.targetNodeKey
            ? 'ADD_EDGE'
            : 'UPDATE_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: edgePatch(edge),
        summary: `更新连线：${edge.label || key}`,
      })
    }
  })
  return ops
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null)
}

function isLayoutOnlyBusinessFlowOps(ops: BusinessFlowChangeOpBody[]) {
  return ops.every((op) => {
    if (
      op.opType === 'MOVE_LANE_INSTANCE' ||
      op.opType === 'RESIZE_LANE_INSTANCE'
    )
      return true
    if (op.opType !== 'UPDATE_NODE') return false
    const patch = op.patch
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
      return false
    return Object.keys(patch).every((key) => key === 'to')
  })
}

function laneKeyForNode(
  draft: ReturnType<typeof flowDraftFromGraph>,
  node: BusinessFlowNodeRecord,
) {
  return draft.laneInstances.find(
    (lane) => lane.laneInstanceId === node.laneInstanceId,
  )?.instanceKey
}

function edgePatch(edge: BusinessFlowEdgeRecord): Record<string, unknown> {
  return {
    sourceNodeKey: edge.sourceNodeKey,
    targetNodeKey: edge.targetNodeKey,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    edgeType: edge.edgeType,
    label: edge.label,
    conditionText: edge.conditionText,
  }
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
                selected.cell.setData({
                  ...readCellData(selected.cell),
                  title: displayName,
                })
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
              selected.cell.setData({
                ...readCellData(selected.cell),
                description,
              })
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
              selected.cell.setData({
                ...readCellData(selected.cell),
                businessRule,
              })
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
