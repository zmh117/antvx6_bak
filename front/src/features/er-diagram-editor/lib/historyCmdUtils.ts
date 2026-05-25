import type { Graph } from '@antv/x6'

type HistoryCmd = {
  event?: string
  data?: { id?: string; edge?: boolean }
}

function flattenHistoryCmds(
  cmds: HistoryCmd[] | HistoryCmd[][] | null | undefined,
): HistoryCmd[] {
  if (!cmds?.length) return []
  const first = cmds[0]
  if (Array.isArray(first)) return (cmds as HistoryCmd[][]).flat()
  return cmds as HistoryCmd[]
}

/** 仅当 undo 涉及边（增删改）时才需要 repair metadata */
export function historyCmdsNeedEdgeRepair(
  graph: Graph,
  cmds: HistoryCmd[] | HistoryCmd[][] | null | undefined,
): boolean {
  for (const cmd of flattenHistoryCmds(cmds)) {
    const ev = cmd.event ?? ''
    if (ev === 'cell:added' || ev === 'cell:removed') {
      if (cmd.data?.edge) return true
      continue
    }
    if (!ev.startsWith('cell:change:')) continue
    const id = cmd.data?.id
    if (!id) continue
    const cell = graph.getCellById(id)
    if (cell?.isEdge()) return true
  }
  return false
}
