import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveGraph,
  createGraph,
  fetchAgentContext,
  fetchGraphMembers,
  fetchGraphs,
  fetchGraphHistory,
  fetchGraphLoad,
  getDefaultGraphId,
  removeGraphMember,
  restoreGraphCheckpoint,
  type GraphMeta,
  type GraphMemberUpsertBody,
  type UpdateGraphBody,
  updateGraphMeta,
  upsertGraphMember,
} from './graphApi'
import { graphKeys } from './queryKeys'

export function useGraphsQuery(productId = 'all') {
  return useQuery({
    queryKey: graphKeys.list(productId),
    queryFn: () => fetchGraphs(productId),
  })
}

export function useCreateGraphMutation(productId = 'all') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createGraph,
    onSuccess: async (created) => {
      const targetProductId = created.product_id ?? productId
      queryClient.setQueryData<GraphMeta[]>(graphKeys.list(targetProductId), (current) => {
        if (!current) return [created]
        if (current.some((graph) => graph.id === created.id)) return current
        return [...current, created].sort((a, b) => a.name.localeCompare(b.name))
      })
      await queryClient.invalidateQueries({ queryKey: graphKeys.lists() })
    },
  })
}

export function useUpdateGraphMetaMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ graphId, body }: { graphId: string; body: UpdateGraphBody }) =>
      updateGraphMeta(graphId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: graphKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: graphKeys.detail(variables.graphId) }),
      ])
    },
  })
}

export function useArchiveGraphMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveGraph,
    onSuccess: async (_data, graphId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: graphKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: graphKeys.detail(graphId) }),
      ])
    },
  })
}

export function useGraphMembersQuery(graphId: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: graphKeys.members(graphId ?? getDefaultGraphId()),
    queryFn: () => fetchGraphMembers(graphId ?? getDefaultGraphId()),
    enabled: Boolean(graphId) && (opts.enabled ?? true),
    retry: false,
  })
}

export function useUpsertGraphMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ graphId, body }: { graphId: string; body: GraphMemberUpsertBody }) =>
      upsertGraphMember(graphId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: graphKeys.members(variables.graphId) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.lists() }),
      ])
    },
  })
}

export function useRemoveGraphMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ graphId, userId }: { graphId: string; userId: string }) =>
      removeGraphMember(graphId, userId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: graphKeys.members(variables.graphId) }),
        queryClient.invalidateQueries({ queryKey: graphKeys.lists() }),
      ])
    },
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
