import type { EdgeMetadata } from '@antv/x6'
import { fieldKey } from './erLayout'
import type { RelationBusinessData, RelationshipData } from '@/entities/er-graph/model/erSchema'
import { normalizeRelationshipType } from './graphToErData'

export function buildRelationKey(
  sourceTable: string,
  sourceColumn: string,
  targetTable: string,
  targetColumn: string,
): string {
  return `${sourceTable}.${sourceColumn}__${targetTable}.${targetColumn}`
}

export function parseFieldFromPort(portId?: string): string | null {
  const m = portId?.match(/^fld-[LR]-(.+)$/)
  return m ? m[1] : null
}

/** 从连线端点解析源/目标表字段（右端口 -> 左端口） */
export function resolveRelationEndpoints(edge: {
  source?: { cell?: string; port?: string }
  target?: { cell?: string; port?: string }
}): {
  sourceTable: string
  sourceColumn: string
  targetTable: string
  targetColumn: string
} | null {
  const sourceTable = edge.source?.cell
  const targetTable = edge.target?.cell
  const sp = edge.source?.port
  const tp = edge.target?.port
  if (!sourceTable || !targetTable || !sp || !tp) return null

  const sm = sp.match(/^fld-([LR])-(.+)$/)
  const tm = tp.match(/^fld-([LR])-(.+)$/)
  if (!sm || !tm) return null

  if (sm[1] === 'R' && tm[1] === 'L') {
    return {
      sourceTable: String(sourceTable),
      sourceColumn: sm[2],
      targetTable: String(targetTable),
      targetColumn: tm[2],
    }
  }
  if (sm[1] === 'L' && tm[1] === 'R') {
    return {
      sourceTable: String(targetTable),
      sourceColumn: tm[2],
      targetTable: String(sourceTable),
      targetColumn: sm[2],
    }
  }
  return null
}

export function buildRelationEdgeData(
  sourceTable: string,
  sourceColumn: string,
  targetTable: string,
  targetColumn: string,
  relationship?: RelationshipData['type'],
  extra?: Partial<RelationBusinessData>,
): RelationBusinessData {
  const rel = normalizeRelationshipType(relationship)
  const relationKey = buildRelationKey(sourceTable, sourceColumn, targetTable, targetColumn)
  return {
    relationKey,
    relationType: 'logical_relation',
    relationship: rel,
    type: rel,
    sourceTable,
    sourceColumn,
    targetTable,
    targetColumn,
    joinCondition: `${sourceTable}.${sourceColumn} = ${targetTable}.${targetColumn}`,
    confidence: 1,
    source: 'manual',
    verified: false,
    ...extra,
  }
}

export function enrichEdgeMetadata(edge: EdgeMetadata, fieldNameByPortKey: Map<string, string>): EdgeMetadata {
  const data = (edge.data || {}) as RelationBusinessData
  if (data.sourceTable && data.sourceColumn && data.targetTable && data.targetColumn) {
    const rel = normalizeRelationshipType(data.relationship || data.type)
    const relationKey =
      data.relationKey ||
      buildRelationKey(data.sourceTable, data.sourceColumn, data.targetTable, data.targetColumn)
    return {
      ...edge,
      id: relationKey,
      data: { ...data, relationKey, type: rel, relationship: rel },
    }
  }

  const endpoints = edge as unknown as {
    source?: { cell?: string; port?: string }
    target?: { cell?: string; port?: string }
  }
  const resolved = resolveRelationEndpoints(endpoints)
  if (!resolved) return edge

  const sourceColumn =
    fieldNameByPortKey.get(`${resolved.sourceTable}\0${resolved.sourceColumn}`) ||
    resolved.sourceColumn
  const targetColumn =
    fieldNameByPortKey.get(`${resolved.targetTable}\0${resolved.targetColumn}`) ||
    resolved.targetColumn

  const relData = buildRelationEdgeData(
    resolved.sourceTable,
    sourceColumn,
    resolved.targetTable,
    targetColumn,
    (data as RelationshipData).type,
    data,
  )

  return {
    ...edge,
    id: relData.relationKey,
    data: relData,
  }
}

export function fieldNameLookupFromTable(fields: { name: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of fields) {
    m.set(fieldKey(f.name), f.name)
  }
  return m
}
