import { DEFAULT_GRAPH_ID } from '@/shared/api/config'

export const businessFlowKeys = {
  all: ['business-flows'] as const,
  list: (graphId = DEFAULT_GRAPH_ID) => [...businessFlowKeys.all, graphId, 'list'] as const,
}
