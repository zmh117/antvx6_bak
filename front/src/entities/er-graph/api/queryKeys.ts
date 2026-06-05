import { DEFAULT_GRAPH_ID } from '@/shared/api/config'

export const graphKeys = {
  all: ['graphs'] as const,
  lists: () => [...graphKeys.all, 'list'] as const,
  list: () => [...graphKeys.lists()] as const,
  detail: (graphId = DEFAULT_GRAPH_ID) => [...graphKeys.all, graphId, 'detail'] as const,
  members: (graphId = DEFAULT_GRAPH_ID) => [...graphKeys.all, graphId, 'members'] as const,
  histories: (graphId = DEFAULT_GRAPH_ID) => [...graphKeys.all, graphId, 'history'] as const,
  history: (graphId = DEFAULT_GRAPH_ID, limit = 100) =>
    [...graphKeys.histories(graphId), limit] as const,
  agentContexts: (graphId = DEFAULT_GRAPH_ID) =>
    [...graphKeys.all, graphId, 'agent-context'] as const,
  agentContext: (graphId = DEFAULT_GRAPH_ID, query = '') =>
    [...graphKeys.agentContexts(graphId), query] as const,
}
