import * as Y from 'yjs'

const FIELD_SEP = '::'

function fieldKey(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function fieldPortId(name, side) {
  return `fld-${side}-${fieldKey(name)}`
}

function tableHeight(fieldCount) {
  return 48 + Math.max(1, fieldCount) * 32
}

function asObject(value) {
  if (!value) return {}
  if (value instanceof Y.Map) return Object.fromEntries(value.entries())
  return typeof value === 'object' ? { ...value } : {}
}

function setMapObject(rootMap, key, value) {
  const child = new Y.Map()
  Object.entries(value).forEach(([k, v]) => {
    if (v !== undefined) child.set(k, v)
  })
  rootMap.set(key, child)
}

function clearYMap(map) {
  Array.from(map.keys()).forEach((key) => map.delete(key))
}

export function isDocEmpty(doc) {
  return doc.getMap('tables').size === 0
}

export function seedDocFromRows(doc, rows) {
  const tables = doc.getMap('tables')
  const columns = doc.getMap('columns')
  const enums = doc.getMap('enums')
  const relations = doc.getMap('relations')
  const layout = doc.getMap('layout')
  const meta = doc.getMap('meta')

  doc.transact(() => {
    clearYMap(tables)
    clearYMap(columns)
    clearYMap(enums)
    clearYMap(relations)
    clearYMap(layout)
    meta.set('schemaVersion', 1)
    meta.set('graphId', rows.graphId)
    meta.set('updatedAt', new Date().toISOString())

    for (const table of rows.tables) {
      setMapObject(tables, table.table_key, {
        id: table.table_key,
        name: table.table_name || table.table_key,
        businessName: table.business_name || undefined,
        description: table.description || undefined,
        businessDomain: table.business_domain || undefined,
        tableType: table.table_type || 'business',
        importance: table.importance ?? 3,
        tags: table.tags || [],
        comment: table.comment || undefined,
      })
      setMapObject(layout, table.table_key, {
        x: Number(table.x ?? table.raw_data?.layout?.x ?? 0),
        y: Number(table.y ?? table.raw_data?.layout?.y ?? 0),
        width: Number(table.width ?? 260),
        height: Number(table.height ?? tableHeight(table.raw_data?.fields?.length ?? 1)),
      })
    }

    for (const column of rows.columns) {
      setMapObject(columns, `${column.table_key}${FIELD_SEP}${column.column_key}`, {
        tableKey: column.table_key,
        name: column.column_key,
        type: column.data_type || column.raw_data?.type || '',
        businessName: column.business_name || undefined,
        description: column.description || undefined,
        comment: column.comment || undefined,
        defaultValue: column.default_value || undefined,
        keyType: column.key_type || column.raw_data?.keyType || undefined,
        columnRole: column.column_role || undefined,
        tags: column.tags || [],
        sortOrder: column.sort_order ?? 0,
      })
    }

    for (const enumValue of rows.enums) {
      setMapObject(
        enums,
        `${enumValue.table_key}${FIELD_SEP}${enumValue.column_key}${FIELD_SEP}${enumValue.value}`,
        {
          tableKey: enumValue.table_key,
          columnKey: enumValue.column_key,
          value: enumValue.value,
          label: enumValue.label || enumValue.value,
          description: enumValue.description || undefined,
          sortOrder: enumValue.sort_order ?? 0,
        },
      )
    }

    for (const relation of rows.relations) {
      setMapObject(relations, relation.relation_key, {
        relationKey: relation.relation_key,
        sourceTable: relation.source_table_key,
        sourceColumn: relation.source_column_key,
        targetTable: relation.target_table_key,
        targetColumn: relation.target_column_key,
        relationType: relation.relation_type || 'logical_relation',
        relationship: relation.relationship || '1:1',
        type: relation.relationship || '1:1',
        relationName: relation.relation_name || undefined,
        description: relation.description || undefined,
        joinCondition: relation.join_condition || undefined,
        confidence: relation.confidence ?? 1,
        source: relation.source || 'manual',
        verified: Boolean(relation.verified),
        tags: relation.tags || [],
      })
    }
  }, 'seed')
}

export function projectionFromDoc(doc) {
  const tablesMap = doc.getMap('tables')
  const columnsMap = doc.getMap('columns')
  const enumsMap = doc.getMap('enums')
  const relationsMap = doc.getMap('relations')
  const layoutMap = doc.getMap('layout')

  const fieldsByTable = new Map()
  for (const value of columnsMap.values()) {
    const column = asObject(value)
    const tableKey = String(column.tableKey || '')
    if (!tableKey) continue
    const field = {
      name: String(column.name || column.columnKey || ''),
      type: String(column.type || ''),
      businessName: column.businessName,
      description: column.description,
      comment: column.comment,
      defaultValue: column.defaultValue,
      keyType: column.keyType,
      columnRole: column.columnRole,
      tags: Array.isArray(column.tags) ? column.tags : [],
      sortOrder: Number(column.sortOrder || 0),
    }
    if (!fieldsByTable.has(tableKey)) fieldsByTable.set(tableKey, [])
    fieldsByTable.get(tableKey).push(field)
  }

  for (const value of enumsMap.values()) {
    const enumValue = asObject(value)
    const tableKey = String(enumValue.tableKey || '')
    const columnKey = String(enumValue.columnKey || '')
    const fields = fieldsByTable.get(tableKey)
    const field = fields?.find((item) => item.name === columnKey)
    if (!field) continue
    field.enumValues ||= []
    field.enumValues.push({
      value: String(enumValue.value || ''),
      label: String(enumValue.label || enumValue.value || ''),
      description: enumValue.description,
      sortOrder: Number(enumValue.sortOrder || 0),
    })
  }

  const relationRefsByField = new Map()
  const relations = []
  for (const value of relationsMap.values()) {
    const rel = asObject(value)
    if (!rel.sourceTable || !rel.sourceColumn || !rel.targetTable || !rel.targetColumn) continue
    const relationKey =
      rel.relationKey ||
      `${rel.sourceTable}.${rel.sourceColumn}__${rel.targetTable}.${rel.targetColumn}`
    const relationship = rel.relationship || rel.type || '1:1'
    const normalized = { ...rel, relationKey, relationship, type: relationship }
    relations.push(normalized)
    const key = `${rel.sourceTable}${FIELD_SEP}${rel.sourceColumn}`
    const refs = relationRefsByField.get(key) || []
    refs.push({
      table: rel.targetTable,
      field: rel.targetColumn,
      relationship,
      relationKey,
      relationType: rel.relationType,
      relationName: rel.relationName,
      description: rel.description,
      verified: rel.verified,
      tags: rel.tags,
    })
    relationRefsByField.set(key, refs)
  }

  const tables = []
  for (const [tableKey, value] of tablesMap.entries()) {
    const table = asObject(value)
    const fields = (fieldsByTable.get(tableKey) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ sortOrder: _sortOrder, ...field }) => {
        const refs = relationRefsByField.get(`${tableKey}${FIELD_SEP}${field.name}`)
        if (refs?.length) {
          field.keyType = 'relation'
          field.ref = refs.length === 1 ? refs[0] : refs
        }
        field.enumValues?.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        return field
      })
    const pos = asObject(layoutMap.get(tableKey))
    tables.push({
      id: String(table.id || tableKey),
      name: String(table.name || tableKey),
      fields,
      businessName: table.businessName,
      description: table.description,
      businessDomain: table.businessDomain,
      tableType: table.tableType,
      importance: table.importance,
      tags: Array.isArray(table.tags) ? table.tags : [],
      comment: table.comment,
      layout: {
        x: Number(pos.x || 0),
        y: Number(pos.y || 0),
      },
    })
  }

  tables.sort((a, b) => a.id.localeCompare(b.id))
  const nodes = tables.map((table, index) => {
    const pos = asObject(layoutMap.get(table.id))
    const height = Number(pos.height || tableHeight(table.fields.length))
    return {
      id: table.id,
      shape: 'er-table',
      x: Number.isFinite(Number(pos.x)) ? Number(pos.x) : (index % 2) * 360,
      y: Number.isFinite(Number(pos.y)) ? Number(pos.y) : Math.floor(index / 2) * 260,
      width: Number(pos.width || 260),
      height,
      data: table,
    }
  })
  const edges = relations.map((rel) => ({
    id: rel.relationKey,
    shape: 'er-relationship',
    source: { cell: rel.sourceTable, port: fieldPortId(rel.sourceColumn, 'R') },
    target: { cell: rel.targetTable, port: fieldPortId(rel.targetColumn, 'L') },
    data: rel,
  }))
  return { legacyTables: tables, x6Json: { nodes, edges } }
}
