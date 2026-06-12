import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveProduct,
  createProduct,
  fetchProductMembers,
  fetchProducts,
  removeProductMember,
  updateProduct,
  upsertProductMember,
  type ProductCreateBody,
  type ProductMemberUpsertBody,
  type ProductMeta,
  type ProductUpdateBody,
} from './productApi'
import { productKeys } from './queryKeys'

export function useProductsQuery() {
  return useQuery({
    queryKey: productKeys.list(),
    queryFn: fetchProducts,
  })
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ProductCreateBody) => createProduct(body),
    onSuccess: async (created) => {
      queryClient.setQueryData<ProductMeta[]>(productKeys.list(), (current) => {
        if (!current) return [created]
        if (current.some((product) => product.id === created.id)) return current
        return [...current, created].sort((a, b) => a.name.localeCompare(b.name))
      })
      await queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    },
  })
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: ProductUpdateBody }) =>
      updateProduct(productId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: productKeys.members(variables.productId) }),
      ])
    },
  })
}

export function useArchiveProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: archiveProduct,
    onSuccess: async (_data, productId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: productKeys.members(productId) }),
      ])
    },
  })
}

export function useProductMembersQuery(productId: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: productKeys.members(productId ?? 'none'),
    queryFn: () => fetchProductMembers(productId ?? ''),
    enabled: Boolean(productId) && (opts.enabled ?? true),
    retry: false,
  })
}

export function useUpsertProductMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: ProductMemberUpsertBody }) =>
      upsertProductMember(productId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.members(variables.productId) }),
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
      ])
    },
  })
}

export function useRemoveProductMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, userId }: { productId: string; userId: string }) =>
      removeProductMember(productId, userId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.members(variables.productId) }),
        queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
      ])
    },
  })
}
