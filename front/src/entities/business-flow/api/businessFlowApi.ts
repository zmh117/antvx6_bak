import { authHeaders } from '@/entities/auth'
import { API_BASE, DEFAULT_GRAPH_ID, DEFAULT_PRODUCT_ID } from '@/shared/api/config'

export type BusinessFlowBinding = {
  binding_key: string
  step_key: string
  table_key?: string | null
  column_key?: string | null
  relation_key?: string | null
  usage_type?: string
  description?: string | null
}

export type BusinessFlowRecord = {
  graph_id: string
  flow_key: string
  name: string
  description?: string | null
  nodes: unknown[]
  edges: unknown[]
  bindings: BusinessFlowBinding[]
  version: number
}

export type BusinessFlowMeta = {
  id: string
  product_id: string
  product_code?: string | null
  product_name?: string | null
  code: string
  name: string
  description?: string | null
  status: BusinessFlowMetaStatus
  current_version: number
  updated_at?: string | null
  lane_instance_count: number
  node_count: number
  edge_count: number
  current_user_role?: BusinessFlowRole | null
}

export type BusinessFlowMetaStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type BusinessFlowRole = 'owner' | 'editor' | 'viewer'

export type BusinessFlowMember = {
  user_id: string
  email: string
  display_name: string
  role: BusinessFlowRole
  created_at: string
  is_creator?: boolean
}

export type BusinessFlowMemberUpsertBody = {
  email: string
  role: BusinessFlowRole
}

export type CreateBusinessFlowBody = {
  code: string
  name: string
  description?: string | null
  product_id?: string | null
}

export type UpdateBusinessFlowBody = {
  name?: string | null
  description?: string | null
  status?: BusinessFlowMetaStatus
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

export async function listBusinessFlows(graphId = DEFAULT_GRAPH_ID): Promise<BusinessFlowRecord[]> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { flows: BusinessFlowRecord[] }
  return data.flows
}

export async function saveBusinessFlow(
  graphId: string,
  flowKey: string,
  body: Omit<BusinessFlowRecord, 'graph_id' | 'flow_key' | 'version'>,
): Promise<BusinessFlowRecord> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows/${flowKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ flow_key: flowKey, ...body }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<BusinessFlowRecord>
}

export async function listBusinessFlowMetas(
  productId?: string | null,
): Promise<BusinessFlowMeta[]> {
  const params = new URLSearchParams()
  if (productId && productId !== 'all') params.set('product_id', productId)
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/api/business-flows${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta[]>
}

export async function createBusinessFlow(
  body: CreateBusinessFlowBody,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ product_id: body.product_id ?? DEFAULT_PRODUCT_ID, ...body }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function updateBusinessFlow(
  businessFlowId: string,
  body: UpdateBusinessFlowBody,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function archiveBusinessFlow(
  businessFlowId: string,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function fetchBusinessFlowMembers(
  businessFlowId: string,
): Promise<BusinessFlowMember[]> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const message = await apiErrorMessage(res)
    if (res.status === 404) {
      throw new Error(`业务图成员接口不可用或业务图不存在：${message}`)
    }
    throw new Error(message)
  }
  return res.json() as Promise<BusinessFlowMember[]>
}

export async function upsertBusinessFlowMember(
  businessFlowId: string,
  body: BusinessFlowMemberUpsertBody,
): Promise<BusinessFlowMember> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMember>
}

export async function removeBusinessFlowMember(
  businessFlowId: string,
  userId: string,
): Promise<BusinessFlowMember> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members/${userId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMember>
}
