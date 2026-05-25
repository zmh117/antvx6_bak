import { API_BASE, DEFAULT_GRAPH_ID } from '@/shared/api/config'

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

export async function listBusinessFlows(graphId = DEFAULT_GRAPH_ID): Promise<BusinessFlowRecord[]> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows`)
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_key: flowKey, ...body }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<BusinessFlowRecord>
}
