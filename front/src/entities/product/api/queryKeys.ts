export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: () => [...productKeys.lists()] as const,
  members: (productId: string) => [...productKeys.all, productId, 'members'] as const,
}
