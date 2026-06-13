import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphKeys } from '@/entities/er-graph/api/queryKeys'
import { getDefaultGraphId } from '@/entities/er-graph/api/graphApi'
import { DEFAULT_PRODUCT_ID } from '@/shared/api/config'
import {
  archiveBusinessFlow,
  archiveSwimlaneComponentApi,
  applyBusinessFlowChanges,
  createBusinessFlow,
  createSwimlaneComponentApi,
  fetchBusinessFlowEditorState,
  fetchBusinessFlowHistory,
  fetchBusinessFlowMembers,
  fetchSwimlaneComponentApi,
  listBusinessFlows,
  listBusinessFlowMetas,
  listSwimlaneComponentsApi,
  placeSwimlaneComponentApi,
  publishSwimlaneComponentVersionApi,
  removeBusinessFlowMember,
  restoreBusinessFlowVersion,
  saveSwimlaneComponentDraftVersionApi,
  saveBusinessFlow,
  type BusinessFlowChangeOpBody,
  type SaveSwimlaneComponentVersionBody,
  type CreateBusinessFlowBody,
  type UpdateBusinessFlowBody,
  updateBusinessFlow,
  type BusinessFlowMemberUpsertBody,
  type BusinessFlowMeta,
  type BusinessFlowRecord,
  upsertBusinessFlowMember,
  updateSwimlaneComponentApi,
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

export function useBusinessFlowMetasQuery(productId = 'all') {
  return useQuery({
    queryKey: businessFlowKeys.metas(productId),
    queryFn: ({ signal }) => listBusinessFlowMetas(productId, signal),
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

export function useSwimlaneComponentsQuery(productId = 'all', status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | null) {
  return useQuery({
    queryKey: businessFlowKeys.swimlaneComponents(productId, status ?? 'all'),
    queryFn: ({ signal }) => listSwimlaneComponentsApi(productId, status, signal),
  })
}

export function useSwimlaneComponentQuery(componentId: string | null) {
  return useQuery({
    queryKey: businessFlowKeys.swimlaneComponent(componentId ?? 'none'),
    queryFn: ({ signal }) => fetchSwimlaneComponentApi(componentId ?? '', signal),
    enabled: Boolean(componentId),
  })
}

export function useCreateSwimlaneComponentMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createSwimlaneComponentApi,
    onSuccess: async (component) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(productId, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'all'),
        }),
      ])
    },
  })
}

export function useUpdateSwimlaneComponentMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      componentId,
      body,
    }: {
      componentId: string
      body: Parameters<typeof updateSwimlaneComponentApi>[1]
    }) => updateSwimlaneComponentApi(componentId, body),
    onSuccess: async (component) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponent(component.id),
        }),
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(productId, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'all'),
        }),
      ])
    },
  })
}

export function useArchiveSwimlaneComponentMutation(productId = DEFAULT_PRODUCT_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveSwimlaneComponentApi,
    onSuccess: async (component) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(productId, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'all'),
        }),
      ])
    },
  })
}

export function useSaveSwimlaneComponentDraftMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      componentId,
      body,
    }: {
      componentId: string
      body: SaveSwimlaneComponentVersionBody
    }) => saveSwimlaneComponentDraftVersionApi(componentId, body),
    onSuccess: async (component) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.swimlaneComponent(component.id) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'all') }),
      ])
    },
  })
}

export function usePublishSwimlaneComponentVersionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      componentId,
      body,
    }: {
      componentId: string
      body?: SaveSwimlaneComponentVersionBody
    }) => publishSwimlaneComponentVersionApi(componentId, body),
    onSuccess: async (component) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.swimlaneComponent(component.id) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'all') }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.swimlaneComponents(component.productId, 'PUBLISHED') }),
      ])
    },
  })
}

export function useBusinessFlowEditorStateQuery(
  businessFlowId: string,
  meta?: Pick<BusinessFlowMeta, 'name' | 'code' | 'description'> | null,
) {
  return useQuery({
    queryKey: businessFlowKeys.editorState(businessFlowId),
    queryFn: ({ signal }) => fetchBusinessFlowEditorState(businessFlowId, meta, signal),
  })
}

export function usePlaceSwimlaneComponentMutation(businessFlowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      componentVersionId,
      position,
    }: {
      componentVersionId: string
      position: { x: number; y: number }
    }) => placeSwimlaneComponentApi(businessFlowId, componentVersionId, position),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.editorState(businessFlowId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.history(businessFlowId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.all }),
      ])
    },
  })
}

export function useApplyBusinessFlowChangesMutation(businessFlowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      baseVersion,
      ops,
    }: {
      baseVersion: number
      ops: BusinessFlowChangeOpBody[]
    }) => applyBusinessFlowChanges(businessFlowId, baseVersion, ops),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.history(businessFlowId) }),
      ])
    },
  })
}

export function useBusinessFlowHistoryQuery(businessFlowId: string) {
  return useQuery({
    queryKey: businessFlowKeys.history(businessFlowId),
    queryFn: () => fetchBusinessFlowHistory(businessFlowId),
  })
}

export function useRestoreBusinessFlowVersionMutation(businessFlowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetVersion: number) => restoreBusinessFlowVersion(businessFlowId, targetVersion),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.editorState(businessFlowId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.history(businessFlowId) }),
        queryClient.invalidateQueries({ queryKey: businessFlowKeys.all }),
      ])
    },
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
