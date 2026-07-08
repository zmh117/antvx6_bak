import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Edge, Graph, Node, type Cell } from '@antv/x6'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GripVertical, Layers3, Plus, Trash2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { getAccessToken, getCurrentUser } from '@/entities/auth'
import { useGraphsQuery } from '@/entities/er-graph/api'
import type {
  LocalBusinessFlowCanvas,
  SwimlaneComponentListItem,
  TaskUiContext,
  TaskUiOperationStep,
} from '@/entities/business-flow'
import {
  BUSINESS_SEMANTIC_PROFILES,
  TASK_UI_ACTIONS_BY_ELEMENT,
  TASK_UI_ACTION_TYPES,
  TASK_UI_ELEMENT_TYPES,
  normalizeTaskUiContext,
  semanticPayload,
  taskUiQualityIssues,
  textArrayValue,
  updateSemanticPayload,
  mergeBpmnIntoProperties,
} from '@/entities/business-flow'
import {
  addMissingBusinessFlowCells,
  bindBusinessFlowDeleteKeys,
  createBusinessFlowGraph,
  defaultBpmnEdgeProfileForEdge,
  fitLaneToChildren,
  flowDraftFromGraph,
  graphPointFromEvent,
  normalizeBusinessFlowLanes,
  readCellData,
  rememberManualLaneSize,
  removeBusinessFlowCells,
  renderBusinessFlowCanvas,
  stripProcessContainerCapabilityFromCanvas,
  updateEdgeBpmnProfile,
  updateEdgeText,
  updateNodeBpmnProfile,
  updateNodeText,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'
import {
  createBusinessFlowCollaboration,
  type BusinessFlowCollaborationController,
  type BusinessFlowPresenceActivity,
  type BusinessFlowPresenceTarget,
  type BusinessFlowRemoteAwareness,
} from '@/features/business-flow/infrastructure/yjs'
import { NodeErBindingEditor } from '@/features/business-flow/presentation/components/NodeErBindingEditor'
import {
  BpmnEdgeProfileFields,
  BpmnNodeProfileFields,
} from '@/features/business-flow/presentation/components/BpmnFields'
import {
  buildBusinessFlowOps,
  isLayoutOnlyBusinessFlowOps,
} from '@/features/business-flow-editor/lib/buildBusinessFlowOps'
import {
  readSelectedBusinessCell,
  type ErGraphOption,
  type SelectedBusinessCell,
} from '@/features/business-flow-editor/lib/readSelectedBusinessCell'

const PRESENCE_STALE_MS = 30_000
const PRESENCE_LABELS: Record<BusinessFlowPresenceActivity, string> = {
  selecting: '正在查看',
  editing: '正在编辑',
  dragging: '正在移动',
  connecting: '已连接',
}

type PresenceHighlight = {
  key: string
  label: string
  color: string
  rect: { x: number; y: number; width: number; height: number }
}

function activeAwarenessUsers(states: BusinessFlowRemoteAwareness[]) {
  const users = new Map<
    string,
    { id?: string; name?: string; email?: string; color?: string }
  >()
  states.forEach((state) => {
    const userKey =
      state.user.id || state.user.email || state.user.name || String(state.clientId)
    users.set(userKey, state.user)
  })
  return Array.from(users.values())
}

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
  const collabRef = useRef<BusinessFlowCollaborationController | null>(null)
  const applyingRemoteRef = useRef(false)
  const persistTimer = useRef<number | null>(null)
  const persistInFlightRef = useRef(false)
  const persistQueuedRef = useRef(false)
  const persistCanvasRef = useRef<() => Promise<void>>(async () => {})
  const schedulePersistRef = useRef<() => void>(() => {})
  const loadedFlowIdRef = useRef<string | null>(null)
  const renderingRef = useRef(false)
  const normalizingRef = useRef(false)
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
  const [collabStatus, setCollabStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected')
  const [onlineUsers, setOnlineUsers] = useState<
    Array<{ id?: string; name?: string; email?: string; color?: string }>
  >([])
  const [remoteAwareness, setRemoteAwareness] = useState<
    BusinessFlowRemoteAwareness[]
  >([])
  const [presenceHighlights, setPresenceHighlights] = useState<
    PresenceHighlight[]
  >([])
  const [showHistory, setShowHistory] = useState(false)
  const businessFlowProductId = meta?.product_id ?? null
  const erGraphsQuery = useGraphsQuery(businessFlowProductId ?? 'all')
  const erGraphOptions: ErGraphOption[] = (erGraphsQuery.data ?? []).map(
    (graph) => ({ id: graph.id, name: graph.name }),
  )

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const cacheCanvasState = useCallback(
    (nextCanvas: LocalBusinessFlowCanvas, updatePanel = true) => {
      const cleanCanvas = stripProcessContainerCapabilityFromCanvas(nextCanvas)
      canvasRef.current = cleanCanvas
      if (updatePanel) setCanvas(cleanCanvas)
      queryClient.setQueryData(
        businessFlowKeys.editorState(businessFlowId),
        cleanCanvas,
      )
    },
    [businessFlowId, queryClient],
  )

  const removeSelectedCell = useCallback(() => {
    const graph = graphRef.current
    const cell = selectedRef.current?.cell
    if (!graph || !cell) return
    const removedCells = removeBusinessFlowCells(graph, [cell])
    if (!removedCells.length) return
    setSelected(null)
    collabRef.current?.setLocalPresence(null)
    schedulePersistRef.current()
  }, [])

  const loadCanvasIntoGraph = useCallback(
    (nextCanvas: LocalBusinessFlowCanvas) => {
      cacheCanvasState(nextCanvas)
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
    [businessFlowId, cacheCanvasState],
  )

  // 放置新泳道后只增量挂载新 cell，避免对已挂载画布做 clearCells 全量重建
  // （否则 X6 会在复用 id 的视图上留下拖动残影）。
  const appendCanvasIntoGraph = useCallback(
    (nextCanvas: LocalBusinessFlowCanvas) => {
      cacheCanvasState(nextCanvas)
      const graph = graphRef.current
      if (!graph) {
        loadCanvasIntoGraph(nextCanvas)
        return
      }
      renderingRef.current = true
      try {
        addMissingBusinessFlowCells(graph, nextCanvas)
        loadedFlowIdRef.current = businessFlowId
      } finally {
        renderingRef.current = false
      }
    },
    [businessFlowId, cacheCanvasState, loadCanvasIntoGraph],
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
    if (!graph || !previous || renderingRef.current || applyingRemoteRef.current)
      return
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
      cacheCanvasState(nextCanvas, !layoutOnly)
      setSaveState('saved')
      setSavedAt(new Date().toLocaleTimeString())
    } catch {
      setSaveState('error')
    }
  }, [applyChangesMutation, cacheCanvasState])

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

  const publishPresence = useCallback(
    (
      target: BusinessFlowPresenceTarget | null,
      activity?: BusinessFlowPresenceActivity,
    ) => {
      collabRef.current?.setLocalPresence(target, activity)
    },
    [],
  )

  const targetFromCell = useCallback((cell: Cell | null | undefined) => {
    if (!cell) return null
    const data = readCellData(cell)
    if (data.cellRole === 'LANE_INSTANCE') {
      return { kind: 'lane', key: data.laneInstanceKey ?? cell.id } satisfies BusinessFlowPresenceTarget
    }
    if (data.cellRole === 'FLOW_NODE') {
      return { kind: 'node', key: data.nodeKey ?? cell.id } satisfies BusinessFlowPresenceTarget
    }
    if (data.cellRole === 'FLOW_EDGE') {
      return { kind: 'edge', key: data.edgeKey ?? cell.id } satisfies BusinessFlowPresenceTarget
    }
    return null
  }, [])

  const publishCellPresence = useCallback(
    (cell: Cell | null | undefined, activity: BusinessFlowPresenceActivity) => {
      publishPresence(targetFromCell(cell), activity)
    },
    [publishPresence, targetFromCell],
  )

  const commitRealtimeCanvas = useCallback(
    (nextCanvas: LocalBusinessFlowCanvas | null) => {
      if (!nextCanvas) return
      cacheCanvasState(nextCanvas)
      setSaveState('saved')
      setSavedAt(new Date().toLocaleTimeString())
    },
    [cacheCanvasState],
  )

  const persistRealtimeCell = useCallback(
    (cell?: Cell | null) => {
      const collab = collabRef.current
      if (!collab?.isRealtimeEnabled()) return false
      let nextCanvas: LocalBusinessFlowCanvas | null = null
      if (cell instanceof Node && readCellData(cell).cellRole === 'LANE_INSTANCE') {
        nextCanvas = collab.patchLane(cell)
      } else if (cell instanceof Node && readCellData(cell).cellRole === 'FLOW_NODE') {
        nextCanvas = collab.patchNode(cell)
      } else if (cell instanceof Edge && readCellData(cell).cellRole === 'FLOW_EDGE') {
        nextCanvas = collab.patchEdge(cell)
      } else {
        nextCanvas = collab.pushGraph()
      }
      commitRealtimeCanvas(nextCanvas)
      return true
    },
    [commitRealtimeCanvas],
  )

  const persistRealtimeRemovedCells = useCallback(
    (cells: Cell[]) => {
      const collab = collabRef.current
      if (!collab?.isRealtimeEnabled()) return false
      commitRealtimeCanvas(collab.removeCells(cells))
      return true
    },
    [commitRealtimeCanvas],
  )

  const schedulePersist = useCallback(() => {
    if (persistRealtimeCell(selectedRef.current?.cell)) return
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null
      void persistCanvas()
    }, 550)
  }, [persistCanvas, persistRealtimeCell])

  useEffect(() => {
    schedulePersistRef.current = schedulePersist
  }, [schedulePersist])

  const persistSelectedEdit = useCallback(() => {
    publishCellPresence(selectedRef.current?.cell, 'editing')
    schedulePersist()
  }, [publishCellPresence, schedulePersist])

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

    graph.on('cell:click', ({ cell }) => {
      setSelected(readSelectedBusinessCell(cell))
      publishCellPresence(cell, 'selecting')
    })
    graph.on('blank:click', () => {
      setSelected(null)
      publishPresence(null)
    })
    graph.on('node:change:position', ({ node, options }) => {
      if (renderingRef.current || normalizingRef.current) return
      if (readCellData(node).cellRole !== 'FLOW_NODE') return
      // 泳道拖动会带动子节点平移；translateBy 为发起者 id，被动平移无需 refit
      if (options?.translateBy && options.translateBy !== node.id) return
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
      if (readCellData(node).cellRole === 'FLOW_NODE') {
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
      publishCellPresence(node, 'dragging')
      if (!persistRealtimeCell(node)) schedulePersistRef.current()
    })
    graph.on('node:resized', ({ node }) => {
      if (renderingRef.current) return
      const role = readCellData(node).cellRole
      if (role === 'LANE_INSTANCE') {
        normalizingRef.current = true
        try {
          graph.batchUpdate(() => {
            rememberManualLaneSize(node)
            fitLaneToChildren(node, { preserveManualSize: true })
          })
        } finally {
          normalizingRef.current = false
        }
      } else if (role !== 'FLOW_NODE') {
        return
      }
      publishCellPresence(node, 'dragging')
      if (!persistRealtimeCell(node)) schedulePersistRef.current()
    })
    graph.on('edge:connected', ({ edge }) => {
      const data = readCellData(edge)
      const bpmnProfile = defaultBpmnEdgeProfileForEdge(edge)
      edge.setData({
        ...data,
        cellRole: 'FLOW_EDGE',
        businessFlowId,
        edgeKey: data.edgeKey ?? edge.id,
        edgeType: bpmnProfile.bpmnFlowType === 'ASSOCIATION' ? 'ASSOCIATION' : 'SEQUENCE',
        ...bpmnProfile,
        propertiesJson: mergeBpmnIntoProperties(data.propertiesJson, bpmnProfile),
        title: '',
      })
      setSelected(readSelectedBusinessCell(edge))
      publishCellPresence(edge, 'connecting')
      if (!persistRealtimeCell(edge)) schedulePersistRef.current()
    })
    graph.on('edge:removed', ({ edge }) => {
      publishPresence(null)
      if (!persistRealtimeRemovedCells([edge])) schedulePersistRef.current()
    })
    graph.on('node:removed', ({ node }) => {
      if (renderingRef.current) return
      normalizingRef.current = true
      try {
        graph.batchUpdate(() => {
          normalizeBusinessFlowLanes(graph, { preserveManualSize: true })
        })
      } finally {
        normalizingRef.current = false
      }
      publishPresence(null)
      if (!persistRealtimeRemovedCells([node])) schedulePersistRef.current()
    })
    const unbindDeleteKeys = bindBusinessFlowDeleteKeys(graph, {
      getFallbackCell: () => selectedRef.current?.cell ?? null,
      onDeleted: () => {
        setSelected(null)
        publishPresence(null)
        schedulePersistRef.current()
      },
    })
    return () => {
      if (persistTimer.current != null)
        window.clearTimeout(persistTimer.current)
      collabRef.current?.destroy()
      collabRef.current = null
      unbindDeleteKeys()
      graph.dispose()
      graphRef.current = null
      loadedFlowIdRef.current = null
    }
    // 仅在切换业务图时重建画布；persist 回调通过 schedulePersistRef 稳定引用，
    // 避免 mutation 状态变化导致整张画布被 dispose 重建（拖动松手后闪回起点再跳到终点）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessFlowId])

  useEffect(() => {
    const graph = graphRef.current
    const currentCanvas = canvasRef.current
    if (!graph || !currentCanvas || currentCanvas.businessFlowId !== businessFlowId)
      return
    collabRef.current?.destroy()
    collabRef.current = null
    setRemoteAwareness([])
    setPresenceHighlights([])
    const token = getAccessToken()
    if (!token) {
      setCollabStatus('disconnected')
      setOnlineUsers([])
      return
    }
    collabRef.current = createBusinessFlowCollaboration({
      graph,
      businessFlowId,
      collabRevision: currentCanvas.collabRevision,
      token,
      getCanvas: () => canvasRef.current,
      onStatus: setCollabStatus,
      onRemoteApply: (nextCanvas) => {
        cacheCanvasState(nextCanvas)
        setSaveState('saved')
        setSavedAt(new Date().toLocaleTimeString())
      },
      onAwareness: (states) => {
        setRemoteAwareness(states)
        setOnlineUsers(activeAwarenessUsers(states))
      },
      onError: () => {
        setCollabStatus('error')
      },
      setApplyingRemote: (value) => {
        applyingRemoteRef.current = value
        renderingRef.current = value
      },
      currentUser: getCurrentUser(),
    })
    return () => {
      collabRef.current?.destroy()
      collabRef.current = null
      applyingRemoteRef.current = false
      renderingRef.current = false
    }
  }, [businessFlowId, cacheCanvasState, canvas?.collabRevision])

  const recomputePresenceHighlights = useCallback(() => {
    const graph = graphRef.current
    const container = containerRef.current
    if (!graph || !container) {
      setPresenceHighlights([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const now = Date.now()
    const toRelativeRect = (rect: DOMRect, pad = 6) => ({
      x: rect.left - containerRect.left - pad,
      y: rect.top - containerRect.top - pad,
      width: Math.max(24, rect.width + pad * 2),
      height: Math.max(20, rect.height + pad * 2),
    })
    const cellRect = (cell: Cell, pad = 6) => {
      const view = graph.findViewByCell(cell)
      const containerEl = view?.container as SVGElement | HTMLElement | undefined
      if (!containerEl) return null
      const edgeShape =
        cell instanceof Edge
          ? containerEl.querySelector<SVGElement>('path, polyline, line')
          : null
      const rect = (edgeShape || containerEl).getBoundingClientRect()
      if (!rect.width && !rect.height) return null
      return toRelativeRect(rect, pad)
    }
    const targetRect = (target: BusinessFlowPresenceTarget) => {
      const cell = graph.getCellById(target.key)
      if (!cell) return null
      return cellRect(cell, target.kind === 'edge' ? 10 : 6)
    }
    const next: PresenceHighlight[] = []
    remoteAwareness.forEach((state) => {
      if (!state.target || state.isLocal) return
      if (state.updatedAt && now - state.updatedAt > PRESENCE_STALE_MS) return
      const rect = targetRect(state.target)
      if (!rect) return
      const activity = state.activity || 'editing'
      const name = state.user.name || state.user.email || '其他成员'
      next.push({
        key: `${state.clientId}:${state.target.kind}:${state.target.key}`,
        label: `${name} ${PRESENCE_LABELS[activity]}`,
        color: state.user.color || '#2563eb',
        rect,
      })
    })
    setPresenceHighlights(next)
  }, [remoteAwareness])

  useEffect(() => {
    recomputePresenceHighlights()
  }, [recomputePresenceHighlights, canvas])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recomputePresenceHighlights)
    }
    const events = [
      'node:change:position',
      'node:change:size',
      'edge:change:source',
      'edge:change:target',
      'edge:change:vertices',
      'edge:change:data',
      'scale',
      'translate',
      'resize',
      'render:done',
      'view:mounted',
      'view:unmounted',
    ]
    events.forEach((event) => graph.on(event, schedule))
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      events.forEach((event) => graph.off(event, schedule))
      window.removeEventListener('resize', schedule)
    }
  }, [recomputePresenceHighlights])

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
        appendCanvasIntoGraph(refreshed.data)
        if (collabRef.current?.isRealtimeEnabled()) {
          queueMicrotask(() => {
            commitRealtimeCanvas(collabRef.current?.pushGraph() ?? null)
          })
        }
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
          <Badge
            variant={collabStatus === 'connected' ? 'secondary' : 'outline'}
            className="hidden sm:inline-flex"
          >
            {collabStatus === 'connected'
              ? `协同中 ${Math.max(onlineUsers.length, 1)} 人`
              : collabStatus === 'connecting'
                ? '协同连接中'
                : collabStatus === 'error'
                  ? '协同异常'
                  : '协同断开'}
          </Badge>
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
            <div className="pointer-events-none absolute inset-0 z-30">
              {presenceHighlights.map((item) => (
                <div
                  key={item.key}
                  className="absolute rounded-md border-2 shadow-sm"
                  aria-hidden="true"
                  style={{
                    left: item.rect.x,
                    top: item.rect.y,
                    width: item.rect.width,
                    height: item.rect.height,
                    borderColor: item.color,
                    boxShadow: `0 0 0 1px color-mix(in srgb, ${item.color} 18%, transparent)`,
                  }}
                >
                  <span
                    className="absolute left-0 top-0 max-w-48 -translate-y-full truncate rounded-t-md px-1.5 py-0.5 text-[11px] font-medium leading-4 text-white shadow-sm"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
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
              erGraphs={erGraphOptions}
              onChange={setSelected}
              onDelete={removeSelectedCell}
              onPersist={persistSelectedEdit}
              onClose={() => {
                graphRef.current?.cleanSelection()
                setSelected(null)
                publishPresence(null)
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
  erGraphs,
  onChange,
  onDelete,
  onPersist,
  onClose,
}: {
  selected: Exclude<SelectedBusinessCell, null>
  erGraphs: ErGraphOption[]
  onChange: (selected: SelectedBusinessCell) => void
  onDelete: () => void
  onPersist: () => void
  onClose: () => void
}) {
  const title =
    selected.kind === 'lane'
      ? '泳道字段'
      : selected.kind === 'edge'
        ? '连线字段'
        : '节点字段'
  const action =
    selected.kind === 'lane' ? null : (
      <Button
        type="button"
        variant="destructive"
        size="xs"
        onClick={onDelete}
      >
        <Trash2 className="size-3" />
        删除
      </Button>
    )
  return (
    <BusinessPanelShell title={title} action={action} onClose={onClose}>
      <BusinessInspector
        selected={selected}
        erGraphs={erGraphs}
        onChange={onChange}
        onPersist={onPersist}
      />
    </BusinessPanelShell>
  )
}

function BusinessPanelShell({
  title,
  children,
  action,
  onClose,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
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
        <div className="flex items-center gap-2">
          {action}
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
        </div>
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

function BusinessInspector({
  selected,
  erGraphs,
  onChange,
  onPersist,
}: {
  selected: SelectedBusinessCell
  erGraphs: ErGraphOption[]
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
      <div className="space-y-4">
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
        <div>
          <div className="mb-2 text-xs font-semibold">BPMN 连线</div>
          <BpmnEdgeProfileFields
            profile={selected.bpmnProfile}
            onChange={(profile) => {
              const bpmnProfile = updateEdgeBpmnProfile(selected.cell, profile)
              onChange({ ...selected, bpmnProfile })
              onPersist()
            }}
          />
        </div>
        <SemanticProfileEditor
          targetScope="EDGE"
          profileKey={selected.semanticProfileKey}
          profileVersion={selected.semanticProfileVersion}
          payload={selected.semanticPayloadJson}
          onChange={(next) => {
            selected.cell.setData({ ...readCellData(selected.cell), ...next })
            onChange({ ...selected, ...next })
            onPersist()
          }}
        />
        <SemanticQualityHints selected={selected} />
      </div>
    )
  }
  return (
    <div className="space-y-4">
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
        <Field>
          <FieldLabel>输入摘要</FieldLabel>
          <Textarea
            rows={2}
            value={selected.inputSummary}
            onChange={(event) => {
              const inputSummary = event.target.value
              selected.cell.setData({
                ...readCellData(selected.cell),
                inputSummary,
              })
              onChange({ ...selected, inputSummary })
              onPersist()
            }}
          />
        </Field>
        <Field>
          <FieldLabel>输出摘要</FieldLabel>
          <Textarea
            rows={2}
            value={selected.outputSummary}
            onChange={(event) => {
              const outputSummary = event.target.value
              selected.cell.setData({
                ...readCellData(selected.cell),
                outputSummary,
              })
              onChange({ ...selected, outputSummary })
              onPersist()
            }}
          />
        </Field>
      </FieldGroup>
      <div>
        <div className="mb-2 text-xs font-semibold">BPMN 节点</div>
        <BpmnNodeProfileFields
          profile={selected.bpmnProfile}
          onChange={(profile) => {
            const bpmnProfile = updateNodeBpmnProfile(selected.cell, profile)
            onChange({ ...selected, bpmnProfile })
            onPersist()
          }}
        />
      </div>
      {selected.bpmnProfile.bpmnElementType === 'TASK' ? (
        <TaskUiContextEditor
          value={selected.taskUiJson}
          onChange={(taskUiJson) => {
            selected.cell.setData({ ...readCellData(selected.cell), taskUiJson })
            onChange({ ...selected, taskUiJson })
            onPersist()
          }}
        />
      ) : null}
      <NodeErBindingEditor
        erRefs={selected.erRefs}
        erGraphs={erGraphs}
        onChange={(erRefs) => {
          selected.cell.setData({ ...readCellData(selected.cell), erRefs })
          onChange({ ...selected, erRefs })
          onPersist()
        }}
      />
    </div>
  )
}

function TaskUiContextEditor({
  value,
  onChange,
}: {
  value: TaskUiContext | null
  onChange: (value: TaskUiContext) => void
}) {
  const data = normalizeTaskUiContext(value)
  const update = (next: Partial<TaskUiContext>) => onChange({ ...data, ...next })
  const updateStep = (index: number, patch: Partial<TaskUiOperationStep>) => {
    const steps = data.uiSteps.map((step, itemIndex) => (
      itemIndex === index ? { ...step, ...patch } : step
    ))
    update({ uiSteps: steps.map((step, itemIndex) => ({ ...step, stepNo: itemIndex + 1 })) })
  }
  const issues = taskUiQualityIssues(data)
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">Task Web 用例上下文</div>
      <FieldGroup>
        <Field>
          <FieldLabel>页面名称</FieldLabel>
          <Input
            value={data.page?.pageName ?? ''}
            onChange={(event) => update({ page: { ...data.page, pageName: event.target.value } })}
          />
        </Field>
        <Field>
          <FieldLabel>路由模式</FieldLabel>
          <Input
            value={data.page?.routePattern ?? ''}
            onChange={(event) => update({ page: { ...data.page, routePattern: event.target.value } })}
          />
        </Field>
        <Field>
          <FieldLabel>模块</FieldLabel>
          <Input
            value={data.page?.moduleName ?? ''}
            onChange={(event) => update({ page: { ...data.page, moduleName: event.target.value } })}
          />
        </Field>
        <Field>
          <FieldLabel>预期结果</FieldLabel>
          <Textarea
            rows={2}
            value={(data.expectedResults ?? []).join('\n')}
            onChange={(event) => update({ expectedResults: textArrayValue(event.target.value) })}
          />
        </Field>
        <Field>
          <FieldLabel>断言</FieldLabel>
          <Textarea
            rows={2}
            value={(data.assertions ?? []).join('\n')}
            onChange={(event) => update({ assertions: textArrayValue(event.target.value) })}
          />
        </Field>
      </FieldGroup>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold">UI Steps</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const nextNo = data.uiSteps.length + 1
              update({
                uiSteps: [
                  ...data.uiSteps,
                  {
                    id: createUiStepId(),
                    stepNo: nextNo,
                    elementType: 'Input',
                    elementName: '',
                    actionType: 'input',
                    value: '',
                    businessMeaning: '',
                    expectedResult: '',
                    negativeTestHints: [],
                  },
                ],
              })
            }}
          >
            <Plus className="mr-1 size-3" />
            添加
          </Button>
        </div>
        {data.uiSteps.map((step, index) => {
          const elementType = String(step.elementType || 'Input') as keyof typeof TASK_UI_ACTIONS_BY_ELEMENT
          const actions = TASK_UI_ACTIONS_BY_ELEMENT[elementType] ?? TASK_UI_ACTION_TYPES
          return (
            <div key={step.id} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <Input
                  className="h-8 w-16"
                  type="number"
                  value={step.stepNo}
                  onChange={(event) => updateStep(index, { stepNo: Number(event.target.value) || index + 1 })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => update({ uiSteps: data.uiSteps.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={String(step.elementType || 'Input')}
                  onValueChange={(elementTypeValue) => {
                    const nextActions = TASK_UI_ACTIONS_BY_ELEMENT[elementTypeValue as keyof typeof TASK_UI_ACTIONS_BY_ELEMENT] ?? TASK_UI_ACTION_TYPES
                    updateStep(index, {
                      elementType: elementTypeValue,
                      actionType: nextActions.includes(step.actionType as never)
                        ? step.actionType
                        : nextActions[0],
                    })
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_UI_ELEMENT_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={String(step.actionType || actions[0])}
                  onValueChange={(actionType) => updateStep(index, { actionType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {actions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="控件名称"
                value={step.elementName}
                onChange={(event) => updateStep(index, { elementName: event.target.value })}
              />
              <Input
                placeholder="输入值或选择值"
                value={typeof step.value === 'string' || typeof step.value === 'number' ? String(step.value) : ''}
                onChange={(event) => updateStep(index, { value: event.target.value })}
              />
              <Textarea
                rows={2}
                placeholder="业务含义"
                value={step.businessMeaning ?? ''}
                onChange={(event) => updateStep(index, { businessMeaning: event.target.value })}
              />
              <Textarea
                rows={2}
                placeholder="预期结果"
                value={step.expectedResult ?? ''}
                onChange={(event) => updateStep(index, { expectedResult: event.target.value })}
              />
              <Textarea
                rows={2}
                placeholder="负向用例提示，每行一个"
                value={(step.negativeTestHints ?? []).join('\n')}
                onChange={(event) => updateStep(index, { negativeTestHints: textArrayValue(event.target.value) })}
              />
            </div>
          )
        })}
        {issues.length ? (
          <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
            {issues.map((issue) => <div key={issue}>{issue}</div>)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function createUiStepId() {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `ui_step_${uuid.replaceAll('-', '').slice(0, 12)}`
}

function SemanticProfileEditor({
  targetScope,
  profileKey,
  profileVersion,
  payload,
  onChange,
}: {
  targetScope: 'NODE' | 'EDGE'
  profileKey: string
  profileVersion: number | null
  payload: Record<string, unknown>
  onChange: (next: {
    semanticProfileKey: string
    semanticProfileVersion: number | null
    semanticPayloadJson: Record<string, unknown>
  }) => void
}) {
  const profiles = BUSINESS_SEMANTIC_PROFILES.filter(
    (profile) => profile.targetScope === targetScope,
  )
  const selectedProfile = profiles.find((profile) => profile.profileKey === profileKey)
  const data = semanticPayload(payload)
  const updatePayload = (key: string, value: unknown) => {
    onChange({
      semanticProfileKey: profileKey,
      semanticProfileVersion: profileVersion,
      semanticPayloadJson: updateSemanticPayload(data, key, value),
    })
  }
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">业务语义 Profile</div>
      <FieldGroup>
        <Field>
          <FieldLabel>Profile</FieldLabel>
          <Select
            value={profileKey || 'none'}
            onValueChange={(value) => {
              const profile = profiles.find((item) => item.profileKey === value)
              onChange({
                semanticProfileKey: value === 'none' ? '' : value,
                semanticProfileVersion: profile?.version ?? null,
                semanticPayloadJson: {},
              })
            }}
          >
            <SelectTrigger>
              <SelectValue>
                {selectedProfile?.name ?? '未选择'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">未选择</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.profileKey} value={profile.profileKey}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {targetScope === 'NODE' && profileKey ? (
          <>
            <Field>
              <FieldLabel>操作类型</FieldLabel>
              <Input
                value={String(data.operationType ?? '')}
                onChange={(event) => updatePayload('operationType', event.target.value.trim())}
              />
            </Field>
            <Field>
              <FieldLabel>业务对象</FieldLabel>
              <Input
                value={String(data.businessObject ?? '')}
                onChange={(event) => updatePayload('businessObject', event.target.value.trim())}
              />
            </Field>
            <Field>
              <FieldLabel>前置条件</FieldLabel>
              <Textarea
                rows={2}
                value={textArrayValue(data.preconditions).join('\n')}
                onChange={(event) => updatePayload('preconditions', textArrayValue(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>后置条件</FieldLabel>
              <Textarea
                rows={2}
                value={textArrayValue(data.postconditions).join('\n')}
                onChange={(event) => updatePayload('postconditions', textArrayValue(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>校验规则</FieldLabel>
              <Textarea
                rows={2}
                value={textArrayValue(data.validationRules).join('\n')}
                onChange={(event) => updatePayload('validationRules', textArrayValue(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>异常处理</FieldLabel>
              <Textarea
                rows={2}
                value={textArrayValue(data.exceptionHandlers).join('\n')}
                onChange={(event) => updatePayload('exceptionHandlers', textArrayValue(event.target.value))}
              />
            </Field>
          </>
        ) : null}
        {targetScope === 'EDGE' && profileKey ? (
          <>
            <Field>
              <FieldLabel>条件</FieldLabel>
              <Textarea
                rows={2}
                value={String(data.condition ?? '')}
                onChange={(event) => updatePayload('condition', event.target.value.trim())}
              />
            </Field>
            <Field>
              <FieldLabel>交接</FieldLabel>
              <Input
                value={String(data.handoff ?? '')}
                onChange={(event) => updatePayload('handoff', event.target.value.trim())}
              />
            </Field>
            <Field>
              <FieldLabel>消息</FieldLabel>
              <Input
                value={String(data.message ?? '')}
                onChange={(event) => updatePayload('message', event.target.value.trim())}
              />
            </Field>
            <Field>
              <FieldLabel>异常类型</FieldLabel>
              <Input
                value={String(data.exceptionType ?? '')}
                onChange={(event) => updatePayload('exceptionType', event.target.value.trim())}
              />
            </Field>
          </>
        ) : null}
      </FieldGroup>
    </div>
  )
}

function SemanticQualityHints({ selected }: { selected: Exclude<SelectedBusinessCell, null> }) {
  const hints: string[] = []
  if (selected.kind === 'node') {
    const payload = semanticPayload(selected.semanticPayloadJson)
    if (selected.semanticProfileKey && !payload.operationType) hints.push('任务缺少操作类型')
    if (selected.semanticProfileKey && selected.erRefs.length === 0) hints.push('关键任务缺少 ER 绑定')
    if (
      ['DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'].includes(
        selected.bpmnProfile.bpmnElementType,
      ) &&
      !payload.businessObject &&
      selected.erRefs.length === 0
    ) {
      hints.push('数据节点缺少业务对象或 ER 绑定')
    }
  }
  if (selected.kind === 'edge') {
    const payload = semanticPayload(selected.semanticPayloadJson)
    if (selected.semanticProfileKey && !payload.condition && !selected.bpmnProfile.bpmnConditionExpression) {
      hints.push('语义连线缺少条件')
    }
  }
  if (!hints.length) return null
  return (
    <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      {hints.map((hint) => (
        <div key={hint}>{hint}</div>
      ))}
    </div>
  )
}

export default BusinessFlowEditor
