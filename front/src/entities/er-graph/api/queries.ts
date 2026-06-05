import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAgentContext,
  fetchGraphs,
  fetchGraphHistory,
  fetchGraphLoad,
  getDefaultGraphId,
  restoreGraphCheckpoint,
} from './graphApi'
import { graphKeys } from './queryKeys'

export function useGraphsQuery() {
  return useQuery({
    queryKey: graphKeys.list(),
    queryFn: fetchGraphs,
  })
}

export function useGraphQuery(graphId = getDefaultGraphId()) {
  return useQuery({
    queryKey: graphKeys.detail(graphId),
    queryFn: () => fetchGraphLoad(graphId),
  })
}

export function useGraphHistoryQuery(
  graphId = getDefaultGraphId(),
  opts: { limit?: number; enabled?: boolean } = {},
) {
  const limit = opts.limit ?? 100
  return useQuery({
    queryKey: graphKeys.history(graphId, limit),
    queryFn: () => fetchGraphHistory(graphId, limit),
    enabled: opts.enabled ?? true,
  })
}

export function useAgentContextQuery(
  graphId = getDefaultGraphId(),
  query = '',
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: graphKeys.agentContext(graphId, query),
    queryFn: () => fetchAgentContext(graphId, query),
    enabled: opts.enabled ?? true,
  })
}

export function useRestoreGraphCheckpointMutation(graphId = getDefaultGraphId()) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changeLogId: number) => restoreGraphCheckpoint(changeLogId, graphId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: graphKeys.detail(graphId) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.agentContexts(graphId) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.histories(graphId) }),
      ])
    },
  })
}
