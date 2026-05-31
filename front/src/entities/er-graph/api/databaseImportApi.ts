import { authHeaders } from '@/entities/auth'
import { API_BASE, DEFAULT_GRAPH_ID } from '@/shared/api/config'

export type DatabaseType = 'mysql' | 'oracle' | 'sqlserver'
export type ImportMode = 'overwrite' | 'incremental'

export type DatabaseConnectionInfo = {
  id: string
  connection_key: string
  name: string
  db_type: DatabaseType
  host: string
  port: number
  database_name: string
  schema_name?: string | null
  username: string
  status: string
  has_password: boolean
}

export type DatabaseConnectionPayload = {
  name: string
  db_type: DatabaseType
  host: string
  port: number
  database_name: string
  schema_name?: string | null
  username: string
  password?: string | null
  status?: 'active' | 'disabled'
}

export type TablePreview = {
  table_name: string
  comment?: string | null
  column_count: number
}

async function parseOrThrow(res: Response) {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status}`)
  }
  return res.json()
}

export async function listDatabaseConnections(): Promise<DatabaseConnectionInfo[]> {
  const res = await fetch(`${API_BASE}/api/database-connections`, {
    headers: { ...authHeaders() },
  })
  return parseOrThrow(res) as Promise<DatabaseConnectionInfo[]>
}

export async function createDatabaseConnection(
  payload: DatabaseConnectionPayload,
): Promise<DatabaseConnectionInfo> {
  const res = await fetch(`${API_BASE}/api/database-connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...payload, status: payload.status ?? 'active' }),
  })
  return parseOrThrow(res) as Promise<DatabaseConnectionInfo>
}

export async function updateDatabaseConnection(
  connectionId: string,
  payload: DatabaseConnectionPayload,
): Promise<DatabaseConnectionInfo> {
  const res = await fetch(`${API_BASE}/api/database-connections/${connectionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...payload, status: payload.status ?? 'active' }),
  })
  return parseOrThrow(res) as Promise<DatabaseConnectionInfo>
}

export async function testDatabaseConnection(connectionId: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/database-connections/${connectionId}/test`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return parseOrThrow(res) as Promise<{ ok: boolean; message: string }>
}

export async function previewDatabaseTables(connectionId: string): Promise<TablePreview[]> {
  const res = await fetch(`${API_BASE}/api/database-connections/${connectionId}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ refresh: true }),
  })
  const data = (await parseOrThrow(res)) as { tables: TablePreview[] }
  return data.tables
}

export async function importDatabaseTables(opts: {
  graphId?: string
  connectionId: string
  mode: ImportMode
  selectedTables: string[]
}): Promise<{ ok: boolean; graph_id: string; new_version: number; warnings?: string[] }> {
  const graphId = opts.graphId ?? DEFAULT_GRAPH_ID
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/import/database`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      connection_id: opts.connectionId,
      mode: opts.mode,
      selected_tables: opts.selectedTables,
    }),
  })
  return parseOrThrow(res) as Promise<{
    ok: boolean
    graph_id: string
    new_version: number
    warnings?: string[]
  }>
}
