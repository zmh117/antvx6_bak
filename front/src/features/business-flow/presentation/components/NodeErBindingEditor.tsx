import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  BusinessFlowErRefType,
  BusinessFlowNodeErRef,
} from '@/entities/business-flow'
import { useGraphQuery } from '@/entities/er-graph/api'

export type ErGraphOption = { id: string; name: string }

const ER_REF_TYPES: BusinessFlowErRefType[] = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'CHECK',
]

type ErGraphLoadData = NonNullable<ReturnType<typeof useGraphQuery>['data']>
type ErColumnOption = { key: string; label: string }
type ErTableOption = { key: string; label: string; columns: ErColumnOption[] }

function buildErTableOptions(data: ErGraphLoadData | undefined): ErTableOption[] {
  if (!data) return []

  const columnsByTable = new Map<string, ErColumnOption[]>()
  for (const column of data.columns ?? []) {
    if (!column.table_key || !column.column_key) continue
    const columns = columnsByTable.get(column.table_key) ?? []
    columns.push({
      key: column.column_key,
      label: buildColumnLabel(column.column_key, column.business_name, column.data_type),
    })
    columnsByTable.set(column.table_key, columns)
  }

  const structuredTables = data.tables ?? []
  const tableSources = structuredTables.length
    ? structuredTables.map((table) => ({
        key: table.table_key,
        name: table.table_name ?? table.raw_data?.name,
        businessName: table.business_name ?? table.raw_data?.businessName,
        fields: table.raw_data?.fields ?? [],
      }))
    : (data.legacy_tables ?? []).map((table) => ({
        key: table.id,
        name: table.name,
        businessName: table.businessName,
        fields: table.fields ?? [],
      }))

  return tableSources
    .filter((table) => table.key)
    .map((table) => {
      const structuredColumns = columnsByTable.get(table.key) ?? []
      const rawColumns = table.fields.map((field) => ({
        key: field.name,
        label: buildColumnLabel(field.name, field.businessName, field.type),
      }))
      return {
        key: table.key,
        label: buildTableLabel(table.key, table.name, table.businessName),
        columns: dedupeErColumns(structuredColumns.length ? structuredColumns : rawColumns),
      }
    })
}

function dedupeErColumns(columns: ErColumnOption[]) {
  const seen = new Set<string>()
  return columns.filter((column) => {
    if (!column.key || seen.has(column.key)) return false
    seen.add(column.key)
    return true
  })
}

function buildTableLabel(key: string, name?: string | null, businessName?: string | null) {
  const title = businessName || name
  return title && title !== key ? `${key} - ${title}` : key
}

function buildColumnLabel(key: string, businessName?: string | null, dataType?: string | null) {
  const suffix = [businessName && businessName !== key ? businessName : null, dataType]
    .filter(Boolean)
    .join(' · ')
  return suffix ? `${key} - ${suffix}` : key
}

