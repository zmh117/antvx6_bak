import type { Graph } from '@antv/x6'

export function withHistoryPausedSync(graph: Graph, fn: () => void): void {
  const wasEnabled = graph.isHistoryEnabled()
  if (wasEnabled) graph.disableHistory()
  try {
    fn()
  } finally {
    if (wasEnabled) graph.enableHistory()
  }
}

/** @alias withHistoryPausedSync */
export function withHistoryPaused(graph: Graph, fn: () => void): void {
  withHistoryPausedSync(graph, fn)
}

export async function withHistoryPausedAsync(
  graph: Graph,
  fn: () => Promise<void>,
): Promise<void> {
  const wasEnabled = graph.isHistoryEnabled()
  if (wasEnabled) graph.disableHistory()
  try {
    await fn()
  } finally {
    if (wasEnabled) graph.enableHistory()
  }
}
