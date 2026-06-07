import { HocuspocusProvider } from '@hocuspocus/provider'
import type { Edge, Graph, EdgeMetadata, Node, NodeMetadata } from '@antv/x6'
import * as Y from 'yjs'
import { COLLAB_WS_URL } from '@/shared/api/config'
import type {
  FieldEnumEntry,
  RelationBusinessData,
  RelationRef,
  TableField,
  TableNodeData,
} from '@/entities/er-graph/model/erSchema'
import { matchOperatorShortLabel, normalizeMatchOperator } from '@/entities/er-graph/model/erSchema'
import { graphToErTables, normalizeRelationshipType } from '../graphToErData'
import { buildRelationKey } from '../relationUtils'
import {
  ER_LAYOUT,
  ER_PORT_GROUPS,
  buildFieldPortItems,
  fieldPortId,
  setErTablePorts,
  tableBodyHeight,
} from '../erLayout'
import { buildErMatchOperatorLabel } from '../erTheme'
import { withHistoryPaused } from './withHistoryPaused'

const LOCAL_ORIGIN = 'x6-local'
const FIELD_SEP = '::'

function measureCollabPerf<T>(label: string, fn: () => T, minDurationMs = 0): T {
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

type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type ErPresenceTarget =
  | { kind: 'table'; tableId: string }
  | { kind: 'field'; tableId: string; fieldName: string }
  | { kind: 'relation'; edgeId: string }

export type ErPresenceActivity = 'selecting' | 'editing' | 'dragging' | 'connecting'

export type ErRemoteAwareness = {
  clientId: number
  isLocal?: boolean
  user: {
    id?: string
    name?: string
    email?: string
    color?: string
  }
  target?: ErPresenceTarget | null
  activity?: ErPresenceActivity
  updatedAt?: number
}

export type ErCollaborationController = {
  pushGraph: (origin?: string) => void
  patchNodeLayout: (node: Node, origin?: string) => void
  patchTable: (node: Node, origin?: string) => void
  patchColumn: (tableId: string, field: TableField, sortOrder: number, origin?: string) => void
  patchRelation: (edge: Edge, origin?: string) => void
  isRealtimeEnabled: () => boolean
  setLocalPresence: (target: ErPresenceTarget | null, activity?: ErPresenceActivity) => void
  destroy: () => void
  doc: Y.Doc
  provider: HocuspocusProvider
}

export type ErCollaborationOptions = {
  graph: Graph
  graphId: string
  collabRevision: number
  token: string
  onStatus: (status: CollabStatus) => void
  onRemoteApply: () => void
  onAwareness: (states: ErRemoteAwareness[]) => void
  onError: (message: string) => void
  setApplyingRemote: (value: boolean) => void
  currentUser?: { id: string; email: string; display_name: string } | null
}

function clearMap(map: Y.Map<unknown>) {
  Array.from(map.keys()).forEach((key) => map.delete(key))
}

function mapObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (value instanceof Y.Map) return Object.fromEntries(value.entries())
  return typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
}

function setMapObject(root: Y.Map<unknown>, key: string, value: Record<string, unknown>) {
  const child = new Y.Map()
  Object.entries(value).forEach(([k, v]) => {
    if (v !== undefined) child.set(k, v)
  })
  root.set(key, child)
}

function deleteKeysByPrefix(map: Y.Map<unknown>, prefix: string) {
  Array.from(map.keys()).forEach((key) => {
    if (key.startsWith(prefix)) map.delete(key)
  })
}

function enumKey(tableKey: string, columnKey: string, value: string) {
  return `${tableKey}${FIELD_SEP}${columnKey}${FIELD_SEP}${value}`
}

