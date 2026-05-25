import type { Graph } from '@antv/x6'

export function bindX6KeyboardHistory(
  graph: Graph,
  opts?: { beforeApply?: () => void },
): () => void {
  graph.bindKey(['ctrl+z', 'meta+z'], () => {
    if (!graph.canUndo()) return false
    opts?.beforeApply?.()
    graph.undo({ source: 'keyboard' })
    return false
  })
  graph.bindKey(['ctrl+y', 'meta+shift+z'], () => {
    if (!graph.canRedo()) return false
    opts?.beforeApply?.()
    graph.redo({ source: 'keyboard' })
    return false
  })
  return () => {
    graph.unbindKey(['ctrl+z', 'meta+z'])
    graph.unbindKey(['ctrl+y', 'meta+shift+z'])
  }
}
