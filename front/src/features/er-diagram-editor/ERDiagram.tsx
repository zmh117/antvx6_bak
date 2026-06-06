import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Graph,
  Edge,
  FunctionExt,
  type Cell,
  type CellView,
  type Node,
  type NodeMetadata,
  type EdgeMetadata,
  type ValidateConnectionArgs,
} from '@antv/x6'
import { Database, Pencil } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useQueryClient } from '@tanstack/react-query'
import { register } from '@antv/x6-react-shape'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  fieldHasEnum,
  fieldHasMetaForTooltip,
  fieldMetaTooltip,
  normalizeErTables,
  normalizeFieldRefs,
  type FieldSelection,
  type RelationSelection,
  type RelationshipData,
  type TableSelection,
  type TableField,
  type TableNodeData,
} from '@/entities/er-graph/model/erSchema'
import {
  getCurrentFieldSelection,
  registerFieldPanelHandler,
  registerTablePanelHandler,
  selectErField,
  selectErTable,
  subscribeFieldSelection,
} from './erFieldContext'
import type {
  FieldBusinessPatch,
  RelationBusinessPatch,
  TableBusinessPatch,
} from './FieldEnumPanel'
import { applyErTablesToGraphNodes, graphToErTables, normalizeRelationshipType } from './graphToErData'
import {
  fetchGraphLoad,
  fetchGraphMeta,
  getDefaultGraphId,
  graphKeys,
  syncGraphCanvas,
} from '@/entities/er-graph/api'
import { getAccessToken, getCurrentUser } from '@/entities/auth'
import { resolveTablesFromLoad } from './resolveGraphTables'
import { buildRelationEdgeData, resolveRelationEndpoints } from './relationUtils'
import type { RelationBusinessData } from '@/entities/er-graph/model/erSchema'
import {
  buildErRelationshipLabel,
  readErThemeVars,
  type ErColorMode,
} from './erTheme'
import {
  ER_LAYOUT,
  ER_PORT_GROUPS,
  alignErTablePortsFromDom,
  buildFieldPortItems,
  fieldPortId,
  tableBodyHeight,
} from './erLayout'
import { createErGraph } from './lib/createErGraph'
import { bindX6KeyboardHistory } from './lib/bindX6KeyboardHistory'
import { withHistoryPaused } from './lib/withHistoryPaused'
import { repairErEdgesAfterHistory } from './lib/repairErEdgesAfterHistory'
import { historyCmdsNeedEdgeRepair } from './lib/historyCmdUtils'
import { setOperationSource, takeOperationSource } from './lib/graphOperationSource'
import {
  createErCollaboration,
  type ErCollaborationController,
  type ErPresenceActivity,
  type ErPresenceTarget,
  type ErRemoteAwareness,
} from './lib/erCollaboration'

const FieldEnumPanel = React.lazy(() =>
  import('./FieldEnumPanel').then((module) => ({ default: module.FieldEnumPanel })),
)
const TableBusinessPanel = React.lazy(() =>
  import('./FieldEnumPanel').then((module) => ({ default: module.TableBusinessPanel })),
)
const RelationBusinessPanel = React.lazy(() =>
  import('./FieldEnumPanel').then((module) => ({ default: module.RelationBusinessPanel })),
)
const HistoryPanel = React.lazy(() =>
  import('./HistoryPanel').then((module) => ({ default: module.HistoryPanel })),
)
const DatabaseImportPanel = React.lazy(() =>
  import('./DatabaseImportPanel').then((module) => ({ default: module.DatabaseImportPanel })),
)

const PRESENCE_STALE_MS = 30_000
const PRESENCE_LABELS: Record<ErPresenceActivity, string> = {
  selecting: '正在查看',
  editing: '正在编辑',
  dragging: '正在移动',
  connecting: '已连接',
}

function measureErPerf<T>(label: string, fn: () => T, minDurationMs = 0): T {
  if (!import.meta.env.DEV) return fn()
  const start = performance.now()
  try {
    return fn()
  } finally {
    const duration = performance.now() - start
    if (duration >= minDurationMs) {
      console.debug(`[ER perf] ${label}: ${duration.toFixed(1)}ms`)
    }
  }
}

function disposeGraphAfterReactCommit(graph: Graph) {
  window.setTimeout(() => {
    if (graph.disposed) return
    try {
      graph.dispose()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[ER] dispose graph failed', err)
      }
    }
  }, 0)
}

type PresenceHighlight = {
  key: string
  label: string
  color: string
  rect: { x: number; y: number; width: number; height: number }
}

type SimpleMinimapNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type SimpleMinimapEdge = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

type SimpleMinimapState = {
  viewBox: string
  nodes: SimpleMinimapNode[]
  edges: SimpleMinimapEdge[]
  viewport: { x: number; y: number; width: number; height: number } | null
}

/** 边上未写入 router 时由 graph.connecting 回退，与 er-relationship 形定义一致 */
const SHARED_EDGE_ROUTE = {
  router: { name: 'metro' as const },
  connector: { name: 'rounded' as const, args: { radius: 8 } },
} as const

/** 拖拽边时：只允许 fieldRight → fieldLeft；禁止同一节点闭环（与 allowLoop 一致） */
function erPortValidateConnection(
  _graph: Graph,
  args: ValidateConnectionArgs,
): boolean {
  const { sourceView, targetView, sourceMagnet, targetMagnet } = args
  if (!sourceView || !targetView) return false
  if (sourceView.cell.id === targetView.cell.id) return false

  const sg = sourceMagnet?.getAttribute('port-group')
  const tg = targetMagnet?.getAttribute('port-group')

  if (sourceMagnet && sg !== 'fieldRight') return false
  if (targetMagnet && tg !== 'fieldLeft') return false
  if (sourceMagnet && targetMagnet && (sg !== 'fieldRight' || tg !== 'fieldLeft')) {
    return false
  }

  return true
}

// 图标映射
const ICONS: Record<NonNullable<TableField['keyType']>, string> = {
  primary: '🔑',
  relation: '🔗',
  unique: '⭐',
}