function relationFromEdge(edge: import('@antv/x6').Edge): RelationBusinessData | null {
  const data = edge.getData<RelationBusinessData>() || {}
  const sourceTable = data.sourceTable || edge.getSourceCellId()
  const targetTable = data.targetTable || edge.getTargetCellId()
  const sourceColumn = data.sourceColumn
  const targetColumn = data.targetColumn
  if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return null
  const relationship = normalizeRelationshipType(data.relationship || data.type)
  const relationKey =
    data.relationKey || buildRelationKey(sourceTable, sourceColumn, targetTable, targetColumn)
  return {
    ...data,
    relationKey,
    sourceTable,
    sourceColumn,
    targetTable,
    targetColumn,
    relationship,
    type: relationship,
    matchOperator: normalizeMatchOperator(data.matchOperator),
    relationType: data.relationType || 'logical_relation',
    verified: Boolean(data.verified),
    tags: data.tags || [],
  }
}

function writeGraphToDoc(
  graph: Graph,
  doc: Y.Doc,
  origin = LOCAL_ORIGIN,
  collabRevision?: number,
) {
  const tablesMap = doc.getMap('tables')
  const columnsMap = doc.getMap('columns')
  const enumsMap = doc.getMap('enums')
  const relationsMap = doc.getMap('relations')
  const layoutMap = doc.getMap('layout')
  const metaMap = doc.getMap('meta')
  const tables = graphToErTables(graph)

  doc.transact(() => {
    clearMap(tablesMap)
    clearMap(columnsMap)
    clearMap(enumsMap)
    clearMap(relationsMap)
    clearMap(layoutMap)

    metaMap.set('schemaVersion', 1)
    if (collabRevision) metaMap.set('collabRevision', collabRevision)
    metaMap.set('updatedAt', new Date().toISOString())

    for (const table of tables) {
      const node = graph.getCellById(table.id)
      const position = node?.isNode() ? node.position() : table.layout
      const size = node?.isNode() ? node.getSize() : undefined
      setMapObject(tablesMap, table.id, {
        id: table.id,
        name: table.name,
        businessName: table.businessName,
        description: table.description,
        businessDomain: table.businessDomain,
        tableType: table.tableType,
        importance: table.importance,
        tags: table.tags || [],
        comment: table.comment,
      })
      setMapObject(layoutMap, table.id, {
        x: position?.x ?? table.layout?.x ?? 0,
        y: position?.y ?? table.layout?.y ?? 0,
        width: size?.width ?? ER_LAYOUT.nodeWidth,
        height: size?.height ?? tableBodyHeight(table.fields.length),
      })
      table.fields.forEach((field, index) => {
        setMapObject(columnsMap, `${table.id}${FIELD_SEP}${field.name}`, {
          tableKey: table.id,
          name: field.name,
          type: field.type,
          businessName: field.businessName,
          description: field.description,
          comment: field.comment,
          defaultValue: field.defaultValue,
          keyType: field.keyType,
          columnRole: field.columnRole,
          tags: field.tags || [],
          sortOrder: index,
        })
        ;(field.enumValues || []).forEach((entry, enumIndex) => {
          if (!entry.value && !entry.label) return
          setMapObject(enumsMap, enumKey(table.id, field.name, entry.value || entry.label), {
            tableKey: table.id,
            columnKey: field.name,
            value: entry.value,
            label: entry.label || entry.value,
            description: entry.description,
            sortOrder: entry.sortOrder ?? enumIndex,
          })
        })
      })
    }

    for (const edge of graph.getEdges()) {
      if (edge.shape !== 'er-relationship') continue
      const relation = relationFromEdge(edge)
      if (!relation?.relationKey) continue
      setMapObject(relationsMap, relation.relationKey, relation as unknown as Record<string, unknown>)
    }
  }, origin)
}

