import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphKeys } from '@/entities/er-graph/api/queryKeys'
import { getDefaultGraphId } from '@/entities/er-graph/api/graphApi'
import {
  fetchBusinessFlow,
  listBusinessFlows,
  saveBusinessFlow,
  type BusinessFlowRecord,
  type BusinessFlowSaveBody,
} from './businessFlowApi'
import { businessFlowKeys } from './queryKeys'

export function useBusinessFlowsQuery(graphId = getDefaultGraphId()) {
  return useQuery({
    queryKey: businessFlowKeys.list(graphId),
    queryFn: () => listBusinessFlows(graphId),
  })
}

export function useBusinessFlowQuery(
  graphId = getDefaultGraphId(),
  flowKey: string | null,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: businessFlowKeys.detail(graphId, flowKey ?? ''),
    queryFn: () => fetchBusinessFlow(graphId, flowKey ?? ''),
    enabled: Boolean(flowKey) && (opts.enabled ?? true),
  })
}

export function useSaveBusinessFlowMutation(graphId = getDefaultGraphId()) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowKey,
      body,
    }: {
      flowKey: string
      body: BusinessFlowSaveBody
    }) => saveBusinessFlow(graphId, flowKey, body),
    onSuccess: async (saved) => {
      queryClient.setQueryData<BusinessFlowRecord>(
        businessFlowKeys.detail(graphId, saved.flow_key),
        saved,
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.list(graphId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.detail(graphId, saved.flow_key) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.agentContexts(graphId) }),
      ])
    },
  })
}
