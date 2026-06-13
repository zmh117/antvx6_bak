import { DEFAULT_GRAPH_ID } from '@/shared/api/config'

export const businessFlowKeys = {
  all: ['business-flows'] as const,
  list: (graphId = DEFAULT_GRAPH_ID) => [...businessFlowKeys.all, graphId, 'list'] as const,
  metas: (productId: string) => [...businessFlowKeys.all, productId, 'metas'] as const,
  editorState: (businessFlowId: string) =>
    [...businessFlowKeys.all, businessFlowId, 'editor-state'] as const,
  history: (businessFlowId: string) =>
    [...businessFlowKeys.all, businessFlowId, 'history'] as const,
  swimlaneComponents: (productId = 'all', status = 'all') =>
    [...businessFlowKeys.all, 'swimlane-components', productId, status] as const,
  swimlaneComponent: (componentId: string) =>
    [...businessFlowKeys.all, 'swimlane-component', componentId] as const,
  members: (businessFlowId: string) =>
    [...businessFlowKeys.all, businessFlowId, 'members'] as const,
}