function tablesFromDoc(doc: Y.Doc): TableNodeData[] {
  const tablesMap = doc.getMap('tables')
  const columnsMap = doc.getMap('columns')
  const enumsMap = doc.getMap('enums')
  const relationsMap = doc.getMap('relations')
  const layoutMap = doc.getMap('layout')
  const fieldsByTable = new Map<string, (TableField & { sortOrder?: number })[]>()

  for (const value of columnsMap.values()) {
    const column = mapObject(value)
    const tableKey = String(column.tableKey || '')
    const name = String(column.name || '')
    if (!tableKey || !name) continue
    const field: TableField & { sortOrder?: number } = {
      name,
      type: String(column.type || ''),
      businessName: column.businessName as string | undefined,
      description: column.description as string | undefined,
      comment: column.comment as string | undefined,
      defaultValue: column.defaultValue as string | undefined,
      keyType: column.keyType as TableField['keyType'],
      columnRole: column.columnRole as TableField['columnRole'],
      tags: Array.isArray(column.tags) ? (column.tags as string[]) : [],
      sortOrder: Number(column.sortOrder || 0),
    }
    if (!fieldsByTable.has(tableKey)) fieldsByTable.set(tableKey, [])
    fieldsByTable.get(tableKey)!.push(field)
  }

  for (const value of enumsMap.values()) {
    const entry = mapObject(value)
    const tableKey = String(entry.tableKey || '')
    const columnKey = String(entry.columnKey || '')
    const field = fieldsByTable.get(tableKey)?.find((f) => f.name === columnKey)
    if (!field) continue
    field.enumValues ||= []
    field.enumValues.push({
      value: String(entry.value || ''),
      label: String(entry.label || entry.value || ''),
      description: entry.description as string | undefined,
      sortOrder: Number(entry.sortOrder || 0),
    } satisfies FieldEnumEntry)
  }

  const refsByField = new Map<string, RelationRef[]>()
  for (const value of relationsMap.values()) {
    const rel = mapObject(value)
    const sourceTable = String(rel.sourceTable || '')
    const sourceColumn = String(rel.sourceColumn || '')
    const targetTable = String(rel.targetTable || '')
    const targetColumn = String(rel.targetColumn || '')
    if (!sourceTable || !sourceColumn || !targetTable || !targetColumn) continue
    const key = `${sourceTable}${FIELD_SEP}${sourceColumn}`
    const refs = refsByField.get(key) || []
    refs.push({
      table: targetTable,
      field: targetColumn,
      matchOperator: normalizeMatchOperator(rel.matchOperator as string | undefined),
      relationship: normalizeRelationshipType((rel.relationship || rel.type) as never),
      relationKey: rel.relationKey as string | undefined,
      relationType: rel.relationType as RelationRef['relationType'],
      relationName: rel.relationName as string | undefined,
      description: rel.description as string | undefined,
      verified: Boolean(rel.verified),
      tags: Array.isArray(rel.tags) ? (rel.tags as string[]) : [],
    })
    refsByField.set(key, refs)
  }

  const out: TableNodeData[] = []
  for (const [tableKey, value] of tablesMap.entries()) {
    const table = mapObject(value)
    const pos = mapObject(layoutMap.get(tableKey))
    const fields = (fieldsByTable.get(tableKey) || [])
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
      .map(({ sortOrder: _sortOrder, ...field }) => {
        const refs = refsByField.get(`${tableKey}${FIELD_SEP}${field.name}`)
        if (refs?.length) {
          field.keyType = 'relation'
          field.ref = refs.length === 1 ? refs[0] : refs
        }
        field.enumValues?.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        return field
      })
    out.push({
      id: String(table.id || tableKey),
      name: String(table.name || tableKey),
      fields,
      businessName: table.businessName as string | undefined,
      description: table.description as string | undefined,
      businessDomain: table.businessDomain as string | undefined,
      tableType: table.tableType as TableNodeData['tableType'],
      importance: typeof table.importance === 'number' ? table.importance : undefined,
      tags: Array.isArray(table.tags) ? (table.tags as string[]) : [],
      comment: table.comment as string | undefined,
      layout: { x: Number(pos.x || 0), y: Number(pos.y || 0) },
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

function graphDataFromTables(tables: TableNodeData[]) {
  const nodes: NodeMetadata[] = []
  const edges: EdgeMetadata[] = []
  for (const [index, table] of tables.entries()) {
    const height = tableBodyHeight(table.fields.length)
    const { layout: _layout, ...nodeData } = table
    nodes.push({
      id: table.id,
      shape: 'er-table',
      x: table.layout?.x ?? (index % 2) * (ER_LAYOUT.nodeWidth + 100),
      y: table.layout?.y ?? Math.floor(index / 2) * (height + 100),
      width: ER_LAYOUT.nodeWidth,
      height,
      data: nodeData,
      ports: {
        groups: ER_PORT_GROUPS,
        items: buildFieldPortItems(table.fields),
      },
    })
    for (const field of table.fields) {
      const refs = Array.isArray(field.ref) ? field.ref : field.ref ? [field.ref] : []
      for (const ref of refs) {
        const relationship = normalizeRelationshipType(ref.relationship)
        const relationKey = ref.relationKey || buildRelationKey(table.id, field.name, ref.table, ref.field)
        edges.push({
          id: relationKey,
          shape: 'er-relationship',
          source: { cell: table.id, port: fieldPortId(field.name, 'R') },
          target: { cell: ref.table, port: fieldPortId(ref.field, 'L') },
          data: {
            relationKey,
            relationType: ref.relationType || 'logical_relation',
            matchOperator: normalizeMatchOperator(ref.matchOperator),
            relationship,
            type: relationship,
            sourceTable: table.id,
            sourceColumn: field.name,
            targetTable: ref.table,
            targetColumn: ref.field,
            relationName: ref.relationName,
            description: ref.description,
            verified: Boolean(ref.verified),
            tags: ref.tags || [],
          },
          labels: [
            buildErMatchOperatorLabel(
              matchOperatorShortLabel(normalizeMatchOperator(ref.matchOperator)),
            ),
          ],
        })
      }
    }
  }
  return { nodes, edges }
}

function jsonStableEqual(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function graphNodeDataForCompare(value: unknown) {
  const raw = mapObject(value)
  delete raw.layout
  return raw
}

function samePoint(a: { x?: number; y?: number } | null | undefined, b: { x?: number; y?: number }) {
  return Math.abs(Number(a?.x ?? 0) - Number(b?.x ?? 0)) < 0.5 &&
    Math.abs(Number(a?.y ?? 0) - Number(b?.y ?? 0)) < 0.5
}

function edgeEndpointKey(endpoint: unknown) {
  const value = endpoint as { cell?: string; port?: string } | null | undefined
  return `${value?.cell || ''}:${value?.port || ''}`
}

function sameSize(a: { width?: number; height?: number } | null | undefined, b: { width?: number; height?: number }) {
  return Math.abs(Number(a?.width ?? 0) - Number(b?.width ?? 0)) < 0.5 &&
    Math.abs(Number(a?.height ?? 0) - Number(b?.height ?? 0)) < 0.5
}

function applyLayoutToGraph(graph: Graph, doc: Y.Doc) {
  const layoutMap = doc.getMap('layout')
  withHistoryPaused(graph, () => {
    graph.batchUpdate(() => {
      for (const [tableId, value] of layoutMap.entries()) {
        const node = graph.getCellById(String(tableId))
        if (!node?.isNode() || node.shape !== 'er-table') continue
        const layout = mapObject(value)
        const nextPosition = {
          x: Number(layout.x ?? node.position().x),
          y: Number(layout.y ?? node.position().y),
        }
        const nextSize = {
          width: Number(layout.width ?? node.getSize().width),
          height: Number(layout.height ?? node.getSize().height),
        }
        if (!samePoint(node.position(), nextPosition)) {
          node.position(nextPosition.x, nextPosition.y)
        }
        if (!sameSize(node.getSize(), nextSize)) {
          node.resize(nextSize.width, nextSize.height)
        }
      }
    })
  })
  graph.cleanHistory()
}

function isLayoutOnlyTransaction(doc: Y.Doc, transaction: Y.Transaction) {
  const changedParents = transaction.changedParentTypes as ReadonlySet<unknown>
  const layoutMap = doc.getMap('layout')
  const structuralMaps = [
    doc.getMap('tables'),
    doc.getMap('columns'),
    doc.getMap('enums'),
    doc.getMap('relations'),
  ]
  return changedParents.has(layoutMap) && structuralMaps.every((map) => !changedParents.has(map))
}

function applyDocToGraph(graph: Graph, doc: Y.Doc) {
  const tables = tablesFromDoc(doc)
  const { nodes, edges } = graphDataFromTables(tables)

  withHistoryPaused(graph, () => {
    graph.batchUpdate(() => {
      const incomingNodeIds = new Set(nodes.map((node) => String(node.id)))
      const incomingEdgeIds = new Set(edges.map((edge) => String(edge.id)))

      for (const edge of graph.getEdges()) {
        if (edge.shape === 'er-relationship' && !incomingEdgeIds.has(String(edge.id))) {
          graph.removeCell(edge)
        }
      }
      for (const node of graph.getNodes()) {
        if (node.shape === 'er-table' && !incomingNodeIds.has(String(node.id))) {
          graph.removeCell(node)
        }
      }

      for (const nodeMeta of nodes) {
        const nodeId = String(nodeMeta.id)
        const existing = graph.getCellById(nodeId)
        const nextPosition = {
          x: Number(nodeMeta.x ?? 0),
          y: Number(nodeMeta.y ?? 0),
        }
        const nextSize = {
          width: Number(nodeMeta.width ?? ER_LAYOUT.nodeWidth),
          height: Number(nodeMeta.height ?? tableBodyHeight(0)),
        }
        const nextData = graphNodeDataForCompare(nodeMeta.data)

        if (!existing?.isNode()) {
          graph.addNode(nodeMeta)
          continue
        }

        if (!samePoint(existing.position(), nextPosition)) {
          existing.position(nextPosition.x, nextPosition.y)
        }

        const size = existing.getSize()
        if (
          Math.abs(size.width - nextSize.width) >= 0.5 ||
          Math.abs(size.height - nextSize.height) >= 0.5
        ) {
          existing.resize(nextSize.width, nextSize.height)
        }

        if (!jsonStableEqual(graphNodeDataForCompare(existing.getData()), nextData)) {
          existing.setData(nextData, { overwrite: true, deep: true })
          setErTablePorts(existing, (nextData.fields as TableField[] | undefined) ?? [])
        }
      }

      for (const edgeMeta of edges) {
        const edgeId = String(edgeMeta.id)
        const existing = graph.getCellById(edgeId)
        const nextData = mapObject(edgeMeta.data)
        const matchOperator = normalizeMatchOperator(nextData.matchOperator as string | undefined)
        const nextLabels = [buildErMatchOperatorLabel(matchOperatorShortLabel(matchOperator))]

        if (!existing?.isEdge()) {
          graph.addEdge(edgeMeta)
          continue
        }

        if (edgeEndpointKey(existing.getSource()) !== edgeEndpointKey(edgeMeta.source)) {
          existing.setSource(edgeMeta.source as never)
        }
        if (edgeEndpointKey(existing.getTarget()) !== edgeEndpointKey(edgeMeta.target)) {
          existing.setTarget(edgeMeta.target as never)
        }
        if (!jsonStableEqual(existing.getData(), nextData)) {
          existing.setData(nextData, { overwrite: true, deep: true })
        }
        if (!jsonStableEqual(existing.getLabels(), nextLabels)) {
          existing.setLabels(nextLabels)
        }
      }
    })
  })
  graph.cleanHistory()
}

export function createErCollaboration(options: ErCollaborationOptions): ErCollaborationController {
  const doc = new Y.Doc()
  let connected = false
  let applying = false
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined
  const provider = new HocuspocusProvider({
    url: COLLAB_WS_URL,
    name: `graph:${options.graphId}:r${options.collabRevision}`,
    document: doc,
    token: options.token,
  })

  const clearDisconnectTimer = () => {
    if (!disconnectTimer) return
    clearTimeout(disconnectTimer)
    disconnectTimer = undefined
  }

  const onRemoteChange = (transaction: Y.Transaction) => {
    if ((transaction.local && transaction.origin === LOCAL_ORIGIN) || applying) return
    applying = true
    options.setApplyingRemote(true)
    try {
      if (isLayoutOnlyTransaction(doc, transaction)) {
        measureCollabPerf('collab-apply:layout', () => applyLayoutToGraph(options.graph, doc), 4)
      } else {
        measureCollabPerf('collab-apply:full', () => applyDocToGraph(options.graph, doc), 8)
      }
      options.onRemoteApply()
    } finally {
      options.setApplyingRemote(false)
      applying = false
    }
  }

  doc.on('afterTransaction', onRemoteChange)

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'connected') {
      clearDisconnectTimer()
      connected = true
      options.onStatus('connected')
      return
    }
    if (disconnectTimer) return
    disconnectTimer = setTimeout(() => {
      disconnectTimer = undefined
      connected = false
      options.onStatus('disconnected')
    }, 1500)
  })
  provider.on('synced', ({ state }: { state: boolean }) => {
    if (!state) return
    clearDisconnectTimer()
    connected = true
    options.onStatus('connected')
    if (doc.getMap('tables').size === 0 && options.graph.getNodes().length) {
      writeGraphToDoc(options.graph, doc, LOCAL_ORIGIN, options.collabRevision)
      return
    }
    options.setApplyingRemote(true)
    try {
      applyDocToGraph(options.graph, doc)
      options.onRemoteApply()
    } finally {
      options.setApplyingRemote(false)
    }
  })
  provider.on('connection-error', (payload: unknown) => {
    clearDisconnectTimer()
    connected = false
    options.onStatus('error')
    options.onError(`协同连接失败：${JSON.stringify(payload)}`)
  })

  const updateAwareness = () => {
    if (!provider.awareness) return
    const states = Array.from(provider.awareness.getStates().entries())
    options.onAwareness(
      states
        .map(([clientId, state]) => {
          const raw = state as Record<string, unknown>
          return {
            clientId,
            isLocal: clientId === doc.clientID,
            user: mapObject(raw.user),
            target: raw.target as ErPresenceTarget | null | undefined,
            activity: raw.activity as ErPresenceActivity | undefined,
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
          }
        })
        .filter((state) => state.user.id || state.user.email || state.user.name) as ErRemoteAwareness[],
    )
  }

  if (provider.awareness) {
    provider.awareness.setLocalStateField('user', {
      id: options.currentUser?.id,
      email: options.currentUser?.email,
      name: options.currentUser?.display_name || options.currentUser?.email,
      color: `hsl(${Math.abs((options.currentUser?.id || 'local').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % 360} 70% 45%)`,
    })
    provider.awareness.setLocalStateField('activity', 'connecting')
    provider.awareness.setLocalStateField('updatedAt', Date.now())
    provider.awareness.on('change', updateAwareness)
    updateAwareness()
  }

  options.onStatus('connecting')

  return {
    doc,
    provider,
    pushGraph(origin = LOCAL_ORIGIN) {
      writeGraphToDoc(options.graph, doc, origin, options.collabRevision)
    },
    patchNodeLayout(node, origin = LOCAL_ORIGIN) {
      writeNodeLayoutToDoc(doc, node, origin)
    },
    patchTable(node, origin = LOCAL_ORIGIN) {
      writeTableToDoc(doc, node, origin)
    },
    patchColumn(tableId, field, sortOrder, origin = LOCAL_ORIGIN) {
      writeColumnToDoc(doc, tableId, field, sortOrder, origin)
    },
    patchRelation(edge, origin = LOCAL_ORIGIN) {
      writeRelationToDoc(doc, edge, origin)
    },
    isRealtimeEnabled() {
      return connected
    },
    setLocalPresence(target, activity = target ? 'editing' : 'selecting') {
      if (!provider.awareness) return
      provider.awareness.setLocalStateField('target', target)
      provider.awareness.setLocalStateField('activity', target ? activity : undefined)
      provider.awareness.setLocalStateField('updatedAt', Date.now())
    },
    destroy() {
      clearDisconnectTimer()
      doc.off('afterTransaction', onRemoteChange)
      provider.awareness?.off('change', updateAwareness)
      provider.destroy()
      doc.destroy()
      connected = false
    },
  }
}

function writeNodeLayoutToDoc(doc: Y.Doc, node: Node, origin = LOCAL_ORIGIN) {
  const layoutMap = doc.getMap('layout')
  const metaMap = doc.getMap('meta')
  const position = node.position()
  const size = node.getSize()
  doc.transact(() => {
    setMapObject(layoutMap, String(node.id), {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    })
    metaMap.set('updatedAt', new Date().toISOString())
  }, origin)
}

function writeTableToDoc(doc: Y.Doc, node: Node, origin = LOCAL_ORIGIN) {
  const data = node.getData<TableNodeData>()
  const tablesMap = doc.getMap('tables')
  const layoutMap = doc.getMap('layout')
  const metaMap = doc.getMap('meta')
  const position = node.position()
  const size = node.getSize()
  doc.transact(() => {
    setMapObject(tablesMap, String(node.id), {
      id: String(node.id),
      name: data.name || String(node.id),
      businessName: data.businessName,
      description: data.description,
      businessDomain: data.businessDomain,
      tableType: data.tableType,
      importance: data.importance,
      tags: data.tags || [],
      comment: data.comment,
    })
    setMapObject(layoutMap, String(node.id), {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    })
    metaMap.set('updatedAt', new Date().toISOString())
  }, origin)
}

function writeColumnToDoc(
  doc: Y.Doc,
  tableId: string,
  field: TableField,
  sortOrder: number,
  origin = LOCAL_ORIGIN,
) {
  const columnsMap = doc.getMap('columns')
  const enumsMap = doc.getMap('enums')
  const metaMap = doc.getMap('meta')
  doc.transact(() => {
    setMapObject(columnsMap, `${tableId}${FIELD_SEP}${field.name}`, {
      tableKey: tableId,
      name: field.name,
      type: field.type,
      businessName: field.businessName,
      description: field.description,
      comment: field.comment,
      defaultValue: field.defaultValue,
      keyType: field.keyType,
      columnRole: field.columnRole,
      tags: field.tags || [],
      sortOrder,
    })
    deleteKeysByPrefix(enumsMap, `${tableId}${FIELD_SEP}${field.name}${FIELD_SEP}`)
    ;(field.enumValues || []).forEach((entry, enumIndex) => {
      if (!entry.value && !entry.label) return
      setMapObject(enumsMap, enumKey(tableId, field.name, entry.value || entry.label), {
        tableKey: tableId,
        columnKey: field.name,
        value: entry.value,
        label: entry.label || entry.value,
        description: entry.description,
        sortOrder: entry.sortOrder ?? enumIndex,
      })
    })
    metaMap.set('updatedAt', new Date().toISOString())
  }, origin)
}

function writeRelationToDoc(doc: Y.Doc, edge: Edge, origin = LOCAL_ORIGIN) {
  const relation = relationFromEdge(edge)
  if (!relation?.relationKey) return
  const relationsMap = doc.getMap('relations')
  const metaMap = doc.getMap('meta')
  doc.transact(() => {
    setMapObject(relationsMap, relation.relationKey!, relation as unknown as Record<string, unknown>)
    metaMap.set('updatedAt', new Date().toISOString())
  }, origin)
}
