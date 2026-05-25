import type { FieldSelection } from '@/entities/er-graph/model/erSchema'

type FieldSelectionListener = (sel: FieldSelection | null) => void

/** x6-react-shape 在独立 React 根中渲染节点，Context 无法跨树传递 */
let panelHandler: FieldSelectionListener | null = null
let currentSelection: FieldSelection | null = null
const listeners = new Set<FieldSelectionListener>()

function notify(sel: FieldSelection | null) {
  currentSelection = sel
  panelHandler?.(sel)
  listeners.forEach((fn) => fn(sel))
}

/** ERDiagram 挂载：驱动侧栏 state */
export function registerFieldPanelHandler(handler: FieldSelectionListener | null) {
  panelHandler = handler
  if (handler) handler(currentSelection)
}

/** 表内字段行点击（ERTableNode / node:click 共用） */
export function selectErField(sel: FieldSelection | null) {
  notify(sel)
}

export function subscribeFieldSelection(listener: FieldSelectionListener) {
  listeners.add(listener)
  listener(currentSelection)
  return () => {
    listeners.delete(listener)
  }
}

export function getCurrentFieldSelection() {
  return currentSelection
}
