import { authHeaders } from '@/entities/auth'
import { API_BASE } from '@/shared/api/config'

export type ProductRole = 'owner' | 'editor' | 'viewer'

export type ProductMeta = {
  id: string
  code: string
  name: string
  description?: string | null
  status: string
  created_at: string
  updated_at: string
  current_user_role?: ProductRole | null
  er_graph_count: number
  business_flow_count: number
  swimlane_component_count: number
}

export type ProductMember = {
  user_id: string
  email: string
  display_name: string
  role: ProductRole
  created_at: string
  is_creator?: boolean
}

export type ProductCreateBody = {
  code: string
  name: string
  description?: string | null
}

export type ProductUpdateBody = {
  code?: string | null
  name?: string | null
  description?: string | null
  status?: string
}

export type ProductMemberUpsertBody = {
  email: string
  role: ProductRole
}

async function apiErrorMessage(res: Response) {
  const text = await res.text()
  try {
    const data = JSON.parse(text) as { detail?: unknown }
    if (typeof data.detail === 'string') return data.detail
  } catch {
    // keep raw text fallback
  }
  return text || `${res.status} ${res.statusText}`
}

export async function fetchProducts(): Promise<ProductMeta[]> {
  const res = await fetch(`${API_BASE}/api/products`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMeta[]>
}

export async function createProduct(body: ProductCreateBody): Promise<ProductMeta> {
  const res = await fetch(`${API_BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMeta>
}

export async function updateProduct(productId: string, body: ProductUpdateBody): Promise<ProductMeta> {
  const res = await fetch(`${API_BASE}/api/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMeta>
}

export async function archiveProduct(productId: string): Promise<ProductMeta> {
  const res = await fetch(`${API_BASE}/api/products/${productId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMeta>
}

export async function fetchProductMembers(productId: string): Promise<ProductMember[]> {
  const res = await fetch(`${API_BASE}/api/products/${productId}/members`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMember[]>
}

export async function upsertProductMember(
  productId: string,
  body: ProductMemberUpsertBody,
): Promise<ProductMember> {
  const res = await fetch(`${API_BASE}/api/products/${productId}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMember>
}

export async function removeProductMember(
  productId: string,
  userId: string,
): Promise<ProductMember> {
  const res = await fetch(`${API_BASE}/api/products/${productId}/members/${userId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<ProductMember>
}
