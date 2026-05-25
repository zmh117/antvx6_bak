import type { Graph } from '@antv/x6'
import type { RelationBusinessData, RelationshipData } from '@/entities/er-graph/model/erSchema'
import { buildErRelationshipLabel, readErColorMode } from '../erTheme'
import { buildRelationEdgeData, resolveRelationEndpoints } from '../relationUtils'
import { withHistoryPausedSync } from './withHistoryPaused'

/** undo/redo 后补全边 data/labels；禁止 updateCellId，避免删线 undo 失败 */
export function repairErEdgesAfterHistory(graph: Graph): void {
  withHistoryPausedSync(graph, () => {
    graph.batchUpdate(() => {
    for (const edge of graph.getEdges()) {
      if (edge.shape !== 'er-relationship') continue
      const resolved = resolveRelationEndpoints({
        source: edge.getSource() as { cell?: string; port?: string },
        target: edge.getTarget() as { cell?: string; port?: string },
      })
      if (!resolved) continue
      const existing = edge.getData<RelationBusinessData>() || {}
      const relType = (existing.relationship ||
        existing.type ||
        '1:1') as RelationshipData['type']
      const relData = buildRelationEdgeData(
        resolved.sourceTable,
        resolved.sourceColumn,
        resolved.targetTable,
        resolved.targetColumn,
        relType,
        existing,
      )
      edge.setData(relData)
      edge.setLabels([buildErRelationshipLabel(relType, readErColorMode())])
    }
    })
  })
}
