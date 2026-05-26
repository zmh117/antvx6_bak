import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphKeys } from '@/entities/er-graph/api/queryKeys'
import { getDefaultGraphId } from '@/entities/er-graph/api/graphApi'
import {
  listBusinessFlows,
  saveBusinessFlow,
  type BusinessFlowRecord,
} from './businessFlowApi'
import { businessFlowKeys } from './queryKeys'

export function useBusinessFlowsQuery(graphId = getDefaultGraphId()) {
  return useQuery({
    queryKey: businessFlowKeys.list(graphId),
    queryFn: () => listBusinessFlows(graphId),
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
      body: Omit<BusinessFlowRecord, 'graph_id' | 'flow_key' | 'version'>
    }) => saveBusinessFlow(graphId, flowKey, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.list(graphId) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.agentContexts(graphId) }),
      ])
    },
  })
}
