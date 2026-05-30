import { HocuspocusProvider } from '@hocuspocus/provider'
import type { Graph, EdgeMetadata, NodeMetadata } from '@antv/x6'
import * as Y from 'yjs'
import { COLLAB_WS_URL } from '@/shared/api/config'
import type {
  FieldEnumEntry,
  RelationBusinessData,
  RelationRef,
  TableField,
  TableNodeData,
} from '@/entities/er-graph/model/erSchema'
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
import { buildErRelationshipLabel } from '../erTheme'
import { withHistoryPaused } from './withHistoryPaused'

const LOCAL_ORIGIN = 'x6-local'
const FIELD_SEP = '::'

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
  isRealtimeEnabled: () => boolean
  setLocalPresence: (target: ErPresenceTarget | null, activity?: ErPresenceActivity) => void
  destroy: () => void
  doc: Y.Doc
  provider: HocuspocusProvider
}

export type ErCollaborationOptions = {
  graph: Graph
  graphId: string
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
    relationType: data.relationType || 'logical_relation',
    verified: Boolean(data.verified),
    tags: data.tags || [],
  }
}

function writeGraphToDoc(graph: Graph, doc: Y.Doc, origin = LOCAL_ORIGIN) {
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
    nodes.push({
      id: table.id,
      shape: 'er-table',
      x: table.layout?.x ?? (index % 2) * (ER_LAYOUT.nodeWidth + 100),
      y: table.layout?.y ?? Math.floor(index / 2) * (height + 100),
      width: ER_LAYOUT.nodeWidth,
      height,
      data: table,
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
          labels: [buildErRelationshipLabel(relationship)],
        })
      }
    }
  }
  return { nodes, edges }
}

function applyDocToGraph(graph: Graph, doc: Y.Doc) {
  const tables = tablesFromDoc(doc)
  const { nodes, edges } = graphDataFromTables(tables)
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]))
  const edgeById = new Map(edges.map((edge) => [String(edge.id), edge]))

  withHistoryPaused(graph, () => {
    const seen = new Set<string>()
    const duplicateCells = graph.getCells().filter((cell) => {
      const id = String(cell.id)
      if (!seen.has(id)) {
        seen.add(id)
        return false
      }
      return true
    })
    if (duplicateCells.length) {
      graph.removeCells(duplicateCells)
    }

    const staleNodes = graph
      .getNodes()
      .filter((node) => node.shape === 'er-table' && !nodeById.has(String(node.id)))
    const staleEdges = graph
      .getEdges()
      .filter((edge) => edge.shape === 'er-relationship' && !edgeById.has(String(edge.id)))
    if (staleEdges.length || staleNodes.length) {
      graph.removeCells([...staleEdges, ...staleNodes])
    }

    for (const meta of nodes) {
      const id = String(meta.id)
      const existing = graph.getCellById(id)
      const table = meta.data as TableNodeData
      if (existing?.isNode()) {
        existing.position(Number(meta.x ?? 0), Number(meta.y ?? 0))
        existing.resize(Number(meta.width ?? ER_LAYOUT.nodeWidth), Number(meta.height ?? tableBodyHeight(table.fields.length)))
        existing.setData(table, { overwrite: true, deep: true })
        setErTablePorts(existing, table.fields)
      } else {
        graph.addNode(meta)
      }
    }

    for (const meta of edges) {
      const id = String(meta.id)
      const existing = graph.getCellById(id)
      if (existing?.isEdge()) {
        if (meta.source) existing.setSource(meta.source as never)
        if (meta.target) existing.setTarget(meta.target as never)
        existing.setData(meta.data)
        existing.setLabels(meta.labels ?? [])
      } else {
        graph.addEdge(meta)
      }
    }
  })
  graph.cleanHistory()
}

export function createErCollaboration(options: ErCollaborationOptions): ErCollaborationController {
  const doc = new Y.Doc()
  let connected = false
  let applying = false
  const provider = new HocuspocusProvider({
    url: COLLAB_WS_URL,
    name: `graph:${options.graphId}`,
    document: doc,
    token: options.token,
  })

  const onRemoteChange = (transaction: Y.Transaction) => {
    if ((transaction.local && transaction.origin === LOCAL_ORIGIN) || applying) return
    applying = true
    options.setApplyingRemote(true)
    try {
      applyDocToGraph(options.graph, doc)
      options.onRemoteApply()
    } finally {
      options.setApplyingRemote(false)
      applying = false
    }
  }

  doc.on('afterTransaction', onRemoteChange)

  provider.on('status', ({ status }: { status: string }) => {
    connected = status === 'connected'
    options.onStatus(connected ? 'connected' : 'disconnected')
  })
  provider.on('synced', ({ state }: { state: boolean }) => {
    if (!state) return
    connected = true
    options.onStatus('connected')
    if (doc.getMap('tables').size === 0 && options.graph.getNodes().length) {
      writeGraphToDoc(options.graph, doc, LOCAL_ORIGIN)
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
      writeGraphToDoc(options.graph, doc, origin)
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
      doc.off('afterTransaction', onRemoteChange)
      provider.awareness?.off('change', updateAwareness)
      provider.destroy()
      doc.destroy()
      connected = false
    },
  }
}
