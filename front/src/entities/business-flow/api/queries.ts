import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphKeys } from '@/entities/er-graph/api/queryKeys'
import { getDefaultGraphId } from '@/entities/er-graph/api/graphApi'
import { DEFAULT_PRODUCT_ID } from '@/shared/api/config'
import {
  archiveBusinessFlow,
  createBusinessFlow,
  fetchBusinessFlowMembers,
  listBusinessFlows,
  listBusinessFlowMetas,
  removeBusinessFlowMember,
  saveBusinessFlow,
  type CreateBusinessFlowBody,
  type UpdateBusinessFlowBody,
  updateBusinessFlow,
  type BusinessFlowMemberUpsertBody,
  type BusinessFlowMeta,
  type BusinessFlowRecord,
  upsertBusinessFlowMember,
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

export function useBusinessFlowMetasQuery(productId = DEFAULT_PRODUCT_ID) {
  return useQuery({
    queryKey: businessFlowKeys.metas(productId),
    queryFn: () => listBusinessFlowMetas(productId),
  })
}

export function useCreateBusinessFlowMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateBusinessFlowBody) =>
      createBusinessFlow({ product_id: productId, ...body }),
    onSuccess: async (created) => {
      queryClient.setQueryData<BusinessFlowMeta[]>(
        businessFlowKeys.metas(productId),
        (current) => {
          if (!current) return [created]
          if (current.some((flow) => flow.id === created.id)) return current
          return [created, ...current]
        },
      )
      await queryClient.invalidateQueries({ queryKey: businessFlowKeys.metas(productId) })
    },
  })
}

export function useUpdateBusinessFlowMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      businessFlowId,
      body,
    }: {
      businessFlowId: string
      body: UpdateBusinessFlowBody
    }) => updateBusinessFlow(businessFlowId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.metas(productId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.members(variables.businessFlowId) }),
      ])
    },
  })
}

export function useArchiveBusinessFlowMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveBusinessFlow,
    onSuccess: async (_data, businessFlowId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.metas(productId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.members(businessFlowId) }),
      ])
    },
  })
}

export function useBusinessFlowMembersQuery(
  businessFlowId: string | null,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: businessFlowKeys.members(businessFlowId ?? 'none'),
    queryFn: () => fetchBusinessFlowMembers(businessFlowId ?? ''),
    enabled: Boolean(businessFlowId) && (opts.enabled ?? true),
    retry: false,
  })
}

export function useUpsertBusinessFlowMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      businessFlowId,
      body,
    }: {
      businessFlowId: string
      body: BusinessFlowMemberUpsertBody
    }) => upsertBusinessFlowMember(businessFlowId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: businessFlowKeys.members(variables.businessFlowId),
      })
    },
  })
}

export function useRemoveBusinessFlowMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      businessFlowId,
      userId,
    }: {
      businessFlowId: string
      userId: string
    }) => removeBusinessFlowMember(businessFlowId, userId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: businessFlowKeys.members(variables.businessFlowId),
      })
    },
  })
}
