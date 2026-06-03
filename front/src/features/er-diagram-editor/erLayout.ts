import type { Graph, Node } from '@antv/x6'
import type { TableField } from '@/entities/er-graph/model/erSchema'

/** 与 er-canvas.css 中 --er-node-* 保持一致 */
export const ER_LAYOUT = {
  nodeWidth: 240,
  headerH: 36,
  rowH: 26,
  bottomPad: 8,
} as const

/** 左右连接桩分组；setProp('ports') 时必须带上，否则会叠成一点 */
export const ER_PORT_GROUPS = {
  fieldLeft: {
    position: { name: 'absolute' as const },
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: 'var(--er-port-stroke)',
        fill: 'var(--er-port-fill)',
      },
    },
  },
  fieldRight: {
    position: { name: 'absolute' as const },
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: 'var(--er-port-stroke)',
        fill: 'var(--er-port-fill)',
      },
    },
  },
} as const

export function tableBodyHeight(fieldCount: number) {
  return ER_LAYOUT.headerH + fieldCount * ER_LAYOUT.rowH + ER_LAYOUT.bottomPad
}

export function fieldKey(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function fieldPortId(fieldName: string, side: 'L' | 'R') {
  return `fld-${side}-${fieldKey(fieldName)}`
}

export function fieldRowCenterY(index: number) {
  return ER_LAYOUT.headerH + index * ER_LAYOUT.rowH + ER_LAYOUT.rowH / 2
}

export function buildFieldPortItems(fields: TableField[]) {
  const w = ER_LAYOUT.nodeWidth
  return fields.flatMap((f, i) => {
    const y = fieldRowCenterY(i)
    return [
      { id: fieldPortId(f.name, 'L'), group: 'fieldLeft', args: { x: 0, y } },
      { id: fieldPortId(f.name, 'R'), group: 'fieldRight', args: { x: w, y } },
    ]
  })
}

export function setErTablePorts(node: Node, fields: TableField[]) {
  node.setProp('ports', {
    groups: ER_PORT_GROUPS,
    items: buildFieldPortItems(fields),
  })
}

/** 字段行中心 → 节点本地坐标（与 X6 absolute 端口同一坐标系，含缩放） */
function fieldRowCenterLocalY(graph: Graph, node: Node, row: HTMLElement): number | null {
  const view = (() => {
    try {
      return graph.findViewByCell(node)
    } catch {
      return null
    }
  })()
  if (!view) return null
  const bbox = node.getBBox()
  const rect = row.getBoundingClientRect()
  const local = graph.clientToLocal({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  })
  return local.y - bbox.y
}

/** 按 DOM 实测每行垂直中心更新端口 Y，并同步节点高度 */
export function alignErTablePortsFromDom(
  node: Node,
  graph: Graph,
  tableRoot: HTMLElement,
  fields: TableField[],
) {
  const wasHistoryEnabled = graph.isHistoryEnabled()
  if (wasHistoryEnabled) graph.disableHistory()
  try {
    alignErTablePortsFromDomInner(node, graph, tableRoot, fields)
  } finally {
    if (wasHistoryEnabled) graph.enableHistory()
  }
}

function alignErTablePortsFromDomInner(
  node: Node,
  graph: Graph,
  tableRoot: HTMLElement,
  fields: TableField[],
) {
  try {
    if (!graph.findViewByCell(node)) return
  } catch {
    return
  }

  const expectedItems = buildFieldPortItems(fields)
  if (node.getPorts().length !== expectedItems.length) {
    setErTablePorts(node, fields)
  }

  if (fields.length === 0) {
    const h = ER_LAYOUT.headerH + ER_LAYOUT.bottomPad
    node.resize(ER_LAYOUT.nodeWidth, h)
    return
  }

  let aligned = 0
  for (const field of fields) {
    const row = tableRoot.querySelector<HTMLElement>(
      `[data-field-name="${CSS.escape(field.name)}"]`,
    )
    if (!row) continue
    const y = fieldRowCenterLocalY(graph, node, row)
    if (y == null || !Number.isFinite(y)) continue

    node.setPortProp(fieldPortId(field.name, 'L'), 'args/y', y)
    node.setPortProp(fieldPortId(field.name, 'R'), 'args/y', y)
    aligned += 1
  }

  const totalH = Math.max(Math.ceil(tableRoot.offsetHeight), tableBodyHeight(fields.length))
  const size = node.getSize()
  if (size.width !== ER_LAYOUT.nodeWidth || Math.abs(size.height - totalH) > 0.5) {
    node.resize(ER_LAYOUT.nodeWidth, totalH)
  }

  if (aligned < fields.length) {
    for (let i = 0; i < fields.length; i += 1) {
      const y = fieldRowCenterY(i)
      node.setPortProp(fieldPortId(fields[i].name, 'L'), 'args/y', y)
      node.setPortProp(fieldPortId(fields[i].name, 'R'), 'args/y', y)
    }
  }
}
