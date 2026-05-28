import type { FieldSelection, TableSelection } from '@/entities/er-graph/model/erSchema'

type FieldSelectionListener = (sel: FieldSelection | null) => void
type TableSelectionListener = (sel: TableSelection | null) => void

/** x6-react-shape 在独立 React 根中渲染节点，Context 无法跨树传递 */
let panelHandler: FieldSelectionListener | null = null
let currentSelection: FieldSelection | null = null
const listeners = new Set<FieldSelectionListener>()
let tablePanelHandler: TableSelectionListener | null = null
let currentTableSelection: TableSelection | null = null
const tableListeners = new Set<TableSelectionListener>()

function notify(sel: FieldSelection | null) {
  currentSelection = sel
  panelHandler?.(sel)
  listeners.forEach((fn) => fn(sel))
}

function notifyTable(sel: TableSelection | null) {
  currentTableSelection = sel
  tablePanelHandler?.(sel)
  tableListeners.forEach((fn) => fn(sel))
}

/** ERDiagram 挂载：驱动侧栏 state */
export function registerFieldPanelHandler(handler: FieldSelectionListener | null) {
  panelHandler = handler
  if (handler) handler(currentSelection)
}

export function registerTablePanelHandler(handler: TableSelectionListener | null) {
  tablePanelHandler = handler
  if (handler) handler(currentTableSelection)
}

/** 表内字段行点击（ERTableNode / node:click 共用） */
export function selectErField(sel: FieldSelection | null) {
  if (sel) notifyTable(null)
  notify(sel)
}

/** 表头编辑按钮点击 */
export function selectErTable(sel: TableSelection | null) {
  if (sel) notify(null)
  notifyTable(sel)
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

export function getCurrentTableSelection() {
  return currentTableSelection
}
