import { useEffect, useMemo, useState } from 'react'
import { Database, RefreshCw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createDatabaseConnection,
  importDatabaseTables,
  listDatabaseConnections,
  previewDatabaseTables,
  testDatabaseConnection,
  updateDatabaseConnection,
  type DatabaseConnectionInfo,
  type DatabaseConnectionPayload,
  type DatabaseType,
  type ImportMode,
  type TablePreview,
} from '@/entities/er-graph/api'

type Props = {
  open: boolean
  graphId: string
  onClose: () => void
  onImported: (newVersion: number) => void
}

const DB_TYPE_LABEL: Record<DatabaseType, string> = {
  mysql: 'MySQL',
  oracle: 'Oracle',
  sqlserver: 'SQL Server',
}

const DEFAULT_PORT: Record<DatabaseType, number> = {
  mysql: 3306,
  oracle: 1521,
  sqlserver: 1433,
}

const emptyForm: DatabaseConnectionPayload = {
  name: '',
  db_type: 'mysql',
  host: 'localhost',
  port: 3306,
  database_name: '',
  schema_name: '',
  username: '',
  password: '',
  status: 'active',
}

function formFromConnection(conn: DatabaseConnectionInfo): DatabaseConnectionPayload {
  return {
    name: conn.name,
    db_type: conn.db_type,
    host: conn.host,
    port: conn.port,
    database_name: conn.database_name,
    schema_name: conn.schema_name ?? '',
    username: conn.username,
    password: '',
    status: conn.status === 'disabled' ? 'disabled' : 'active',
  }
}

function normalizeError(err: unknown) {
  if (err instanceof Error) return err.message
  return String(err)
}

