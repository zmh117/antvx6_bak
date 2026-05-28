/** 字段关联指向的目标表列（画布上一条端口连线，如 a.id = b.user_id） */
export interface RelationRef {
  table: string
  field: string
  relationship?: RelationshipType
  relationKey?: string
  relationType?: RelationType
  relationName?: string
  description?: string
  verified?: boolean
  tags?: string[]
}

/** @deprecated 使用 RelationRef */
export type ForeignKeyRef = RelationRef

/** 字段枚举字典的一项：存库值 → 业务标签 / 说明（非 ER 表节点） */
export interface FieldEnumEntry {
  value: string
  label: string
  description?: string
  sortOrder?: number
}

export type TableType =
  | 'business'
  | 'relation'
  | 'log'
  | 'dict'
  | 'config'
  | 'snapshot'
  | 'archive'
  | 'temp'
  | 'unknown'

/**
 * 字段语义角色（供 Agent / 检索）。
 * query_link：有逻辑连线、用于跨表查询关联，不是物理外键。
 */
export type ColumnRole =
  | 'id'
  | 'query_link'
  | 'status'
  | 'enum'
  | 'amount'
  | 'time'
  | 'name'
  | 'content'
  | 'flag'
  | 'type'
  | 'audit'
  | 'unknown'

export type RelationshipType = '1:1' | '1:N' | 'N:N'

export type RelationType =
  | 'logical_relation'
  | 'foreign_key'
  | 'business_relation'
  | 'lookup_relation'
  | 'derived_relation'
  | 'same_meaning'
  | 'unknown'

export const TABLE_TYPE_OPTIONS: Array<{ value: TableType; label: string }> = [
  { value: 'business', label: '业务表' },
  { value: 'relation', label: '关系表' },
  { value: 'log', label: '日志表' },
  { value: 'dict', label: '字典表' },
  { value: 'config', label: '配置表' },
  { value: 'snapshot', label: '快照表' },
  { value: 'archive', label: '归档表' },
  { value: 'temp', label: '临时表' },
  { value: 'unknown', label: '未知' },
]

export const COLUMN_ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: 'id', label: '标识' },
  { value: 'query_link', label: '查询关联' },
  { value: 'status', label: '状态' },
  { value: 'enum', label: '枚举' },
  { value: 'amount', label: '金额' },
  { value: 'time', label: '时间' },
  { value: 'name', label: '名称' },
  { value: 'content', label: '内容' },
  { value: 'flag', label: '标志' },
  { value: 'type', label: '类型' },
  { value: 'audit', label: '审计' },
  { value: 'unknown', label: '未知' },
]

export const RELATION_TYPE_OPTIONS: Array<{ value: RelationType; label: string }> = [
  { value: 'logical_relation', label: '逻辑关系' },
  { value: 'foreign_key', label: '外键关系' },
  { value: 'business_relation', label: '业务关系' },
  { value: 'lookup_relation', label: '查询关系' },
  { value: 'derived_relation', label: '派生关系' },
  { value: 'same_meaning', label: '同义关系' },
  { value: 'unknown', label: '未知' },
]

export const RELATIONSHIP_OPTIONS: Array<{ value: RelationshipType; label: string }> = [
  { value: '1:1', label: '1:1' },
  { value: '1:N', label: '1:N' },
  { value: 'N:N', label: 'N:N' },
]

export interface TableField {
  name: string
  type: string
  businessName?: string
  description?: string
  columnRole?: ColumnRole
  tags?: string[]
  /** 注释，画布上可作 tooltip / 简略展示（按需扩展更多列属性时用同一套：先改此处再改 ERTableNode） */
  comment?: string
  /**
   * 枚举值语义映射，如 posts.status：0=待支付。
   * 仅在侧栏维护，不画成独立表节点。
   */
  enumValues?: FieldEnumEntry[]
  keyType?: 'primary' | 'relation' | 'unique'
  /**
   * 关联指向：单目标或多列组合（多条边可共用同一源字段右端口）。
   * relationship 表示与该目标列之间的基数（连线上显示/点击切换，默认 1:1）。
   */
  ref?: RelationRef | RelationRef[]
  defaultValue?: string
}

