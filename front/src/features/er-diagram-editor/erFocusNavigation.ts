import type { Edge, Graph, Node } from '@antv/x6'
import type { TableNodeData } from '@/entities/er-graph/model/erSchema'
import { fieldRowCenterY } from './erLayout'
import { selectErField, selectErTable } from './erFieldContext'
import { ER_VIEWPORT_SCALE, setErViewportMode } from './erViewportMode'

function waitForGraphRender(graph: Graph): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      graph.off('render:done', finish)
      requestAnimationFrame(() => resolve())
    }
    graph.once('render:done', finish)
    timer = setTimeout(finish, 300)
  })
}

export async function ensureErDetailModeForFocus(graph: Graph) {
  graph.zoomTo(ER_VIEWPORT_SCALE.searchFocus)
  setErViewportMode('detail')
  await waitForGraphRender(graph)
}

export function focusErTable(graph: Graph, tableId: string, opts?: { openPanel?: boolean }) {
  const cell = graph.getCellById(tableId)
  if (!cell?.isNode()) return false
  graph.centerCell(cell)
  if (opts?.openPanel) selectErTable({ tableId })
  return true
}

export async function focusErField(
  graph: Graph,
  tableId: string,
  fieldName: string,
) {
  const cell = graph.getCellById(tableId)
  if (!cell?.isNode()) return false
  const node = cell as Node
  const fields = node.getData<TableNodeData>()?.fields ?? []
  const fieldIndex = fields.findIndex((field) => field.name === fieldName)
  if (fieldIndex < 0) return false

  await ensureErDetailModeForFocus(graph)
  const box = node.getBBox()
  graph.centerPoint(box.x + box.width / 2, box.y + fieldRowCenterY(fieldIndex))
  selectErField({ tableId, fieldName })
  return true
}

export async function focusErEdge(
  graph: Graph,
  edgeId: string,
  opts?: { openPanel?: (edgeId: string) => void },
) {
  const cell = graph.getCellById(edgeId)
  if (!cell?.isEdge()) return false
  await ensureErDetailModeForFocus(graph)
  graph.centerCell(cell as Edge)
  opts?.openPanel?.(edgeId)
  return true
}