export function DatabaseImportPanel({ open, graphId, onClose, onImported }: Props) {
  const [connections, setConnections] = useState<DatabaseConnectionInfo[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [form, setForm] = useState<DatabaseConnectionPayload>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tables, setTables] = useState<TablePreview[]>([])
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<ImportMode>('incremental')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setMessage(null)
    setLoading(true)
    listDatabaseConnections()
      .then((items) => {
        setConnections(items)
        const first = selectedConnectionId || items[0]?.id || ''
        setSelectedConnectionId(first)
        if (first) {
          const current = items.find((item) => item.id === first)
          if (current) {
            setEditingId(current.id)
            setForm(formFromConnection(current))
          }
        }
      })
      .catch((err) => setError(normalizeError(err)))
      .finally(() => setLoading(false))
  }, [open])

  const currentConnection = useMemo(
    () => connections.find((item) => item.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  )

  const visibleTables = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tables
    return tables.filter((table) => {
      return (
        table.table_name.toLowerCase().includes(q) ||
        (table.comment || '').toLowerCase().includes(q)
      )
    })
  }, [search, tables])

  const selectedCount = selectedTables.size
  const allVisibleSelected =
    visibleTables.length > 0 && visibleTables.every((table) => selectedTables.has(table.table_name))

  const reloadConnections = async (selectId?: string) => {
    const items = await listDatabaseConnections()
    setConnections(items)
    const nextId = selectId || selectedConnectionId || items[0]?.id || ''
    setSelectedConnectionId(nextId)
    const current = items.find((item) => item.id === nextId)
    if (current) {
      setEditingId(current.id)
      setForm(formFromConnection(current))
    }
  }

  const saveConnection = async () => {
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        schema_name: form.schema_name?.trim() || null,
        password: form.password?.trim() ? form.password : null,
      }
      const saved = editingId
        ? await updateDatabaseConnection(editingId, payload)
        : await createDatabaseConnection(payload)
      await reloadConnections(saved.id)
      setMessage('连接已保存')
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setLoading(false)
    }
  }

  const runTest = async () => {
    if (!selectedConnectionId) return
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      await testDatabaseConnection(selectedConnectionId)
      setMessage('连接测试通过')
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setLoading(false)
    }
  }

  const runPreview = async () => {
    if (!selectedConnectionId) return
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const next = await previewDatabaseTables(selectedConnectionId)
      setTables(next)
      setSelectedTables(new Set(next.map((table) => table.table_name)))
      setMessage(`读取到 ${next.length} 张表`)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setLoading(false)
    }
  }

  const runImport = async () => {
    if (!selectedConnectionId || selectedTables.size === 0) return
    if (
      mode === 'overwrite' &&
      !window.confirm('覆盖导入后，当前图只保留勾选表，未勾选表和现有关系会被删除。确认继续？')
    ) {
      return
    }
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const result = await importDatabaseTables({
        graphId,
        connectionId: selectedConnectionId,
        mode,
        selectedTables: Array.from(selectedTables),
      })
      setMessage(`导入完成，版本 ${result.new_version}`)
      onImported(result.new_version)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-background/55 p-4 backdrop-blur-sm">
      <section className="flex h-[calc(100vh-32px)] w-[min(1120px,96vw)] flex-col rounded-lg border border-border bg-card shadow-xl md:mt-2 md:h-[calc(100vh-48px)]">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="size-4" />
            <h2 className="text-sm font-semibold">数据库导入</h2>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-border p-4 md:border-b-0 md:border-r">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>选择连接</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedConnectionId}
                  onChange={(event) => {
                    const id = event.target.value
                    setSelectedConnectionId(id)
                    const conn = connections.find((item) => item.id === id)
                    if (conn) {
                      setEditingId(conn.id)
                      setForm(formFromConnection(conn))
                      setTables([])
                      setSelectedTables(new Set())
                    }
                  }}
                >
                  <option value="">新建连接</option>
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} · {DB_TYPE_LABEL[conn.db_type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(null)
                    setSelectedConnectionId('')
                    setForm(emptyForm)
                    setTables([])
                    setSelectedTables(new Set())
                  }}
                >
                  新建
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={runTest} disabled={!selectedConnectionId || loading}>
                  测试
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>类型</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.db_type}
                    onChange={(event) => {
                      const dbType = event.target.value as DatabaseType
                      setForm((prev) => ({ ...prev, db_type: dbType, port: DEFAULT_PORT[dbType] }))
                    }}
                  >
                    <option value="mysql">MySQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="sqlserver">SQL Server</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>端口</Label>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={(event) => setForm((prev) => ({ ...prev, port: Number(event.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>主机</Label>
                <Input value={form.host} onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>数据库</Label>
                  <Input value={form.database_name} onChange={(event) => setForm((prev) => ({ ...prev, database_name: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Schema</Label>
                  <Input value={form.schema_name ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, schema_name: event.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>用户名</Label>
                <Input value={form.username} onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>密码</Label>
                <Input
                  type="password"
                  value={form.password ?? ''}
                  placeholder={currentConnection?.has_password ? '留空表示不修改' : ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
              <Button type="button" className="w-full" onClick={saveConnection} disabled={loading}>
                <Save className="size-4" />
                保存连接
              </Button>
            </div>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden p-4">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={runPreview} disabled={!selectedConnectionId || loading}>
                <RefreshCw className="size-4" />
                读取表
              </Button>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={mode}
                onChange={(event) => setMode(event.target.value as ImportMode)}
              >
                <option value="incremental">增量</option>
                <option value="overwrite">覆盖</option>
              </select>
              <Input
                className="w-64"
                placeholder="搜索表名或注释"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectedTables(new Set([...selectedTables, ...visibleTables.map((table) => table.table_name)]))
                }
                disabled={!visibleTables.length}
              >
                全选
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const visible = new Set(visibleTables.map((table) => table.table_name))
                  setSelectedTables(new Set([...selectedTables].filter((name) => !visible.has(name))))
                }}
                disabled={!visibleTables.length}
              >
                全不选
              </Button>
              <div className="ml-auto text-xs text-muted-foreground">
                已选 {selectedCount} / {tables.length}
              </div>
            </div>

            {error ? <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
            {message ? <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{message}</div> : null}

            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr className="border-b border-border text-left">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedTables(new Set([...selectedTables, ...visibleTables.map((table) => table.table_name)]))
                          } else {
                            const visible = new Set(visibleTables.map((table) => table.table_name))
                            setSelectedTables(new Set([...selectedTables].filter((name) => !visible.has(name))))
                          }
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">表名</th>
                    <th className="px-3 py-2 font-medium">注释</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">字段数</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTables.map((table) => (
                    <tr key={table.table_name} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedTables.has(table.table_name)}
                          onChange={(event) => {
                            const next = new Set(selectedTables)
                            if (event.target.checked) next.add(table.table_name)
                            else next.delete(table.table_name)
                            setSelectedTables(next)
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{table.table_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{table.comment || '-'}</td>
                      <td className="px-3 py-2 text-right">{table.column_count}</td>
                    </tr>
                  ))}
                  {!visibleTables.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {loading ? '加载中' : '暂无表'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="sticky bottom-0 z-10 mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card pt-3">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="button" onClick={runImport} disabled={loading || !selectedConnectionId || selectedTables.size === 0}>
                导入选中表
              </Button>
            </footer>
          </main>
        </div>
      </section>
    </div>
  )
}