// React 节点组件（@antv/x6-react-shape 会传入 node、graph）
const ERTableNode = React.memo(
  ({ node, graph }: { node: Node; graph: Graph }) => {
    const { name, fields = [], businessName } = node.getData<TableNodeData>()
    const tableRef = useRef<HTMLDivElement>(null)
    const tableId = String(node.id)

    useLayoutEffect(() => {
      const el = tableRef.current
      if (!el) return
      const sync = () => alignErTablePortsFromDom(node, graph, el, fields)
      sync()
      requestAnimationFrame(sync)
      requestAnimationFrame(() => applyFieldSelectionClass(graph, getCurrentFieldSelection()))
    }, [node, graph, fields, name])

    return (
      <div
        ref={tableRef}
        className="er-table"
        data-table-id={tableId}
        style={{ minHeight: tableBodyHeight(fields.length) }}
      >
        <header className="er-table-header">
          <span className="table-code er-table-title" title={businessName || name}>
            {name}
          </span>
          <button
            type="button"
            className="er-table-edit"
            title="编辑表业务属性"
            aria-label={`编辑表 ${name}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              selectErTable({ tableId })
            }}
          >
            <Pencil className="size-3" />
          </button>
        </header>
        <div className="er-table-fields">
          {fields.length === 0 ? (
            <div className="er-table-empty">No fields</div>
          ) : (
            fields.map((field, i) => {
              const hasEnum = fieldHasEnum(field)
              const metaTooltip = fieldMetaTooltip(field)
              const showMetaIcon = fieldHasMetaForTooltip(field)
              return (
              <div
                key={field.name}
                data-field-name={field.name}
                role="button"
                tabIndex={0}
                className={`er-table-field ${i % 2 === 0 ? 'even' : 'odd'} ${
                  field.keyType || ''
                }${hasEnum ? ' has-enum' : ''}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  selectErField({ tableId, fieldName: field.name })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    selectErField({ tableId, fieldName: field.name })
                  }
                }}
              >
                <span className="er-field-icon">
                  {field.keyType ? ICONS[field.keyType] : ''}
                </span>
                <span className="er-field-name field-name">{field.name}</span>
                <span className="er-field-type sql-code">{field.type}</span>
                {showMetaIcon ? (
                  <span className="er-field-has-comment" title={metaTooltip}>
                    💬
                  </span>
                ) : null}
              </div>
              )
            })
          )}
        </div>
      </div>
    )
  },
)

// 注册节点：每个字段行由「左 / 右」绝对定位端口，可对具体字段连线
register({
  shape: 'er-table',
  width: ER_LAYOUT.nodeWidth,
  height: 300,
  component: ERTableNode,
  effect: ['data'],
  ports: {
    groups: ER_PORT_GROUPS,
    items: [],
  },
})

Graph.registerEdge(
  'er-relationship',
  {
    inherit: 'edge',
    ...SHARED_EDGE_ROUTE,
    attrs: {
      line: {
        stroke: 'var(--er-edge-stroke)',
        strokeWidth: 2,
        targetMarker: { name: 'classic', size: 8 },
      },
    },
    labels: [buildErRelationshipLabel('1:1', 'light')],
  },
  true,
)
//返回node，edge，x6数据
const transformToGraphData = (tables: TableNodeData[]) => {
  const layout = {
    cols: 2,
    nodeWidth: ER_LAYOUT.nodeWidth,
    spacing: 100,
  }
  return tables.reduce(
    (acc, table, index) => {
      const row = Math.floor(index / layout.cols)
      const col = index % layout.cols
      const height = tableBodyHeight(table.fields.length)
      const gridX = col * (layout.nodeWidth + layout.spacing)
      const gridY = row * (height + layout.spacing)
      const lx = table.layout?.x
      const ly = table.layout?.y

      acc.nodes.push({
        id: table.id,
        shape: 'er-table',
        x: typeof lx === 'number' && Number.isFinite(lx) ? lx : gridX,
        y: typeof ly === 'number' && Number.isFinite(ly) ? ly : gridY,
        width: layout.nodeWidth,
        height,
        data: table,
        ports: {
          groups: ER_PORT_GROUPS,
          items: buildFieldPortItems(table.fields),
        },
      })

      table.fields.forEach((field) => {
        if (field.keyType !== 'relation' && (field.keyType as string) !== 'foreign') return
        const refs = normalizeFieldRefs(field.ref)
        if (refs.length === 0) return
        refs.forEach((r) => {
          const relType = normalizeRelationshipType(r.relationship)
          const relData = buildRelationEdgeData(
            table.id,
            field.name,
            r.table,
            r.field,
            relType,
            {
              relationKey: r.relationKey,
              relationType: r.relationType,
              relationName: r.relationName,
              description: r.description,
              verified: r.verified,
              tags: r.tags,
            },
          )
          acc.edges.push({
            id: relData.relationKey!,
            shape: 'er-relationship',
            source: { cell: table.id, port: fieldPortId(field.name, 'R') },
            target: {
              cell: r.table,
              port: fieldPortId(r.field, 'L'),
            },
            data: relData,
            labels: [buildErRelationshipLabel(relType)],
          })
        })
      })

      return acc
    },
    //返回node，edge，x6数据
    { nodes: [] as NodeMetadata[], edges: [] as EdgeMetadata[] },
  )
}

const toggleRelationshipType = (graph: Graph, edge: Edge) => {
  let next: RelationshipData['type'] = '1:1'
  graph.batchUpdate(() => {
    const types: RelationshipData['type'][] = ['1:1', '1:N', 'N:N']
    const data = edge.getData<RelationBusinessData>() || {}
    const current = data.relationship || data.type || '1:1'
    next = types[(types.indexOf(current) + 1) % types.length]
    edge.setData({ ...data, type: next, relationship: next })
    edge.setLabels([buildErRelationshipLabel(next)])
  })
  return next
}

function applyErEdgesTheme(graph: Graph, mode: ErColorMode) {
  const theme = readErThemeVars(mode)
  withHistoryPaused(graph, () => {
    graph.getEdges().forEach((edge) => {
      if (edge.shape !== 'er-relationship') return
      edge.attr('line/stroke', theme.edgeStroke)
      const relType = edge.getData<RelationshipData>()?.type || '1:1'
      edge.setLabels([buildErRelationshipLabel(relType, mode)])
    })
  })
}

function emptyMinimapState(): SimpleMinimapState {
  return { viewBox: '0 0 1 1', nodes: [], edges: [], viewport: null }
}

function buildSimpleMinimapViewport(graph: Graph): SimpleMinimapState['viewport'] {
  const rect = graph.container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const local = graph.clientToLocal(rect.left, rect.top, rect.width, rect.height)
  return {
    x: local.x,
    y: local.y,
    width: Math.max(1, local.width),
    height: Math.max(1, local.height),
  }
}

