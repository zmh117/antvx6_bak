import type { Graph, Node as X6Node } from '@antv/x6'
import {
  alignErTablePortsFromDom,
  ER_LAYOUT,
  setErTablePorts,
  tableBodyHeight,
} from './erLayout'
import { resolveRelationEndpoints } from './relationUtils'
import type {
  RelationBusinessData,
  RelationRef,
  RelationshipData,
  TableField,
  TableNodeData,
} from '@/entities/er-graph/model/erSchema'

function fieldKey(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function lookupFieldByPortKey(fields: TableField[], keySuffix: string): TableField | undefined {
  return fields.find((f) => fieldKey(f.name) === keySuffix)
}

export function normalizeRelationshipType(
  v: RelationshipData['type'] | undefined | null,
): RelationshipData['type'] {
  if (v === '1:1' || v === '1:N' || v === 'N:N') return v
  return '1:1'
}

/**
 * 将图中当前节点与连线还原为 ER JSON 适用的表数组。
 * 关联以「字段端口」连线为准：`fld-R-<列>` → `fld-L-<目标列>` 或其反向（如 a.id = b.user_id）。
 * 会先清除各表中原来的 relation/ref，再根据边重建（含连线上基数 1:1/1:N/N:N）。
 */
export function graphToErTables(graph: Graph): TableNodeData[] {
  const tablesByNodeId = new Map<string, TableNodeData>()

  graph.getNodes().forEach((n: X6Node) => {
    const id = String(n.id)
    const raw = n.getData<TableNodeData>()
    const data: TableNodeData =
      raw && typeof raw === 'object'
        ? (structuredClone(raw) as TableNodeData)
        : { id, name: id, fields: [] as TableField[] }
    data.id = id
    data.name ||= id
    data.fields ??= []

    const pos = n.position()
    data.layout = { x: pos.x, y: pos.y }

    for (const field of data.fields) {
      delete field.ref
      if (field.keyType === 'relation' || (field.keyType as string) === 'foreign') {
        delete field.keyType
      }
    }

    tablesByNodeId.set(id, data)
  })

  const edges = graph.getEdges().filter((e) => e.shape === 'er-relationship')

  /** 同一源字段（端口）可能对应多条关联边 → 导出为 ref 数组 */
  const relationRefsByPort = new Map<string, RelationRef[]>()

  for (const e of edges) {
    const edgeData = e.getData<RelationBusinessData>()
    let fromCellId: string
    let toCellId: string
    let fromFieldName: string
    let toFieldName: string

    if (
      edgeData?.sourceTable &&
      edgeData.sourceColumn &&
      edgeData.targetTable &&
      edgeData.targetColumn
    ) {
      fromCellId = edgeData.sourceTable
      toCellId = edgeData.targetTable
      fromFieldName = edgeData.sourceColumn
      toFieldName = edgeData.targetColumn
    } else {
      const resolved = resolveRelationEndpoints({
        source: {
          cell: e.getSourceCellId(),
          port: e.getSourcePortId(),
        },
        target: {
          cell: e.getTargetCellId(),
          port: e.getTargetPortId(),
        },
      })
      if (!resolved) continue
      fromCellId = resolved.sourceTable
      toCellId = resolved.targetTable
      fromFieldName = resolved.sourceColumn
      toFieldName = resolved.targetColumn
    }

    const fromTable = tablesByNodeId.get(fromCellId)
    const toTable = tablesByNodeId.get(toCellId)
    if (!fromTable || !toTable) continue

    const fromField =
      fromTable.fields.find((f) => f.name === fromFieldName) ||
      lookupFieldByPortKey(fromTable.fields, fieldKey(fromFieldName))
    const toField =
      toTable.fields.find((f) => f.name === toFieldName) ||
      lookupFieldByPortKey(toTable.fields, fieldKey(toFieldName))
    if (!fromField || !toField) continue

    const relType = normalizeRelationshipType(
      edgeData?.relationship || edgeData?.type || e.getData<RelationshipData>()?.type,
    )

    const entry: RelationRef = {
      table: toCellId,
      field: toField.name,
      relationship: relType,
      relationKey: edgeData?.relationKey,
      relationType: edgeData?.relationType,
      relationName: edgeData?.relationName,
      description: edgeData?.description,
      verified: edgeData?.verified,
      tags: edgeData?.tags,
    }
    const mapKey = `${fromCellId}\0${fieldKey(fromField.name)}`
    const list = relationRefsByPort.get(mapKey)
    if (list) list.push(entry)
    else relationRefsByPort.set(mapKey, [entry])
  }

  for (const [mapKey, refs] of relationRefsByPort) {
    const sep = mapKey.indexOf('\0')
    const fromCellId = mapKey.slice(0, sep)
    const fromPortKey = mapKey.slice(sep + 1)
    const fromTable = tablesByNodeId.get(fromCellId)
    const fromField = fromTable && lookupFieldByPortKey(fromTable.fields, fromPortKey)
    if (!fromField) continue
    fromField.keyType = 'relation'
    fromField.ref = refs.length === 1 ? refs[0] : refs
  }

  return [...tablesByNodeId.values()].sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  )
}

/** 序列化后用最新表数据刷新节点 Data，便于 React 节点图标与导出一致 */
export function applyErTablesToGraphNodes(graph: Graph, tables: TableNodeData[]) {
  const map = new Map(tables.map((t) => [t.id, t]))
  for (const cell of graph.getNodes()) {
    const raw = map.get(String(cell.id))
    if (raw) {
      const { layout: _layout, ...data } = raw
      cell.setData(data, { overwrite: true, deep: true })
      if (cell.shape === 'er-table') {
        const fields = data.fields ?? []
        setErTablePorts(cell, fields)
        cell.resize(ER_LAYOUT.nodeWidth, tableBodyHeight(fields.length))
        requestAnimationFrame(() => {
          const view = (() => {
            try {
              return graph.findViewByCell(cell)
            } catch {
              return null
            }
          })()
          const tableEl = view?.container.querySelector('.er-table') as HTMLElement | null
          if (tableEl) alignErTablePortsFromDom(cell, graph, tableEl, fields)
        })
      }
    }
  }
}
