import {
  normalizeErTables,
  normalizeFieldRefs,
  type FieldEnumEntry,
  type RelationRef,
  type TableNodeData,
} from '@/entities/er-graph/model/erSchema'

type TableRow = {
  table_key: string
  table_name?: string
  x?: number | null
  y?: number | null
  raw_data?: TableNodeData
}

function isValidTableId(id: string) {
  return Boolean(id) && !id.includes('__')
}

function isLegacyTable(t: TableNodeData) {
  return isValidTableId(t.id) && Array.isArray(t.fields)
}

function countRelationRefs(table: TableNodeData) {
  return (table.fields ?? []).reduce(
    (n, f) => n + normalizeFieldRefs(f.ref).length,
    0,
  )
}

export type RelationRow = {
  source_table_key: string
  source_column_key: string
  target_table_key: string
  target_column_key: string
  relationship?: string | null
}

export type ColumnRow = {
  table_key: string
  column_key: string
  comment?: string | null
  data_type?: string | null
  default_value?: string | null
  enum_enabled?: boolean
}

export type EnumRow = {
  table_key: string
  column_key: string
  value: string
  label: string
  description?: string | null
  sort_order?: number
}

/** 用结构化 columns / enums 覆盖字段注释与枚举（刷新后侧栏与库一致） */
export function applyColumnsAndEnumsToTables(
  tables: TableNodeData[],
  columns?: ColumnRow[],
  enums?: EnumRow[],
): TableNodeData[] {
  const enumByCol = new Map<string, FieldEnumEntry[]>()
  for (const e of enums ?? []) {
    const key = `${e.table_key}::${e.column_key}`
    const list = enumByCol.get(key) ?? []
    list.push({
      value: e.value,
      label: e.label,
      description: e.description ?? undefined,
    })
    enumByCol.set(key, list)
  }
  for (const [key, list] of enumByCol.entries()) {
    const order = new Map(
      (enums ?? [])
        .filter((e) => `${e.table_key}::${e.column_key}` === key)
        .map((e, i) => [`${e.value}`, e.sort_order ?? i]),
    )
    list.sort(
      (a, b) =>
        (order.get(a.value) ?? 0) - (order.get(b.value) ?? 0) ||
        a.value.localeCompare(b.value),
    )
  }

  const colByKey = new Map<string, ColumnRow>()
  for (const c of columns ?? []) {
    colByKey.set(`${c.table_key}::${c.column_key}`, c)
  }

  return tables.map((table) => ({
    ...table,
    fields: (table.fields ?? []).map((field) => {
      const key = `${table.id}::${field.name}`
      const col = colByKey.get(key)
      const next = { ...field }
      if (col) {
        if (col.comment != null && String(col.comment).trim() !== '') {
          next.comment = col.comment
        } else if (col.comment != null) {
          delete next.comment
        }
        if (col.data_type) next.type = col.data_type
        if (col.default_value != null) next.defaultValue = col.default_value
        const evs = enumByCol.get(key)
        if (evs?.length) {
          next.enumValues = evs.map((e) => ({ ...e }))
        } else if (col.enum_enabled === false) {
          delete next.enumValues
        }
      }
      return next
    }),
  }))
}

/** 以 er_relation 为准回填 field.ref（加载时比 legacy/raw_data 更可靠） */
export function applyRelationsToTables(
  tables: TableNodeData[],
  relations: RelationRow[],
): TableNodeData[] {
  const byId = new Map(tables.map((t) => [t.id, structuredClone(t)]))

  for (const table of byId.values()) {
    for (const field of table.fields ?? []) {
      delete field.ref
      if (field.keyType === 'relation' || (field.keyType as string) === 'foreign') {
        delete field.keyType
      }
    }
  }

  for (const r of relations) {
    const table = byId.get(r.source_table_key)
    if (!table) continue
    const field = table.fields?.find((f) => f.name === r.source_column_key)
    if (!field) continue
    const entry: RelationRef = {
      table: r.target_table_key,
      field: r.target_column_key,
      relationship: (r.relationship as RelationRef['relationship']) || '1:1',
    }
    field.keyType = 'relation'
    const existing = normalizeFieldRefs(field.ref)
    const dup = existing.some(
      (e) => e.table === entry.table && e.field === entry.field,
    )
    if (!dup) {
      field.ref = existing.length === 0 ? entry : [...existing, entry]
    }
  }

  return [...byId.values()]
}

/** 从 API 响应合并 legacy_tables 与结构化 raw_data，避免 profiles 等表丢失 */
export function resolveTablesFromLoad(loaded: {
  legacy_tables?: TableNodeData[]
  tables?: TableRow[]
  relations?: RelationRow[]
  columns?: ColumnRow[]
  enums?: EnumRow[]
}): TableNodeData[] {
  const byId = new Map<string, TableNodeData>()

  for (const t of loaded.legacy_tables ?? []) {
    if (isLegacyTable(t)) byId.set(t.id, t)
  }

  for (const row of loaded.tables ?? []) {
    if (!isValidTableId(row.table_key)) continue
    const raw = row.raw_data
    if (!raw?.fields?.length) continue
    const merged: TableNodeData = {
      ...raw,
      id: row.table_key,
      name: raw.name || row.table_name || row.table_key,
      fields: raw.fields,
      layout:
        raw.layout ??
        (row.x != null && row.y != null ? { x: Number(row.x), y: Number(row.y) } : undefined),
    }
    const prev = byId.get(row.table_key)
    if (!prev) {
      byId.set(row.table_key, merged)
      continue
    }
    const mergedRefs = countRelationRefs(merged)
    const prevRefs = countRelationRefs(prev)
    const mergedFieldCount = merged.fields?.length ?? 0
    const prevFieldCount = prev.fields?.length ?? 0
    if (
      mergedRefs > prevRefs ||
      (mergedRefs === prevRefs && mergedFieldCount > prevFieldCount)
    ) {
      byId.set(row.table_key, merged)
    } else if (mergedRefs === prevRefs && mergedFieldCount === prevFieldCount) {
      // 字段数相同：保留 prev 的布局/业务字段，单字段元数据由 columns/enums 覆盖
      byId.set(row.table_key, prev)
    }
  }

  let tables = normalizeErTables([...byId.values()])
  tables = applyColumnsAndEnumsToTables(tables, loaded.columns, loaded.enums)
  if (loaded.relations?.length) {
    tables = applyRelationsToTables(tables, loaded.relations)
  }
  return normalizeErTables(tables)
}