function buildSimpleMinimapState(graph: Graph): SimpleMinimapState {
  const nodes = graph
    .getNodes()
    .filter((node) => node.shape === 'er-table')
    .map((node) => {
      const box = node.getBBox()
      return {
        id: String(node.id),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    })
  if (!nodes.length) return emptyMinimapState()

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = graph
    .getEdges()
    .filter((edge) => edge.shape === 'er-relationship')
    .map((edge) => {
      const source = edge.getSourceCellId()
      const target = edge.getTargetCellId()
      const sourceNode = source ? byId.get(String(source)) : undefined
      const targetNode = target ? byId.get(String(target)) : undefined
      if (!sourceNode || !targetNode) return null
      return {
        id: String(edge.id),
        x1: sourceNode.x + sourceNode.width / 2,
        y1: sourceNode.y + sourceNode.height / 2,
        x2: targetNode.x + targetNode.width / 2,
        y2: targetNode.y + targetNode.height / 2,
      }
    })
    .filter((edge): edge is SimpleMinimapEdge => edge != null)

  const boxes = nodes
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  const padX = Math.max(80, (maxX - minX) * 0.04)
  const padY = Math.max(80, (maxY - minY) * 0.04)

  return {
    viewBox: `${minX - padX} ${minY - padY} ${Math.max(1, maxX - minX + padX * 2)} ${Math.max(1, maxY - minY + padY * 2)}`,
    nodes,
    edges,
    viewport: buildSimpleMinimapViewport(graph),
  }
}

function reflowMinimap(
  graph: Graph,
  setState: React.Dispatch<React.SetStateAction<SimpleMinimapState>>,
) {
  const next = measureErPerf('minimap:rebuild', () => buildSimpleMinimapState(graph), 4)
  setState(next)
}

function updateMinimapViewport(
  graph: Graph,
  setState: React.Dispatch<React.SetStateAction<SimpleMinimapState>>,
) {
  const viewport = measureErPerf('minimap:viewport', () => buildSimpleMinimapViewport(graph), 8)
  setState((prev) => {
    const old = prev.viewport
    if (
      old &&
      viewport &&
      Math.abs(old.x - viewport.x) < 0.5 &&
      Math.abs(old.y - viewport.y) < 0.5 &&
      Math.abs(old.width - viewport.width) < 0.5 &&
      Math.abs(old.height - viewport.height) < 0.5
    ) {
      return prev
    }
    if (!old && !viewport) return prev
    return { ...prev, viewport }
  })
}

function safeFindViewByCell(graph: Graph, cell: Cell): CellView | null {
  try {
    return graph.findViewByCell(cell) ?? null
  } catch {
    return null
  }
}

let selectedFieldRow: HTMLElement | null = null
let selectedFieldKey: string | null = null

function applyFieldSelectionClass(graph: Graph, selection: FieldSelection | null) {
  const nextKey = selection ? `${selection.tableId}\0${selection.fieldName}` : null
  if (selectedFieldKey === nextKey && selectedFieldRow?.isConnected) return

  selectedFieldRow?.classList.remove('is-selected')
  selectedFieldRow = null
  selectedFieldKey = nextKey
  if (!selection) return

  const node = graph.getCellById(selection.tableId)
  if (!node?.isNode()) return
  const view = safeFindViewByCell(graph, node)
  const row = view?.container.querySelector<HTMLElement>(
    `.er-table-field[data-field-name="${CSS.escape(selection.fieldName)}"]`,
  )
  if (!row) return
  row.classList.add('is-selected')
  selectedFieldRow = row
}

function whenGraphRendered(graph: Graph, callback: () => void) {
  let done = false
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    if (done) return
    done = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    graph.off('render:done', run)
    requestAnimationFrame(callback)
  }
  graph.once('render:done', run)
  fallbackTimer = setTimeout(run, 1200)
}

function alignMountedErTableNode(graph: Graph, node: Node) {
  if (node.shape !== 'er-table') return
  const view = safeFindViewByCell(graph, node)
  const tableEl = view?.container.querySelector('.er-table') as HTMLElement | null
  if (!tableEl) return
  const fields = node.getData<TableNodeData>()?.fields ?? []
  alignErTablePortsFromDom(node, graph, tableEl, fields)
}

function applyGraphTheme(graph: Graph, mode: ErColorMode) {
  const theme = readErThemeVars(mode)
  graph.drawBackground({ color: theme.canvasBg })
  graph.drawGrid({ type: 'dot', args: { color: theme.canvasGrid } })
  applyErEdgesTheme(graph, mode)
}

