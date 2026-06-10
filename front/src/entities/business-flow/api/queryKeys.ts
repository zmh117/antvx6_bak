import { DEFAULT_GRAPH_ID } from '@/shared/api/config'

export const businessFlowKeys = {
  all: ['business-flows'] as const,
  list: (graphId = DEFAULT_GRAPH_ID) => [...businessFlowKeys.all, graphId, 'list'] as const,
  metas: (productId: string) => [...businessFlowKeys.all, productId, 'metas'] as const,
  members: (businessFlowId: string) =>
    [...businessFlowKeys.all, businessFlowId, 'members'] as const,
}