export function NodeErBindingEditor({
  erRefs,
  erGraphs,
  onChange,
}: {
  erRefs: BusinessFlowNodeErRef[]
  erGraphs: ErGraphOption[]
  onChange: (erRefs: BusinessFlowNodeErRef[]) => void
}) {
  const [draftDiagramId, setDraftDiagramId] = useState('')
  const [draftTableKey, setDraftTableKey] = useState('')
  const [draftColumnKey, setDraftColumnKey] = useState('')
  const [draftRefType, setDraftRefType] = useState<BusinessFlowErRefType>('READ')
  const selectedDiagramId = draftDiagramId || erGraphs[0]?.id || ''
  const erGraphQuery = useGraphQuery(selectedDiagramId, {
    enabled: Boolean(selectedDiagramId),
  })
  const erTableOptions = useMemo(
    () => buildErTableOptions(erGraphQuery.data),
    [erGraphQuery.data],
  )
  const selectedTable = erTableOptions.find(
    (table) => table.key === draftTableKey,
  )
  const selectedTableColumns = selectedTable?.columns ?? []
  const selectedColumn = selectedTableColumns.find(
    (column) => column.key === draftColumnKey,
  )

  const diagramName = (id: string) =>
    erGraphs.find((graph) => graph.id === id)?.name ?? id

  const addBinding = () => {
    const erDiagramId = selectedDiagramId
    if (!erDiagramId || !draftTableKey.trim()) return
    onChange([
      ...erRefs,
      {
        erDiagramId,
        erTableKey: draftTableKey.trim(),
        erColumnKey: draftColumnKey.trim() || null,
        refType: draftRefType,
        description: null,
      },
    ])
    setDraftTableKey('')
    setDraftColumnKey('')
    setDraftRefType('READ')
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="text-xs font-semibold">ER 绑定（步骤 → 字段）</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        声明该步骤读写的 ER 表/字段，供 Agent 生成用例时映射数据。
      </p>
      <div className="mt-3 space-y-2">
        {erRefs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground">
            暂无绑定。
          </div>
        ) : (
          erRefs.map((ref, index) => (
            <div
              key={ref.id ?? `${ref.erTableKey}.${ref.erColumnKey ?? ''}:${index}`}
              className="rounded-md border border-border p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {ref.erTableKey}
                  {ref.erColumnKey ? `.${ref.erColumnKey}` : ''}
                </span>
                <button
                  type="button"
                  className="text-[11px] text-destructive hover:underline"
                  onClick={() => onChange(erRefs.filter((_, i) => i !== index))}
                >
                  移除
                </button>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {diagramName(ref.erDiagramId)}
              </div>
              <select
                className="mt-2 h-7 w-full rounded border border-border bg-background px-1 text-xs"
                value={ref.refType}
                onChange={(event) =>
                  onChange(
                    erRefs.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            refType: event.target.value as BusinessFlowErRefType,
                          }
                        : item,
                    ),
                  )
                }
              >
                {ER_REF_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 space-y-2 rounded-md border border-border p-2">
        <select
          className="h-7 w-full rounded border border-border bg-background px-1 text-xs"
          value={selectedDiagramId}
          onChange={(event) => {
            setDraftDiagramId(event.target.value)
            setDraftTableKey('')
            setDraftColumnKey('')
          }}
        >
          {erGraphs.length === 0 ? (
            <option value="">（无可用 ER 图）</option>
          ) : (
            erGraphs.map((graph) => (
              <option key={graph.id} value={graph.id}>
                {graph.name}
              </option>
            ))
          )}
        </select>
        {erGraphQuery.isLoading ? (
          <div className="text-[11px] text-muted-foreground">
            正在加载表字段...
          </div>
        ) : null}
        {erGraphQuery.isError ? (
          <div className="text-[11px] text-destructive">
            表字段加载失败，可继续手动输入 key。
          </div>
        ) : null}
        <select
          className="h-7 w-full rounded border border-border bg-background px-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          value={selectedTable ? draftTableKey : ''}
          disabled={!selectedDiagramId || erGraphQuery.isLoading || erTableOptions.length === 0}
          onChange={(event) => {
            setDraftTableKey(event.target.value)
            setDraftColumnKey('')
          }}
        >
          <option value="">
            {erTableOptions.length === 0 ? '暂无可选 ER 表' : '选择 ER 表'}
          </option>
          {erTableOptions.map((table) => (
            <option key={table.key} value={table.key}>
              {table.label}
            </option>
          ))}
        </select>
        <Input
          placeholder={
            erTableOptions.length > 0
              ? '表 key（可手动修正）'
              : '表 key（必填）'
          }
          value={draftTableKey}
          onChange={(event) => {
            setDraftTableKey(event.target.value)
            setDraftColumnKey('')
          }}
        />
        <select
          className="h-7 w-full rounded border border-border bg-background px-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          value={selectedColumn ? draftColumnKey : ''}
          disabled={!draftTableKey.trim() || selectedTableColumns.length === 0}
          onChange={(event) => setDraftColumnKey(event.target.value)}
        >
          <option value="">
            {selectedTableColumns.length === 0
              ? '暂无可选字段'
              : '不绑定字段 / 选择字段'}
          </option>
          {selectedTableColumns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
        <Input
          placeholder={
            selectedTableColumns.length > 0
              ? '字段 key（可手动修正，可选）'
              : '字段 key（可选）'
          }
          value={draftColumnKey}
          onChange={(event) => setDraftColumnKey(event.target.value)}
        />
        <div className="flex gap-2">
          <select
            className="h-8 flex-1 rounded border border-border bg-background px-1 text-xs"
            value={draftRefType}
            onChange={(event) =>
              setDraftRefType(event.target.value as BusinessFlowErRefType)
            }
          >
            {ER_REF_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={erGraphs.length === 0 || !draftTableKey.trim()}
            onClick={addBinding}
          >
            添加
          </Button>
        </div>
      </div>
    </div>
  )
}
