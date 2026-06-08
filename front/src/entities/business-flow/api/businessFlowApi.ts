import { API_BASE, DEFAULT_GRAPH_ID } from '@/shared/api/config'
import { authHeaders } from '@/entities/auth'
import type {
  BusinessFlowBinding,
  BusinessFlowRecord,
  BusinessFlowSaveBody,
} from '../model/businessFlowSchema'

export type { BusinessFlowBinding, BusinessFlowRecord, BusinessFlowSaveBody }

export async function listBusinessFlows(graphId = DEFAULT_GRAPH_ID): Promise<BusinessFlowRecord[]> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { flows: BusinessFlowRecord[] }
  return data.flows
}

export async function fetchBusinessFlow(
  graphId: string,
  flowKey: string,
): Promise<BusinessFlowRecord> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows/${flowKey}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<BusinessFlowRecord>
}

export async function saveBusinessFlow(
  graphId: string,
  flowKey: string,
  body: BusinessFlowSaveBody,
): Promise<BusinessFlowRecord> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows/${flowKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ flow_key: flowKey, ...body }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<BusinessFlowRecord>
}
