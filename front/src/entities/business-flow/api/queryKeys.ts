import { DEFAULT_GRAPH_ID } from '@/shared/api/config'

export const businessFlowKeys = {
  all: ['business-flows'] as const,
  list: (graphId = DEFAULT_GRAPH_ID) => [...businessFlowKeys.all, graphId, 'list'] as const,
  detail: (graphId = DEFAULT_GRAPH_ID, flowKey: string) =>
    [...businessFlowKeys.all, graphId, 'detail', flowKey] as const,
}