/** 将 JSON 中的 ref 规范为数组，便于遍历 */
export function normalizeFieldRefs(ref: TableField['ref']): RelationRef[] {
  if (!ref) return []
  return Array.isArray(ref) ? ref : [ref]
}

export interface TableNodeData {
  id: string
  name: string
  fields: TableField[]
  businessName?: string
  description?: string
  businessDomain?: string
  tableType?: TableType
  importance?: number
  tags?: string[]
  comment?: string
  typicalQuestions?: string[]
  /** 画布上表节点左上角；有则加载时用此坐标，否则按网格排版 */
  layout?: { x: number; y: number }
}

export interface RelationshipData {
  type: RelationshipType
}

/** 连线业务语义（权威来源：edges / er_relation，field.ref 仅作展示回填） */
export interface RelationBusinessData extends RelationshipData {
  relationKey?: string
  relationType?: RelationType
  relationship?: RelationshipType
  sourceTable?: string
  sourceColumn?: string
  targetTable?: string
  targetColumn?: string
  joinCondition?: string
  relationName?: string
  description?: string
  confidence?: number
  source?: 'manual' | 'sql_analysis' | 'code_analysis' | 'name_rule' | 'data_profiling' | 'imported'
  verified?: boolean
  tags?: string[]
}

/** 画布快照：与 X6 graph.toJSON() 解耦后的 nodes/edges */
export interface CanvasSnapshot {
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
}

/** 侧栏当前编辑的字段定位 */
export interface FieldSelection {
  tableId: string
  fieldName: string
}

export interface TableSelection {
  tableId: string
}

export interface RelationSelection {
  edgeId: string
}

/** 兼容旧 column_role: foreign_ref → query_link */
export function normalizeColumnRole(role?: string | null): ColumnRole | undefined {
  if (!role) return undefined
  if (role === 'foreign_ref') return 'query_link'
  const allowed: ColumnRole[] = [
    'id',
    'query_link',
    'status',
    'enum',
    'amount',
    'time',
    'name',
    'content',
    'flag',
    'type',
    'audit',
    'unknown',
  ]
  return allowed.includes(role as ColumnRole) ? (role as ColumnRole) : 'unknown'
}

/** 兼容旧 JSON 中的 keyType: "foreign" 与 column_role: "foreign_ref" */
export function normalizeTableField(field: TableField): TableField {
  let next = field
  const keyType =
    (field.keyType as string) === 'foreign' ? 'relation' : field.keyType
  if (keyType !== field.keyType) {
    next = { ...next, keyType }
  }
  const columnRole = normalizeColumnRole(next.columnRole)
  if (columnRole !== next.columnRole) {
    next = { ...next, columnRole }
  }
  return next
}

export function normalizeErTables(tables: TableNodeData[]): TableNodeData[] {
  return tables.map((table) => ({
    ...table,
    fields: table.fields.map(normalizeTableField),
  }))
}

export function fieldQualifiedName(tableId: string, fieldName: string): string {
  return `${tableId}.${fieldName}`
}

export function fieldHasEnum(field: TableField): boolean {
  return Array.isArray(field.enumValues) && field.enumValues.length > 0
}

export function emptyEnumEntry(): FieldEnumEntry {
  return { value: '', label: '', description: '' }
}

/** 💬 悬浮文案：仅有 defaultValue / comment / enumValues 时才返回内容 */
export function fieldMetaTooltip(field: TableField): string | undefined {
  const lines: string[] = []

  if (field.defaultValue !== undefined && field.defaultValue !== '') {
    lines.push(`默认值：${field.defaultValue}`)
  }
  if (field.comment) {
    lines.push(`注释：${field.comment}`)
  }
  if (fieldHasEnum(field)) {
    for (const e of field.enumValues!) {
      const desc = e.description ? `（${e.description}）` : ''
      lines.push(`${e.value} = ${e.label}${desc}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : undefined
}

export function fieldHasMetaForTooltip(field: TableField): boolean {
  return fieldMetaTooltip(field) != null
}

export function fieldHasRelation(field: TableField): boolean {
  return field.keyType === 'relation' || normalizeFieldRefs(field.ref).length > 0
}
