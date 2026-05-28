import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Graph,
  Edge,
  FunctionExt,
  type Node,
  type NodeMetadata,
  type EdgeMetadata,
  type ValidateConnectionArgs,
} from '@antv/x6'
import { Pencil } from 'lucide-react'
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
  registerFieldPanelHandler,
  registerTablePanelHandler,
  selectErField,
  selectErTable,
  subscribeFieldSelection,
} from './erFieldContext'
import {
  FieldEnumPanel,
  RelationBusinessPanel,
  TableBusinessPanel,
  type FieldBusinessPatch,
  type RelationBusinessPatch,
  type TableBusinessPatch,
} from './FieldEnumPanel'
import { applyErTablesToGraphNodes, graphToErTables, normalizeRelationshipType } from './graphToErData'
import { fetchGraphLoad, getDefaultGraphId, graphKeys, syncGraphCanvas } from '@/entities/er-graph/api'
import { HistoryPanel } from './HistoryPanel'
import { resolveTablesFromLoad } from './resolveGraphTables'
import { buildRelationEdgeData, resolveRelationEndpoints } from './relationUtils'
import type { RelationBusinessData } from '@/entities/er-graph/model/erSchema'
import {
  buildErRelationshipLabel,
  readErColorMode,
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

/** 小地图外框尺寸（与 .er-minimap-widget 一致） */
const MINIMAP_FRAME = { width: 200, height: 160, padding: 10 } as const

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
    const [selection, setSelection] = useState<FieldSelection | null>(null)

    useEffect(() => subscribeFieldSelection(setSelection), [])

    useLayoutEffect(() => {
      const el = tableRef.current
      if (!el) return
      const sync = () => alignErTablePortsFromDom(node, graph, el, fields)
      sync()
      requestAnimationFrame(sync)
    }, [node, graph, fields, name])

    return (
      <div
        ref={tableRef}
        className="er-table"
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
              const isSelected =
                selection?.tableId === tableId && selection?.fieldName === field.name
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
                }${hasEnum ? ' has-enum' : ''}${isSelected ? ' is-selected' : ''}`}
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
  graph.batchUpdate(() => {
    const types: RelationshipData['type'][] = ['1:1', '1:N', 'N:N']
    const data = edge.getData<RelationBusinessData>() || {}
    const current = data.relationship || data.type || '1:1'
    const next = types[(types.indexOf(current) + 1) % types.length]
    edge.setData({ ...data, type: next, relationship: next })
    edge.setLabels([buildErRelationshipLabel(next)])
  })
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

function getMinimapPlugin(graph: Graph) {
  return graph.getPlugin('minimap') as
    | {
        targetGraph?: Graph
        onModelUpdated(): void
        updateViewport(): void
      }
    | undefined
}

function applyMinimapTheme(graph: Graph, mode: ErColorMode) {
  const theme = readErThemeVars(mode)
  const mini = getMinimapPlugin(graph)?.targetGraph
  if (!mini) return
  mini.drawBackground({ color: theme.minimapBg })
  applyErEdgesTheme(mini, mode)
}

/** 缩略图内容居中并缩放到可视区（padding 与插件默认留白一致） */
function reflowMinimap(graph: Graph) {
  const plugin = getMinimapPlugin(graph)
  const mini = plugin?.targetGraph
  if (!mini) return
  mini.zoomToFit({ padding: MINIMAP_FRAME.padding })
  applyMinimapTheme(graph, readErColorMode())
  plugin.updateViewport()
}

function applyGraphTheme(graph: Graph, mode: ErColorMode) {
  const theme = readErThemeVars(mode)
  graph.drawBackground({ color: theme.canvasBg })
  graph.drawGrid({ type: 'dot', args: { color: theme.canvasGrid } })
  applyErEdgesTheme(graph, mode)
  applyMinimapTheme(graph, mode)
  getMinimapPlugin(graph)?.updateViewport()
}

export default function ERDiagram() {
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapContainerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const schedulePersistRef = useRef<(syncNodes?: boolean, immediate?: boolean) => void>(() => {})
  const flushPersistRef = useRef<() => void>(() => {})
  const graphVersionRef = useRef<number | undefined>(undefined)
  const graphIdRef = useRef(getDefaultGraphId())
  const reloadGraphRef = useRef<(() => Promise<void>) | null>(null)
  const [autosaveErr, setAutosaveErr] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<FieldSelection | null>(null)
  const [selectedTable, setSelectedTable] = useState<TableSelection | null>(null)
  const [selectedRelation, setSelectedRelation] = useState<RelationSelection | null>(null)
  const [graphDataRevision, setGraphDataRevision] = useState(0)

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
      schedulePersistRef.current(true, true)
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
    const minimapEl = minimapContainerRef.current
    if (!el || !minimapEl) return

    const graph = createErGraph({
      container: el,
      minimapContainer: minimapEl,
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

    const unbindKeyboard = bindX6KeyboardHistory(graph, {
      beforeApply: () => {
        applyingHistory = true
      },
    })

    /*
     * 不使用 Scroller 时，MiniMap 只在 graph「model:updated」（增删、合并等集合变更）时对内部画布 zoomToFit。
     * 拖拽节点只会触发「node:change:position」，不会走 model.collection 的 updated，因此小地图不会自动缩放进整张图。
     * 此处与插件内部 onModelUpdated 对齐：几何变化后让缩略图重新 zoomToFit，并刷新视口矩形。
     */
    const scheduleMinimapReflow = FunctionExt.debounce(() => {
      reflowMinimap(graph)
    }, 48)

    graph.on('node:change:position', scheduleMinimapReflow)
    graph.on('node:change:size', scheduleMinimapReflow)
    graph.on('edge:change:vertices', scheduleMinimapReflow)

    graphRef.current = graph

    const POSITION_DEBOUNCE_MS = 550
    const HISTORY_PERSIST_DEBOUNCE_MS = 800

    const cancelPendingPersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = undefined
      immediatePersistQueued = false
      if (historyPersistTimer) clearTimeout(historyPersistTimer)
      historyPersistTimer = undefined
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
        const tables = graphToErTables(graph)
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
      if (applyingHistory) return
      if (suppressPersist) {
        if (!syncNodes) metadataPersistPending = true
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
      void runPersist()
    }

    schedulePersistRef.current = schedulePersist
    flushPersistRef.current = flushPersist

    const onBlankClick = () => {
      selectErField(null)
      selectErTable(null)
      setSelectedRelation(null)
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
    }
    graph.on('node:click', onTableNodeClick)

    graph.on('node:change:position', () => {
      if (applyingHistory) return
      schedulePersist(true)
    })
    const onEdgeStructureChange = ({ edge }: { edge: Edge }) => {
      if (applyingHistory) return
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
      schedulePersist(true, true)
    }

    const onEdgeRemoved = () => {
      if (applyingHistory) return
      schedulePersist(true, true)
    }
    const onEdgeDataChange = () => {
      if (applyingHistory || applyingEdgeMeta) return
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
        schedulePersist(true, true)
      }
    }

    const openRelationPanel = (edge: Edge) => {
      setSelectedRelation({ edgeId: String(edge.id) })
      selectErField(null)
      selectErTable(null)
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
      withHistoryPaused(graph, () => {
        graph.clearCells()
      })
      try {
        if (useApi) {
          const loaded = await fetchGraphLoad(graphIdRef.current)
          graphVersionRef.current = loaded.graph.version
          const tables = resolveTablesFromLoad(loaded)
          if (tables.length) {
            const { nodes, edges } = transformToGraphData(tables)
            withHistoryPaused(graph, () => {
              graph.addNodes(nodes)
              graph.addEdges(edges)
              applyErTablesToGraphNodes(graph, tables)
            })
            setGraphDataRevision((v) => v + 1)
          } else if (loaded.snapshot?.nodes?.length || loaded.snapshot?.edges?.length) {
            withHistoryPaused(graph, () => {
              graph.fromJSON({
                cells: [
                  ...(loaded.snapshot.nodes as object[]),
                  ...(loaded.snapshot.edges as object[]),
                ],
              })
            })
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
          withHistoryPaused(graph, () => {
            graph.addNodes(nodes)
            graph.addEdges(edges)
          })
        }
      } catch (err) {
        console.warn('API 加载失败，回退 er.json:', err)
        if (!graph.getNodes().length) {
          const response = await fetch('/data/er.json')
          const tables = normalizeErTables((await response.json()) as TableNodeData[])
          const { nodes, edges } = transformToGraphData(tables)
          withHistoryPaused(graph, () => {
            graph.addNodes(nodes)
            graph.addEdges(edges)
          })
        }
      }
      graph.cleanHistory()
    }

    const finishInitialLayout = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return
          graph.zoomToFit({
            padding: 20,
            maxScale: 1.2,
            minScale: 0.3,
          })
          reflowMinimap(graph)
          queueMicrotask(() => {
            suppressPersist = false
            if (metadataPersistPending) {
              metadataPersistPending = false
              void runPersist()
            }
          })
        })
      })
    }

    reloadGraphRef.current = async () => {
      suppressPersist = true
      selectErField(null)
      selectErTable(null)
      setSelectedRelation(null)
      await applyLoadedToGraph({ fallbackErJson: false })
      finishInitialLayout()
    }

    let cancelled = false
    ;(async () => {
      await applyLoadedToGraph()
      if (cancelled) return
      finishInitialLayout()
    })().catch((err: unknown) => {
      console.error('加载 ER 数据失败:', err)
    })

    return () => {
      cancelled = true
      cancelPendingPersist()
      unbindKeyboard()
      graph.off('history:undo', onHistoryUndo)
      graph.off('history:redo', onHistoryRedo)
      graph.off('node:change:position', schedulePersist)
      graph.off('node:change:position', scheduleMinimapReflow)
      graph.off('node:change:size', scheduleMinimapReflow)
      graph.off('edge:change:vertices', scheduleMinimapReflow)
      graph.off('edge:connected', onEdgeStructureChange)
      graph.off('edge:removed', onEdgeRemoved)
      graph.off('edge:change:data', onEdgeDataChange)
      graph.off('blank:click', onBlankClick)
      graph.off('node:click', onTableNodeClick)
      graph.off('edge:click', onEdgeClick)
      graph.off('edge:dblclick', onEdgeDblClick)
      graph.off('edge:mouseenter', onEdgeMouseEnter)
      graph.off('edge:mouseleave', onEdgeMouseLeave)
      schedulePersistRef.current = () => {
        /* disposed */
      }
      flushPersistRef.current = () => {
        /* disposed */
      }
      reloadGraphRef.current = null
      graph.dispose()
      graphRef.current = null
    }
  }, [])

  useEffect(() => {
    const onPageHide = () => flushPersistRef.current()
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || (resolvedTheme !== 'light' && resolvedTheme !== 'dark')) return
    const mode = resolvedTheme as ErColorMode
    const apply = () => {
      withHistoryPaused(graph, () => {
        applyGraphTheme(graph, mode)
      })
      reflowMinimap(graph)
    }
    apply()
    requestAnimationFrame(apply)
  }, [resolvedTheme])

  const useApi = import.meta.env.VITE_USE_API !== 'false'

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-1">
      {useApi && !historyOpen ? (
        <button
          type="button"
          className="absolute right-3 top-3 z-40 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
          onClick={() => setHistoryOpen(true)}
        >
          历史记录
        </button>
      ) : null}
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
            ref={minimapContainerRef}
            className="er-minimap-widget"
            aria-label="画布小地图"
          />
        </section>
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
      </section>
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
    </section>
  )
}