export default function ERDiagram({ graphId }: { graphId?: string }) {
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const useApi = import.meta.env.VITE_USE_API !== 'false'
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const schedulePersistRef = useRef<(syncNodes?: boolean, immediate?: boolean) => void>(() => {})
  const flushPersistRef = useRef<() => void>(() => {})
  const graphVersionRef = useRef<number | undefined>(undefined)
  const collabRevisionRef = useRef(1)
  const revisionReloadingRef = useRef(false)
  const graphIdRef = useRef(graphId ?? getDefaultGraphId())
  const reloadGraphRef = useRef<(() => Promise<void>) | null>(null)
  const collabRef = useRef<ErCollaborationController | null>(null)
  const [autosaveErr, setAutosaveErr] = useState<string | null>(null)
  const [collabStatus, setCollabStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [onlineUsers, setOnlineUsers] = useState<Array<{ id?: string; name?: string; email?: string; color?: string }>>([])
  const [remoteAwareness, setRemoteAwareness] = useState<ErRemoteAwareness[]>([])
  const [presenceHighlights, setPresenceHighlights] = useState<PresenceHighlight[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [databaseImportOpen, setDatabaseImportOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<FieldSelection | null>(null)
  const [selectedTable, setSelectedTable] = useState<TableSelection | null>(null)
  const [selectedRelation, setSelectedRelation] = useState<RelationSelection | null>(null)
  const [graphDataRevision, setGraphDataRevision] = useState(0)
  const [minimapState, setMinimapState] = useState<SimpleMinimapState>(() =>
    emptyMinimapState(),
  )

  const selectedFieldMeta = useMemo(() => {
    if (!selectedField || !graphRef.current) return null
    const node = graphRef.current.getCellById(selectedField.tableId)
    if (!node?.isNode()) return null
    const table = node.getData<TableNodeData>()
    const field = table.fields?.find((f) => f.name === selectedField.fieldName)
    if (!field) return null
    return { table, field: { ...field, enumValues: field.enumValues?.map((e) => ({ ...e })) } }
    // graphDataRevision: 加载/保存后强制从节点重新读取
  }, [selectedField, graphDataRevision])

  const selectedTableMeta = useMemo(() => {
    if (!selectedTable || !graphRef.current) return null
    const node = graphRef.current.getCellById(selectedTable.tableId)
    if (!node?.isNode()) return null
    return node.getData<TableNodeData>()
  }, [selectedTable, graphDataRevision])

  const selectedRelationMeta = useMemo(() => {
    if (!selectedRelation || !graphRef.current) return null
    const edge = graphRef.current.getCellById(selectedRelation.edgeId)
    if (!edge?.isEdge()) return null
    return { relation: { ...edge.getData<RelationBusinessData>() } }
  }, [selectedRelation, graphDataRevision])

  const publishPresence = useCallback(
    (target: ErPresenceTarget | null, activity?: ErPresenceActivity) => {
      collabRef.current?.setLocalPresence(target, activity)
    },
    [],
  )

  const recomputePresenceHighlights = useCallback(() => {
    const graph = graphRef.current
    const container = containerRef.current
    if (!graph || !container) {
      setPresenceHighlights([])
      return
    }

    const containerRect = container.getBoundingClientRect()
    const now = Date.now()
    const next: PresenceHighlight[] = []

    const toRelativeRect = (rect: DOMRect, pad = 4) => ({
      x: rect.left - containerRect.left - pad,
      y: rect.top - containerRect.top - pad,
      width: Math.max(24, rect.width + pad * 2),
      height: Math.max(20, rect.height + pad * 2),
    })

    const rectForTarget = (target: ErPresenceTarget): PresenceHighlight['rect'] | null => {
      if (target.kind === 'table' || target.kind === 'field') {
        const node = graph.getCellById(target.tableId)
        if (!node?.isNode()) return null
        const view = safeFindViewByCell(graph, node)
        const tableEl = view?.container.querySelector('.er-table') as HTMLElement | null
        if (!tableEl) return null
        if (target.kind === 'field') {
          const row = tableEl.querySelector<HTMLElement>(
            `[data-field-name="${CSS.escape(target.fieldName)}"]`,
          )
          if (!row) return null
          return toRelativeRect(row.getBoundingClientRect(), 3)
        }
        return toRelativeRect(tableEl.getBoundingClientRect(), 5)
      }

      const edge = graph.getCellById(target.edgeId)
      if (!edge?.isEdge()) return null
      const view = safeFindViewByCell(graph, edge)
      const line = view?.container.querySelector<SVGElement>('[selector="line"], path, polyline')
      const rect = (line || (view?.container as SVGElement | undefined))?.getBoundingClientRect()
      if (!rect) return null
      return toRelativeRect(rect, 8)
    }

    for (const state of remoteAwareness) {
      if (!state.target) continue
      if (state.isLocal) continue
      if (state.updatedAt && now - state.updatedAt > PRESENCE_STALE_MS) continue
      const rect = rectForTarget(state.target)
      if (!rect) continue
      const name = state.user.name || state.user.email || '其他成员'
      const activity = state.activity || 'editing'
      next.push({
        key: `${state.clientId}:${state.target.kind}:${
          'edgeId' in state.target
            ? state.target.edgeId
            : `${state.target.tableId}:${'fieldName' in state.target ? state.target.fieldName : ''}`
        }`,
        label: `${name} ${PRESENCE_LABELS[activity]}`,
        color: state.user.color || '#2563eb',
        rect,
      })
    }

    setPresenceHighlights(next)
  }, [remoteAwareness])

  const patchSelectedField = useCallback(
    (patch: FieldBusinessPatch) => {
      if (!selectedField || !graphRef.current) return
      const node = graphRef.current.getCellById(selectedField.tableId)
      if (!node?.isNode()) return
      const data = node.getData<TableNodeData>()
      const idx = data.fields.findIndex((f) => f.name === selectedField.fieldName)
      if (idx < 0) return
      const next = { ...data.fields[idx] }
      if ('comment' in patch) {
        if (patch.comment) next.comment = patch.comment
        else delete next.comment
      }
      if ('businessName' in patch) {
        if (patch.businessName) next.businessName = patch.businessName
        else delete next.businessName
      }
      if ('description' in patch) {
        if (patch.description) next.description = patch.description
        else delete next.description
      }
      if ('columnRole' in patch) {
        if (patch.columnRole) next.columnRole = patch.columnRole
        else delete next.columnRole
      }
      if ('tags' in patch) {
        if (patch.tags?.length) next.tags = patch.tags
        else delete next.tags
      }
      if ('enumValues' in patch) {
        if (patch.enumValues?.length) next.enumValues = patch.enumValues
        else delete next.enumValues
      }
      const fields = data.fields.map((f, i) => (i === idx ? next : f))
      graphRef.current.batchUpdate(() => {
        node.setData({ ...data, fields }, { overwrite: true, deep: true })
      })
      setGraphDataRevision((v) => v + 1)
      if (collabRef.current?.isRealtimeEnabled()) {
        collabRef.current.patchColumn(selectedField.tableId, next, idx)
        setAutosaveErr(null)
        return
      }
      // 字段/枚举变更立即保存（避免 550ms 防抖 + 刷新前未落库）
      schedulePersistRef.current(false, true)
    },
    [selectedField],
  )

  const patchSelectedTable = useCallback(
    (patch: TableBusinessPatch) => {
      if (!selectedTable || !graphRef.current) return
      const node = graphRef.current.getCellById(selectedTable.tableId)
      if (!node?.isNode()) return
      const data = node.getData<TableNodeData>()
      const next = { ...data }
      if ('businessName' in patch) {
        if (patch.businessName) next.businessName = patch.businessName
        else delete next.businessName
      }
      if ('description' in patch) {
        if (patch.description) next.description = patch.description
        else delete next.description
      }
      if ('businessDomain' in patch) {
        if (patch.businessDomain) next.businessDomain = patch.businessDomain
        else delete next.businessDomain
      }
      if ('tableType' in patch) {
        if (patch.tableType) next.tableType = patch.tableType
        else delete next.tableType
      }
      if ('importance' in patch) {
        if (typeof patch.importance === 'number') next.importance = patch.importance
        else delete next.importance
      }
      if ('tags' in patch) {
        if (patch.tags?.length) next.tags = patch.tags
        else delete next.tags
      }
      if ('comment' in patch) {
        if (patch.comment) next.comment = patch.comment
        else delete next.comment
      }
      graphRef.current.batchUpdate(() => {
        node.setData(next, { overwrite: true, deep: true })
      })
      setGraphDataRevision((v) => v + 1)
      if (collabRef.current?.isRealtimeEnabled()) {
        collabRef.current.patchTable(node)
        setAutosaveErr(null)
        return
      }
      schedulePersistRef.current(false, true)
    },
    [selectedTable],
  )

  const patchSelectedRelation = useCallback(
    (patch: RelationBusinessPatch) => {
      if (!selectedRelation || !graphRef.current) return
      const edge = graphRef.current.getCellById(selectedRelation.edgeId)
      if (!edge?.isEdge()) return
      const data = edge.getData<RelationBusinessData>() || {}
      const next = { ...data }
      if ('relationName' in patch) {
        if (patch.relationName) next.relationName = patch.relationName
        else delete next.relationName
      }
      if ('description' in patch) {
        if (patch.description) next.description = patch.description
        else delete next.description
      }
      if ('relationType' in patch) {
        if (patch.relationType) next.relationType = patch.relationType
        else delete next.relationType
      }
      if ('relationship' in patch) {
        const rel = normalizeRelationshipType(patch.relationship)
        next.relationship = rel
        next.type = rel
      }
      if ('verified' in patch) next.verified = Boolean(patch.verified)
      if ('tags' in patch) {
        if (patch.tags?.length) next.tags = patch.tags
        else delete next.tags
      }
      graphRef.current.batchUpdate(() => {
        edge.setData(next)
        if (patch.relationship) {
          edge.setLabels([buildErRelationshipLabel(normalizeRelationshipType(next.relationship || next.type))])
        }
      })
      setGraphDataRevision((v) => v + 1)
      if (collabRef.current?.isRealtimeEnabled()) {
        collabRef.current.patchRelation(edge)
        setAutosaveErr(null)
        return
      }
      schedulePersistRef.current(false, false)
    },
    [selectedRelation],
  )

  useEffect(() => {
    registerFieldPanelHandler((sel) => {
      setSelectedField(sel)
      if (sel) {
        setSelectedTable(null)
        setSelectedRelation(null)
      }
    })
    registerTablePanelHandler((sel) => {
      setSelectedTable(sel)
      if (sel) {
        setSelectedField(null)
        setSelectedRelation(null)
      }
    })
    return () => {
      registerFieldPanelHandler(null)
      registerTablePanelHandler(null)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const graphHost = document.createElement('div')
    graphHost.className = 'h-full w-full'
    el.replaceChildren(graphHost)

    const graph = createErGraph({
      container: graphHost,
      validateConnection: erPortValidateConnection,
    })

    let persistTimer: ReturnType<typeof setTimeout> | undefined
    let historyPersistTimer: ReturnType<typeof setTimeout> | undefined
    let suppressPersist = true
    let metadataPersistPending = false
    let pendingSyncNodes = false
    let persistInFlight = false
    let persistQueued = false
    let applyingEdgeMeta = false
    let immediatePersistQueued = false
    let applyingHistory = false
    let applyingRemote = false

    const unbindKeyboard = bindX6KeyboardHistory(graph, {
      beforeApply: () => {
        applyingHistory = true
      },
    })

    let minimapRaf = 0
    const scheduleMinimapReflow = () => {
      cancelAnimationFrame(minimapRaf)
      minimapRaf = requestAnimationFrame(() => {
        reflowMinimap(graph, setMinimapState)
      })
    }
    let minimapViewportRaf = 0
    const scheduleMinimapViewportUpdate = () => {
      cancelAnimationFrame(minimapViewportRaf)
      minimapViewportRaf = requestAnimationFrame(() => {
        updateMinimapViewport(graph, setMinimapState)
      })
    }
    const schedulePresenceReflow = () => {
      requestAnimationFrame(() => {
        recomputePresenceHighlights()
      })
    }
    const syncFieldSelectionClass = () => {
      requestAnimationFrame(() => {
        applyFieldSelectionClass(graph, getCurrentFieldSelection())
      })
    }
    const onViewMounted = ({ view }: { view: CellView }) => {
      const cell = view.cell
      if (cell.isNode() && cell.shape === 'er-table') {
        requestAnimationFrame(() => alignMountedErTableNode(graph, cell))
        syncFieldSelectionClass()
      }
      scheduleMinimapReflow()
      schedulePresenceReflow()
    }
    const onViewUnmounted = () => {
      schedulePresenceReflow()
    }
    const onRenderDone = () => {
      measureErPerf('render:done', () => {
        syncFieldSelectionClass()
        scheduleMinimapReflow()
        schedulePresenceReflow()
      }, 4)
    }
    const scheduleCollabPush = FunctionExt.debounce(() => {
      if (!collabRef.current?.isRealtimeEnabled()) return
      collabRef.current.pushGraph()
      setGraphDataRevision((v) => v + 1)
      setAutosaveErr(null)
    }, 80)
    const collabLayoutPatchQueue = new Map<string, Node>()
    let collabLayoutPatchRaf = 0
    const scheduleCollabLayoutPatch = (node: Node) => {
      collabLayoutPatchQueue.set(String(node.id), node)
      if (collabLayoutPatchRaf) return
      collabLayoutPatchRaf = requestAnimationFrame(() => {
        collabLayoutPatchRaf = 0
        const queued = [...collabLayoutPatchQueue.values()]
        collabLayoutPatchQueue.clear()
        if (!collabRef.current?.isRealtimeEnabled()) return
        queued.forEach((item) => collabRef.current?.patchNodeLayout(item))
        setAutosaveErr(null)
      })
    }

    graph.on('view:mounted', onViewMounted)
    graph.on('view:unmounted', onViewUnmounted)
    graph.on('render:done', onRenderDone)
    graph.on('node:change:position', scheduleMinimapReflow)
    graph.on('node:change:size', scheduleMinimapReflow)
    graph.on('edge:change:source', scheduleMinimapReflow)
    graph.on('edge:change:target', scheduleMinimapReflow)
    graph.on('edge:change:vertices', scheduleMinimapReflow)
    graph.on('edge:connected', scheduleMinimapReflow)
    graph.on('edge:removed', scheduleMinimapReflow)
    graph.on('scale', scheduleMinimapViewportUpdate)
    graph.on('translate', scheduleMinimapViewportUpdate)
    graph.on('resize', scheduleMinimapViewportUpdate)
    window.addEventListener('resize', scheduleMinimapViewportUpdate)

    graphRef.current = graph
    const unsubscribeFieldDomSelection = subscribeFieldSelection((sel) => {
      applyFieldSelectionClass(graph, sel)
    })

    const POSITION_DEBOUNCE_MS = 550
    const HISTORY_PERSIST_DEBOUNCE_MS = 800

    const cancelPendingPersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = undefined
      immediatePersistQueued = false
      if (historyPersistTimer) clearTimeout(historyPersistTimer)
      historyPersistTimer = undefined
      scheduleCollabPush.cancel()
    }

    const scheduleHistoryPersist = () => {
      cancelPendingPersist()
      historyPersistTimer = setTimeout(() => {
        historyPersistTimer = undefined
        void runPersist()
      }, HISTORY_PERSIST_DEBOUNCE_MS)
    }

    const endApplyingHistorySoon = () => {
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          applyingHistory = false
        })
      })
    }

    const onHistoryApplied = (
      source: 'undo' | 'redo',
      cmds?: unknown,
    ) => {
      cancelPendingPersist()
      applyingHistory = true
      try {
        // redo 已精确恢复 X6 命令；repair 会 setData 边并可能多写入一条 history
        if (source === 'undo' && historyCmdsNeedEdgeRepair(graph, cmds as never)) {
          repairErEdgesAfterHistory(graph)
        }
        setOperationSource(source)
      } finally {
        endApplyingHistorySoon()
      }
      scheduleHistoryPersist()
    }

    const onHistoryUndo = ({ cmds }: { cmds?: unknown }) => {
      onHistoryApplied('undo', cmds)
    }

    const onHistoryRedo = ({ cmds }: { cmds?: unknown }) => {
      onHistoryApplied('redo', cmds)
    }

    graph.on('history:undo', onHistoryUndo)
    graph.on('history:redo', onHistoryRedo)
    const runPersist = async () => {
      if (suppressPersist || persistInFlight) {
        persistQueued = true
        return
      }
      persistInFlight = true
      const shouldSyncNodes = pendingSyncNodes
      pendingSyncNodes = false
      try {
        const tables = measureErPerf('persist:graphToErTables', () => graphToErTables(graph), 8)
        if (collabRef.current?.isRealtimeEnabled()) {
          collabRef.current.pushGraph()
          setAutosaveErr(null)
          setGraphDataRevision((v) => v + 1)
          return
        }
        const useApi = import.meta.env.VITE_USE_API !== 'false'
        if (useApi) {
          const result = await syncGraphCanvas(graph, {
            graphId: graphIdRef.current,
            baseVersion: graphVersionRef.current,
            operationSource: takeOperationSource('auto_save'),
          })
          graphVersionRef.current = result.new_version
          void queryClient.invalidateQueries({
            queryKey: graphKeys.histories(graphIdRef.current),
          })
          void queryClient.invalidateQueries({
            queryKey: graphKeys.agentContexts(graphIdRef.current),
          })
          setGraphDataRevision((v) => v + 1)
          if (result.warnings?.length) {
            console.warn('[ER sync warnings]', result.warnings)
          }
        } else if (import.meta.env.DEV) {
          const body = JSON.stringify(tables, null, 2)
          const res = await fetch('/api/save-er-json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body,
          })
          if (!res.ok) throw new Error((await res.text()) || `${res.status}`)
        } else {
          try {
            localStorage.setItem('er-json-autosave', JSON.stringify(tables))
          } catch {
            /* quota / private mode */
          }
        }
        if (import.meta.env.DEV) {
          console.log('[ER] graph.toJSON()', graph.toJSON())
        }
        if (shouldSyncNodes) {
          withHistoryPaused(graph, () => {
            applyErTablesToGraphNodes(graph, tables)
          })
        }
        setAutosaveErr(null)
      } catch (err) {
        setAutosaveErr(
          `自动保存失败：${err instanceof Error ? err.message : String(err)}`,
        )
      } finally {
        persistInFlight = false
        if (persistQueued) {
          persistQueued = false
          void runPersist()
        }
      }
    }

    const schedulePersist = (syncNodes = false, immediate = false) => {
      if (applyingHistory || applyingRemote) return
      if (suppressPersist) {
        if (!syncNodes) metadataPersistPending = true
        return
      }
      if (collabRef.current?.isRealtimeEnabled()) {
        if (syncNodes) pendingSyncNodes = true
        if (immediate) {
          scheduleCollabPush.cancel()
          collabRef.current.pushGraph()
          setGraphDataRevision((v) => v + 1)
          setAutosaveErr(null)
        } else {
          scheduleCollabPush()
        }
        return
      }
      if (syncNodes) pendingSyncNodes = true
      if (persistTimer) clearTimeout(persistTimer)
      if (immediate) {
        persistTimer = undefined
        // 连线时 setData / updateCellId 会连带触发 edge:change:data，合并为一次保存
        if (!immediatePersistQueued) {
          immediatePersistQueued = true
          queueMicrotask(() => {
            immediatePersistQueued = false
            void runPersist()
          })
        }
        return
      }
      persistTimer = setTimeout(() => {
        persistTimer = undefined
        void runPersist()
      }, POSITION_DEBOUNCE_MS)
    }

    const flushPersist = () => {
      if (suppressPersist) return
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = undefined
      if (collabRef.current?.isRealtimeEnabled()) {
        scheduleCollabPush.cancel()
        collabRef.current.pushGraph()
        setGraphDataRevision((v) => v + 1)
        return
      }
      void runPersist()
    }

    schedulePersistRef.current = schedulePersist
    flushPersistRef.current = flushPersist

    const onBlankClick = () => {
      selectErField(null)
      selectErTable(null)
      setSelectedRelation(null)
      publishPresence(null)
    }
    graph.on('blank:click', onBlankClick)

    const onTableNodeClick = ({
      node,
      e,
    }: {
      node: Node
      e: { target: EventTarget | null; stopPropagation(): void }
    }) => {
      if (node.shape !== 'er-table') return
      const target = e.target as HTMLElement | null
      const row = target?.closest?.('.er-table-field')
      if (!row) return
      const fieldName = row.getAttribute('data-field-name')
      if (!fieldName) return
      e.stopPropagation()
      selectErField({ tableId: String(node.id), fieldName })
      publishPresence({ kind: 'field', tableId: String(node.id), fieldName }, 'editing')
    }
    graph.on('node:click', onTableNodeClick)

    const onTableNodeMouseDown = ({
      node,
      e,
    }: {
      node: Node
      e: { target: EventTarget | null }
    }) => {
      if (node.shape !== 'er-table') return
      const target = e.target as HTMLElement | null
      const row = target?.closest?.('.er-table-field')
      const tableId = String(node.id)
      const fieldName = row?.getAttribute('data-field-name')
      if (fieldName) {
        publishPresence({ kind: 'field', tableId, fieldName }, 'editing')
        return
      }
      publishPresence({ kind: 'table', tableId }, 'dragging')
    }
    graph.on('node:mousedown', onTableNodeMouseDown)

    const onNodePositionChange = ({ node }: { node: Node }) => {
      if (applyingHistory || applyingRemote) return
      if (node.shape === 'er-table') {
        publishPresence({ kind: 'table', tableId: String(node.id) }, 'dragging')
      }
      if (collabRef.current?.isRealtimeEnabled() && node.shape === 'er-table') {
        scheduleCollabLayoutPatch(node)
        return
      }
      schedulePersist(true)
    }
    graph.on('node:change:position', onNodePositionChange)
    const onEdgeStructureChange = ({ edge }: { edge: Edge }) => {
      if (applyingHistory || applyingRemote) return
      if (edge.shape === 'er-relationship') {
        const resolved = resolveRelationEndpoints({
          source: edge.getSource() as { cell?: string; port?: string },
          target: edge.getTarget() as { cell?: string; port?: string },
        })
        if (resolved) {
          const relData = buildRelationEdgeData(
            resolved.sourceTable,
            resolved.sourceColumn,
            resolved.targetTable,
            resolved.targetColumn,
            '1:1',
          )
          applyingEdgeMeta = true
          try {
            graph.batchUpdate(() => {
              edge.setData(relData)
            })
          } finally {
            applyingEdgeMeta = false
          }
        }
      }
      publishPresence({ kind: 'relation', edgeId: String(edge.id) }, 'editing')
      schedulePersist(true, true)
    }

    const onEdgeRemoved = () => {
      if (applyingHistory || applyingRemote) return
      schedulePersist(true, true)
    }
    const onEdgeDataChange = () => {
      if (applyingHistory || applyingRemote || applyingEdgeMeta) return
      schedulePersist(true, true)
    }

    graph.on('edge:connected', onEdgeStructureChange)
    graph.on('edge:removed', onEdgeRemoved)
    graph.on('edge:change:data', onEdgeDataChange)

    const onEdgeClick = ({
      edge,
      e,
    }: {
      edge: Edge
      e: { stopPropagation(): void; detail?: number }
    }) => {
      if (edge.shape === 'er-relationship') {
        e.stopPropagation()
        if (e.detail && e.detail > 1) return
        toggleRelationshipType(graph, edge)
        openRelationPanel(edge)
        setGraphDataRevision((v) => v + 1)
        schedulePersist(true, true)
      }
    }

    const openRelationPanel = (edge: Edge) => {
      setSelectedRelation({ edgeId: String(edge.id) })
      selectErField(null)
      selectErTable(null)
      publishPresence({ kind: 'relation', edgeId: String(edge.id) }, 'editing')
    }

    const onEdgeDblClick = ({
      edge,
      e,
    }: {
      edge: Edge
      e: { stopPropagation(): void }
    }) => {
      if (edge.shape !== 'er-relationship') return
      e.stopPropagation()
      openRelationPanel(edge)
    }

    const onEdgeMouseEnter = ({ edge }: { edge: Edge }) => {
      if (edge.shape !== 'er-relationship') return
      if (!safeFindViewByCell(graph, edge)) return
      withHistoryPaused(graph, () => {
        edge.attr('line/stroke', readErThemeVars().edgeHover)
        edge.addTools([
          {
            name: 'button',
            args: {
              distance: -64,
              markup: [
                {
                  tagName: 'circle',
                  selector: 'button',
                  attrs: {
                    r: 8,
                    fill: '#2563eb',
                    stroke: '#fff',
                    strokeWidth: 2,
                    cursor: 'pointer',
                  },
                },
                {
                  tagName: 'text',
                  selector: 'icon',
                  textContent: '✎',
                  attrs: {
                    fill: '#fff',
                    fontSize: 11,
                    fontWeight: 'bold',
                    textAnchor: 'middle',
                    dominantBaseline: 'central',
                  },
                },
              ],
              onClick: ({ e }: { e: { stopPropagation(): void } }) => {
                e.stopPropagation()
                openRelationPanel(edge)
              },
            },
          },
          {
            name: 'button-remove',
            args: {
              distance: -40,
              markup: [
                {
                  tagName: 'circle',
                  selector: 'button',
                  attrs: {
                    r: 8,
                    fill: '#ff4d4f',
                    stroke: '#fff',
                    strokeWidth: 2,
                    cursor: 'pointer',
                  },
                },
                {
                  tagName: 'text',
                  selector: 'icon',
                  textContent: '×',
                  attrs: {
                    fill: '#fff',
                    fontSize: 12,
                    fontWeight: 'bold',
                    textAnchor: 'middle',
                    dominantBaseline: 'central',
                  },
                },
              ],
            },
          },
        ])
      })
    }

    const onEdgeMouseLeave = ({ edge }: { edge: Edge }) => {
      withHistoryPaused(graph, () => {
        edge.attr('line/stroke', readErThemeVars().edgeStroke)
        edge.removeTools()
      })
    }

    graph.on('edge:click', onEdgeClick)
    graph.on('edge:dblclick', onEdgeDblClick)
    graph.on('edge:mouseenter', onEdgeMouseEnter)
    graph.on('edge:mouseleave', onEdgeMouseLeave)

    const applyLoadedToGraph = async (opts?: { fallbackErJson?: boolean }) => {
      const useApi = import.meta.env.VITE_USE_API !== 'false'
      let loadedFromSnapshot = false
      try {
        if (useApi) {
          const loaded = await fetchGraphLoad(graphIdRef.current)
          graphVersionRef.current = loaded.graph.version
          collabRevisionRef.current = loaded.graph.collab_revision || 1
          const tables = resolveTablesFromLoad(loaded)
          if (tables.length) {
            const { nodes, edges } = transformToGraphData(tables)
            measureErPerf('fromJSON:loaded-tables', () => withHistoryPaused(graph, () => {
              graph.fromJSON({ cells: [...nodes, ...edges] as object[] })
              applyErTablesToGraphNodes(graph, tables)
            }), 8)
            setGraphDataRevision((v) => v + 1)
          } else if (loaded.snapshot?.nodes?.length || loaded.snapshot?.edges?.length) {
            measureErPerf('fromJSON:loaded-snapshot', () => withHistoryPaused(graph, () => {
              graph.fromJSON({
                cells: [
                  ...(loaded.snapshot.nodes as object[]),
                  ...(loaded.snapshot.edges as object[]),
                ],
              })
            }), 8)
            loadedFromSnapshot = true
          }
        }
        if (
          (opts?.fallbackErJson ?? true) &&
          !loadedFromSnapshot &&
          !graph.getNodes().length
        ) {
          const response = await fetch('/data/er.json')
          const tables = normalizeErTables((await response.json()) as TableNodeData[])
          const { nodes, edges } = transformToGraphData(tables)
          measureErPerf('fromJSON:fallback-er-json', () => withHistoryPaused(graph, () => {
            graph.fromJSON({ cells: [...nodes, ...edges] as object[] })
          }), 8)
        }
      } catch (err) {
        console.warn('API 加载失败，回退 er.json:', err)
        if (!graph.getNodes().length) {
          const response = await fetch('/data/er.json')
          const tables = normalizeErTables((await response.json()) as TableNodeData[])
          const { nodes, edges } = transformToGraphData(tables)
          measureErPerf('fromJSON:fallback-after-error', () => withHistoryPaused(graph, () => {
            graph.fromJSON({ cells: [...nodes, ...edges] as object[] })
          }), 8)
        }
      }
      graph.cleanHistory()
    }

    const finishInitialLayout = () => {
      whenGraphRendered(graph, () => {
        if (cancelled) return
        graph.zoomToFit({
          padding: 20,
          maxScale: 1.2,
          minScale: 0.3,
        })
        reflowMinimap(graph, setMinimapState)
        graph.getNodes().forEach((node) => alignMountedErTableNode(graph, node))
        queueMicrotask(() => {
          suppressPersist = false
          if (metadataPersistPending) {
            metadataPersistPending = false
            void runPersist()
          }
        })
      })
    }

    const startCollaboration = () => {
      collabRef.current?.destroy()
      collabRef.current = null
      const token = getAccessToken()
      if (!token) {
        setCollabStatus('disconnected')
        setOnlineUsers([])
        return
      }
      collabRef.current = createErCollaboration({
        graph,
        graphId: graphIdRef.current,
        collabRevision: collabRevisionRef.current,
        token,
        onStatus: setCollabStatus,
        onRemoteApply: () => {
          setGraphDataRevision((v) => v + 1)
          reflowMinimap(graph, setMinimapState)
        },
        onAwareness: (states) => {
          setRemoteAwareness(states)
          setOnlineUsers(states.map((state) => state.user))
        },
        onError: setAutosaveErr,
        setApplyingRemote: (value) => {
          applyingRemote = value
        },
        currentUser: getCurrentUser(),
      })
    }

    reloadGraphRef.current = async () => {
      if (revisionReloadingRef.current) return
      revisionReloadingRef.current = true
      suppressPersist = true
      try {
        selectErField(null)
        selectErTable(null)
        setSelectedRelation(null)
        collabRef.current?.destroy()
        collabRef.current = null
        setCollabStatus('connecting')
        await applyLoadedToGraph({ fallbackErJson: false })
        if (cancelled) return
        startCollaboration()
        finishInitialLayout()
      } finally {
        revisionReloadingRef.current = false
      }
    }

    let cancelled = false
    ;(async () => {
      await applyLoadedToGraph()
      if (cancelled) return
      startCollaboration()
      finishInitialLayout()
    })().catch((err: unknown) => {
      console.error('加载 ER 数据失败:', err)
    })

    return () => {
      cancelled = true
      cancelPendingPersist()
      unbindKeyboard()
      unsubscribeFieldDomSelection()
      graph.off('history:undo', onHistoryUndo)
      graph.off('history:redo', onHistoryRedo)
      graph.off('view:mounted', onViewMounted)
      graph.off('view:unmounted', onViewUnmounted)
      graph.off('render:done', onRenderDone)
      graph.off('node:change:position', onNodePositionChange)
      graph.off('node:change:position', scheduleMinimapReflow)
      graph.off('node:change:size', scheduleMinimapReflow)
      graph.off('edge:change:source', scheduleMinimapReflow)
      graph.off('edge:change:target', scheduleMinimapReflow)
      graph.off('edge:change:vertices', scheduleMinimapReflow)
      graph.off('edge:connected', scheduleMinimapReflow)
      graph.off('edge:removed', scheduleMinimapReflow)
      graph.off('scale', scheduleMinimapViewportUpdate)
      graph.off('translate', scheduleMinimapViewportUpdate)
      graph.off('resize', scheduleMinimapViewportUpdate)
      window.removeEventListener('resize', scheduleMinimapViewportUpdate)
      cancelAnimationFrame(minimapRaf)
      cancelAnimationFrame(minimapViewportRaf)
      cancelAnimationFrame(collabLayoutPatchRaf)
      collabLayoutPatchQueue.clear()
      graph.off('edge:connected', onEdgeStructureChange)
      graph.off('edge:removed', onEdgeRemoved)
      graph.off('edge:change:data', onEdgeDataChange)
      graph.off('blank:click', onBlankClick)
      graph.off('node:click', onTableNodeClick)
      graph.off('node:mousedown', onTableNodeMouseDown)
      graph.off('edge:click', onEdgeClick)
      graph.off('edge:dblclick', onEdgeDblClick)
      graph.off('edge:mouseenter', onEdgeMouseEnter)
      graph.off('edge:mouseleave', onEdgeMouseLeave)
      scheduleCollabPush.cancel()
      schedulePersistRef.current = () => {
        /* disposed */
      }
      flushPersistRef.current = () => {
        /* disposed */
      }
      reloadGraphRef.current = null
      collabRef.current?.destroy()
      collabRef.current = null
      graphHost.remove()
      disposeGraphAfterReactCommit(graph)
      graphRef.current = null
    }
  }, [])

  useEffect(() => {
    const onPageHide = () => flushPersistRef.current()
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    if (!useApi) return
    let disposed = false
    let checking = false

    const checkCollabRevision = async () => {
      if (checking || revisionReloadingRef.current) return
      checking = true
      try {
        const meta = await fetchGraphMeta(graphIdRef.current)
        if (disposed) return
        if (
          meta.collab_revision &&
          meta.collab_revision !== collabRevisionRef.current &&
          reloadGraphRef.current
        ) {
          await reloadGraphRef.current()
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[ER] collab revision check failed', err)
        }
      } finally {
        checking = false
      }
    }

    const timer = window.setInterval(() => {
      void checkCollabRevision()
    }, 5000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [useApi])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || (resolvedTheme !== 'light' && resolvedTheme !== 'dark')) return
    const mode = resolvedTheme as ErColorMode
    const apply = () => {
      withHistoryPaused(graph, () => {
        applyGraphTheme(graph, mode)
      })
      reflowMinimap(graph, setMinimapState)
    }
    apply()
    requestAnimationFrame(apply)
  }, [resolvedTheme])

  useEffect(() => {
    recomputePresenceHighlights()
  }, [recomputePresenceHighlights, graphDataRevision])

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

  useEffect(() => {
    if (selectedField) {
      publishPresence(
        { kind: 'field', tableId: selectedField.tableId, fieldName: selectedField.fieldName },
        'editing',
      )
      return
    }
    if (selectedTable) {
      publishPresence({ kind: 'table', tableId: selectedTable.tableId }, 'editing')
      return
    }
    if (selectedRelation) {
      publishPresence({ kind: 'relation', edgeId: selectedRelation.edgeId }, 'editing')
      return
    }
    publishPresence(null)
  }, [publishPresence, selectedField, selectedTable, selectedRelation])

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-1">
      {useApi && !historyOpen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
            onClick={() => setDatabaseImportOpen(true)}
          >
            <Database className="size-3.5" />
            读取数据库
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
            onClick={() => setHistoryOpen(true)}
          >
            历史记录
          </button>
        </div>
      ) : null}
      <div className="absolute left-3 top-3 z-40 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
        协同：
        <span
          className={
            collabStatus === 'connected'
              ? 'text-emerald-600'
              : collabStatus === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {collabStatus === 'connected'
            ? '已连接'
            : collabStatus === 'connecting'
              ? '连接中'
              : collabStatus === 'error'
                ? '异常'
            : '未连接'}
        </span>
        {onlineUsers.length ? (
          <span className="ml-2 text-muted-foreground">在线 {onlineUsers.length}</span>
        ) : null}
      </div>
      {autosaveErr ? (
        <Alert
          variant="destructive"
          className="absolute bottom-3 left-3 z-50 max-w-[min(420px,92vw)] py-2"
        >
          <AlertTitle className="text-xs">自动保存失败</AlertTitle>
          <AlertDescription className="text-xs">{autosaveErr}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex h-full min-h-0 min-w-0 flex-1">
        <section className="relative min-h-0 min-w-0 flex-1">
          <div
            ref={containerRef}
            className="h-full w-full outline-none"
            tabIndex={0}
            onMouseDown={() => containerRef.current?.focus()}
          />
          <div
            className="er-minimap-widget"
            aria-label="画布小地图"
          >
            <svg
              className="er-simple-minimap"
              viewBox={minimapState.viewBox}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-hidden="true"
            >
              <g className="er-simple-minimap-edges">
                {minimapState.edges.map((edge) => (
                  <line
                    key={edge.id}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                  />
                ))}
              </g>
              <g className="er-simple-minimap-nodes">
                {minimapState.nodes.map((node) => (
                  <rect
                    key={node.id}
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={10}
                  />
                ))}
              </g>
              {minimapState.viewport ? (
                <rect
                  className="er-simple-minimap-viewport"
                  fill="none"
                  stroke="#111827"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                  x={minimapState.viewport.x}
                  y={minimapState.viewport.y}
                  width={minimapState.viewport.width}
                  height={minimapState.viewport.height}
                />
              ) : null}
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-0 z-30">
            {presenceHighlights.map((item) => (
              <div
                key={item.key}
                className="er-presence-highlight absolute rounded-md border-2 shadow-sm"
                data-presence-highlight={item.key}
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
                  data-presence-label={item.key}
                  style={{ backgroundColor: item.color }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>
        <React.Suspense fallback={null}>
          {selectedField && selectedFieldMeta ? (
            <FieldEnumPanel
              tableId={selectedField.tableId}
              tableName={selectedFieldMeta.table.name}
              field={selectedFieldMeta.field}
              onChange={patchSelectedField}
              onClose={() => selectErField(null)}
            />
          ) : null}
          {selectedTable && selectedTableMeta ? (
            <TableBusinessPanel
              table={selectedTableMeta}
              onChange={patchSelectedTable}
              onClose={() => selectErTable(null)}
            />
          ) : null}
          {selectedRelation && selectedRelationMeta ? (
            <RelationBusinessPanel
              relation={selectedRelationMeta.relation}
              onChange={patchSelectedRelation}
              onClose={() => setSelectedRelation(null)}
            />
          ) : null}
        </React.Suspense>
      </section>
      <React.Suspense fallback={null}>
        {useApi ? (
          <HistoryPanel
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            graphId={graphIdRef.current}
            refreshKey={graphDataRevision}
            onRestored={(newVersion) => {
              setOperationSource('restore')
              graphVersionRef.current = newVersion
              setGraphDataRevision((v) => v + 1)
              void reloadGraphRef.current?.()
            }}
          />
        ) : null}
        {useApi ? (
          <DatabaseImportPanel
            open={databaseImportOpen}
            graphId={graphIdRef.current}
            onClose={() => setDatabaseImportOpen(false)}
            onImported={(newVersion) => {
              graphVersionRef.current = newVersion
              setGraphDataRevision((v) => v + 1)
              void queryClient.invalidateQueries({
                queryKey: graphKeys.histories(graphIdRef.current),
              })
              void queryClient.invalidateQueries({
                queryKey: graphKeys.agentContexts(graphIdRef.current),
              })
              void reloadGraphRef.current?.()
            }}
          />
        ) : null}
      </React.Suspense>
    </section>
  )
}
