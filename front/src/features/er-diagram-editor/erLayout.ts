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

function samePortItems(current: ReturnType<Node['getPorts']>, expected: ReturnType<typeof buildFieldPortItems>) {
  if (current.length !== expected.length) return false
  for (let i = 0; i < expected.length; i += 1) {
    const a = current[i]
    const b = expected[i]
    if (a.id !== b.id || a.group !== b.group) return false
    const ax = (a.args as { x?: number; y?: number } | undefined)?.x
    const ay = (a.args as { x?: number; y?: number } | undefined)?.y
    if (ax !== b.args.x || ay !== b.args.y) return false
  }
  return true
}

export function setErTablePorts(node: Node, fields: TableField[]) {
  const items = buildFieldPortItems(fields)
  if (samePortItems(node.getPorts(), items)) return
  node.setProp('ports', {
    groups: ER_PORT_GROUPS,
    items,
  })
}

/** 固定字段行高度下，按字段 index 计算端口 Y，避免大量 DOM 测量 */
export function alignErTablePortsFromDom(
  node: Node,
  graph: Graph,
  _tableRoot: HTMLElement,
  fields: TableField[],
) {
  const wasHistoryEnabled = graph.isHistoryEnabled()
  if (wasHistoryEnabled) graph.disableHistory()
  try {
    alignErTablePortsFromDomInner(node, graph, fields)
  } finally {
    if (wasHistoryEnabled) graph.enableHistory()
  }
}

function alignErTablePortsFromDomInner(
  node: Node,
  graph: Graph,
  fields: TableField[],
) {
  try {
    if (!graph.findViewByCell(node)) return
  } catch {
    return
  }

  setErTablePorts(node, fields)

  const totalH = tableBodyHeight(fields.length)
  const size = node.getSize()
  if (size.width !== ER_LAYOUT.nodeWidth || Math.abs(size.height - totalH) > 0.5) {
    node.resize(ER_LAYOUT.nodeWidth, totalH)
  }
}
