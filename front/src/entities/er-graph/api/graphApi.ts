import {
  buildNormalizedSyncBody,
  type GraphOperationSource,
} from '@/entities/er-graph/lib/normalizeGraphPayload'
import type { RelationType, TableNodeData } from '@/entities/er-graph/model/erSchema'
import { API_BASE, DEFAULT_GRAPH_ID } from '@/shared/api/config'
import { authHeaders } from '@/entities/auth'
import type { Graph } from '@antv/x6'

export function getDefaultGraphId() {
  return DEFAULT_GRAPH_ID
}

export type ChangeLogEntry = {
  id: number
  graph_id: string
  change_type: string
  entity_type: string
  entity_key: string
  summary: string
  before_data?: Record<string, unknown> | null
  after_data?: Record<string, unknown> | null
  client_id?: string | null
  user_id?: string | null
  graph_version?: number | null
  created_at: string
}

export type HistoryResponse = {
  graph_id: string
  version: number
  entries: ChangeLogEntry[]
}

export type AgentContextResponse = {
  graph_id: string
  version: number
  text: string
  documents: Record<string, unknown>[]
}

export async function fetchGraphLoad(graphId = DEFAULT_GRAPH_ID) {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{
    graph: { version: number }
    snapshot: { nodes: unknown[]; edges: unknown[] }
    legacy_tables: TableNodeData[]
    tables?: Array<{
      table_key: string
      table_name?: string
      business_name?: string | null
      description?: string | null
      business_domain?: string | null
      table_type?: TableNodeData['tableType'] | null
      importance?: number | null
      tags?: string[] | null
      comment?: string | null
      x?: number | null
      y?: number | null
      raw_data?: TableNodeData
    }>
    relations?: Array<{
      relation_key?: string
      source_table_key: string
      source_column_key: string
      target_table_key: string
      target_column_key: string
      relation_type?: RelationType | null
      relation_name?: string | null
      description?: string | null
      relationship?: string | null
      verified?: boolean | null
      tags?: string[] | null
    }>
    columns?: Array<{
      table_key: string
      column_key: string
      business_name?: string | null
      description?: string | null
      comment?: string | null
      column_role?: string | null
      tags?: string[] | null
      data_type?: string | null
      default_value?: string | null
      enum_enabled?: boolean
    }>
    enums?: Array<{
      table_key: string
      column_key: string
      value: string
      label: string
      description?: string | null
      sort_order?: number
    }>
  }>
}

export async function fetchGraphHistory(
  graphId = DEFAULT_GRAPH_ID,
  limit = 100,
): Promise<HistoryResponse> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/history?limit=${limit}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<HistoryResponse>
}

export async function fetchAgentContext(
  graphId = DEFAULT_GRAPH_ID,
  query = '',
): Promise<AgentContextResponse> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/agent-context${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<AgentContextResponse>
}

export async function restoreGraphCheckpoint(
  changeLogId: number,
  graphId = DEFAULT_GRAPH_ID,
): Promise<{ ok: boolean; new_version: number; restored_from: number }> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ change_log_id: changeLogId }),
  })
  if (res.status === 409) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(`版本冲突: ${JSON.stringify(detail)}`)
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{
    ok: boolean
    new_version: number
    restored_from: number
  }>
}

async function postSyncCanvas(
  graphId: string,
  body: ReturnType<typeof buildNormalizedSyncBody>,
) {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/sync/canvas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      x6Json: body.x6Json,
      legacyTables: body.legacyTables,
      baseVersion: body.baseVersion,
      clientId: body.clientId,
      operationSource: body.operationSource,
    }),
  })
  return res
}

export async function syncGraphCanvas(
  graph: Graph,
  opts: {
    graphId?: string
    baseVersion?: number
    clientId?: string
    operationSource?: GraphOperationSource
  } = {},
) {
  const graphId = opts.graphId ?? DEFAULT_GRAPH_ID
  let baseVersion = opts.baseVersion

  for (let attempt = 0; attempt < 2; attempt++) {
    const body = buildNormalizedSyncBody(graph, {
      baseVersion,
      clientId: opts.clientId ?? 'web-client',
      operationSource: opts.operationSource ?? 'auto_save',
    })
    const res = await postSyncCanvas(graphId, body)
    if (res.status === 409 && attempt === 0) {
      const loaded = await fetchGraphLoad(graphId)
      baseVersion = loaded.graph.version
      continue
    }
    if (res.status === 409) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(`版本冲突: ${JSON.stringify(detail)}`)
    }
    if (!res.ok) {
      const text = await res.text()
      let detail = text
      try {
        const j = JSON.parse(text) as { detail?: unknown }
        if (j.detail) detail = JSON.stringify(j.detail)
      } catch {
        /* plain text */
      }
      throw new Error(`保存失败 (${res.status}): ${detail}`)
    }
    return res.json() as Promise<{ ok: boolean; new_version: number; warnings?: string[] }>
  }
  throw new Error('保存失败：版本冲突重试后仍失败')
}
