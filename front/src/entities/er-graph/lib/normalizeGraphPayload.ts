import type { Graph } from '@antv/x6'
import { ER_LAYOUT } from '@/features/er-diagram-editor/erLayout'
import { graphToErTables } from '@/features/er-diagram-editor/graphToErData'
import type { CanvasSnapshot, TableField } from '@/entities/er-graph/model/erSchema'
import { normalizeColumnRole } from '@/entities/er-graph/model/erSchema'
import { buildRelationKey, enrichEdgeMetadata } from '@/features/er-diagram-editor/relationUtils'

function fieldKey(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function isEmptyEnum(e: { value?: string; label?: string }) {
  return !(e.value ?? '').trim() && !(e.label ?? '').trim()
}

function inferColumnRole(field: TableField): TableField['columnRole'] {
  const normalized = normalizeColumnRole(field.columnRole)
  if (normalized) return normalized
  const n = field.name.toLowerCase()
  if (field.keyType === 'primary' || n === 'id') return 'id'
  if (field.keyType === 'relation') return 'query_link'
  if (field.enumValues?.length) return 'enum'
  if (n.includes('status')) return 'status'
  if (n.endsWith('_at') || n.includes('time') || n.includes('date')) return 'time'
  if (n.includes('amount') || n.includes('price')) return 'amount'
  return undefined
}

export function graphToCanvasSnapshot(graph: Graph): CanvasSnapshot {
  const json = graph.toJSON() as { cells?: unknown[]; nodes?: unknown[]; edges?: unknown[] }
  const cells = json.cells ?? []
  if (cells.length > 0) {
    const nodes = cells.filter(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        !(c as { source?: unknown }).source &&
        !(c as { target?: unknown }).target &&
        ((c as { shape?: string }).shape === 'er-table' ||
          Array.isArray((c as { data?: { fields?: unknown } }).data?.fields)),
    )
    const edges = cells.filter(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        (c as { source?: unknown }).source != null &&
        (c as { target?: unknown }).target != null,
    )
    return { nodes: nodes as Record<string, unknown>[], edges: edges as Record<string, unknown>[] }
  }
  return {
    nodes: (json.nodes ?? []) as Record<string, unknown>[],
    edges: (json.edges ?? []) as Record<string, unknown>[],
  }
}

export type GraphOperationSource =
  | 'auto_save'
  | 'undo'
  | 'redo'
  | 'manual_save'
  | 'restore'

export function buildNormalizedSyncBody(
  graph: Graph,
  opts: {
    baseVersion?: number
    clientId?: string
    operationSource?: GraphOperationSource
  },
) {
  const snapshot = graphToCanvasSnapshot(graph)
  const legacyTables = graphToErTables(graph)

  const tables = legacyTables.map((t) => {
    const node = graph.getCellById(t.id)
    const pos = node?.isNode() ? node.position() : t.layout
    const size = node?.isNode() ? node.getSize() : { width: ER_LAYOUT.nodeWidth, height: 0 }
    return {
      table_key: t.id,
      table_name: t.name,
      business_name: t.businessName,
      description: t.description,
      business_domain: t.businessDomain,
      table_type: t.tableType ?? 'business',
      importance: t.importance ?? 3,
      tags: t.tags ?? [],
      comment: t.comment,
      x: pos?.x ?? t.layout?.x,
      y: pos?.y ?? t.layout?.y,
      width: size.width,
      height: size.height,
      raw_data: t,
    }
  })

  const columns: Record<string, unknown>[] = []
  const enums: Record<string, unknown>[] = []

  for (const table of legacyTables) {
    table.fields.forEach((field, idx) => {
      const validEnums = (field.enumValues ?? []).filter((e) => !isEmptyEnum(e))
      columns.push({
        table_key: table.id,
        column_key: field.name,
        column_name: field.name,
        data_type: field.type,
        business_name: field.businessName,
        description: field.description,
        comment: field.comment,
        default_value: field.defaultValue,
        is_primary_key: field.keyType === 'primary',
        is_unique: field.keyType === 'unique',
        key_type: field.keyType,
        column_role: inferColumnRole(field),
        enum_enabled: validEnums.length > 0,
        sort_order: idx,
        tags: field.tags ?? [],
        raw_data: field,
      })
      validEnums.forEach((e, eidx) => {
        enums.push({
          table_key: table.id,
          column_key: field.name,
          value: e.value,
          label: e.label || e.value,
          description: e.description,
          sort_order: e.sortOrder ?? eidx,
        })
      })
    })
  }

  const relations: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const rawEdge of snapshot.edges) {
    const edge = rawEdge as {
      id?: string
      source?: { cell?: string; port?: string }
      target?: { cell?: string; port?: string }
      data?: Record<string, unknown>
    }
    const sourceTable = edge.source?.cell
    if (!sourceTable) continue
    const table = legacyTables.find((t) => t.id === sourceTable)
    const portLookup = new Map<string, string>()
    if (table) {
      for (const f of table.fields) {
        portLookup.set(`${table.id}\0${fieldKey(f.name)}`, f.name)
      }
    }
    const enriched = enrichEdgeMetadata(
      edge as import('@antv/x6').EdgeMetadata,
      portLookup,
    )
    const data = enriched.data as Record<string, unknown>
    const st = data.sourceTable as string
    const sc = data.sourceColumn as string
    const tt = data.targetTable as string
    const tc = data.targetColumn as string
    if (!st || !sc || !tt || !tc) continue
    const rk = (data.relationKey as string) || buildRelationKey(st, sc, tt, tc)
    if (seen.has(rk)) continue
    seen.add(rk)
    relations.push({
      relation_key: rk,
      source_table_key: st,
      source_column_key: sc,
      target_table_key: tt,
      target_column_key: tc,
      relation_type: data.relationType ?? 'logical_relation',
      match_operator: data.matchOperator ?? 'eq',
      relationship: data.relationship ?? data.type ?? '1:1',
      join_condition: data.joinCondition,
      relation_name: data.relationName,
      description: data.description,
      confidence: data.confidence ?? 1,
      source: data.source ?? 'manual',
      verified: data.verified ?? false,
      tags: data.tags ?? [],
      raw_edge: enriched,
    })
  }

  return {
    x6Json: { nodes: snapshot.nodes, edges: snapshot.edges, cells: graph.toJSON().cells },
    legacyTables,
    baseVersion: opts.baseVersion,
    clientId: opts.clientId,
    operationSource: opts.operationSource ?? 'auto_save',
    payload: { tables, columns, enums, relations },
  }
}
