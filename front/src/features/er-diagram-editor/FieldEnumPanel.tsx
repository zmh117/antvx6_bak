import { Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  COLUMN_ROLE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RELATION_TYPE_OPTIONS,
  TABLE_TYPE_OPTIONS,
  emptyEnumEntry,
  fieldQualifiedName,
  type ColumnRole,
  type FieldEnumEntry,
  type RelationBusinessData,
  type RelationType,
  type RelationshipType,
  type TableField,
  type TableNodeData,
  type TableType,
} from '@/entities/er-graph/model/erSchema'

export type FieldBusinessPatch = {
  businessName?: string
  description?: string
  comment?: string
  columnRole?: ColumnRole
  tags?: string[]
  enumValues?: FieldEnumEntry[] | undefined
}

export type TableBusinessPatch = {
  businessName?: string
  description?: string
  businessDomain?: string
  tableType?: TableType
  importance?: number
  tags?: string[]
  comment?: string
}

export type RelationBusinessPatch = {
  relationName?: string
  description?: string
  relationType?: RelationType
  relationship?: RelationshipType
  verified?: boolean
  tags?: string[]
}

export interface FieldEnumPanelProps {
  tableId: string
  tableName: string
  field: TableField
  onChange: (patch: FieldBusinessPatch) => void
  onClose: () => void
}

export interface TableBusinessPanelProps {
  table: TableNodeData
  onChange: (patch: TableBusinessPatch) => void
  onClose: () => void
}

export interface RelationBusinessPanelProps {
  relation: RelationBusinessData
  onChange: (patch: RelationBusinessPatch) => void
  onClose: () => void
}

type Option<T extends string> = { value: T; label: string }

const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function normalizeTagsInput(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of text.split(/[,\n，、]+/)) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

function joinTags(tags?: string[]) {
  return (tags ?? []).join(', ')
}

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalTags(value: string) {
  return normalizeTagsInput(value)
}

function optionalEnumValues(entries: FieldEnumEntry[]) {
  const normalized = entries.map((entry, index) => ({
    value: entry.value,
    label: entry.label,
    description: optionalText(entry.description ?? ''),
    sortOrder: Number.isFinite(entry.sortOrder) ? entry.sortOrder : index,
  }))
  return normalized.length > 0 ? normalized : undefined
}

function fieldDraftFrom(field: TableField) {
  return {
    businessName: field.businessName ?? '',
    description: field.description ?? '',
    comment: field.comment ?? '',
    columnRole: field.columnRole ?? '',
    tagsText: joinTags(field.tags),
    enumValues: field.enumValues ? field.enumValues.map((e) => ({ ...e })) : [],
  }
}

function tableDraftFrom(table: TableNodeData) {
  return {
    businessName: table.businessName ?? '',
    description: table.description ?? '',
    businessDomain: table.businessDomain ?? '',
    tableType: table.tableType ?? 'business',
    importance: String(table.importance ?? 3),
    tagsText: joinTags(table.tags),
    comment: table.comment ?? '',
  }
}

function relationDraftFrom(relation: RelationBusinessData) {
  const relationship = relation.relationship || relation.type || '1:1'
  return {
    relationName: relation.relationName ?? '',
    description: relation.description ?? '',
    relationType: relation.relationType ?? 'logical_relation',
    relationship,
    verified: Boolean(relation.verified),
    tagsText: joinTags(relation.tags),
  }
}

function useDebouncedCommit<T>(onCommit: (draft: T) => void, delayMs: number) {
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback((draft: T) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    onCommitRef.current(draft)
  }, [])

  const schedule = useCallback(
    (draft: T) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        flush(draft)
      }, delayMs)
    },
    [delayMs, flush],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { schedule, flush }
}

function useFlushOnPageHide(flush: () => void) {
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [flush])
}

function PanelShell({
  title,
  children,
  onClose,
  onBlur,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  onBlur: () => void
}) {
  return (
    <aside
      className="z-30 flex h-full min-h-0 w-[344px] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-sm"
      role="complementary"
      aria-label={title}
      onBlur={onBlur}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <section className="space-y-4 p-4">{children}</section>
      </ScrollArea>
    </aside>
  )
}

function ReadOnlyRow({
  label,
  value,
  code = false,
}: {
  label: string
  value?: string | number | boolean | null
  code?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 truncate text-foreground/90" title={String(value ?? '')}>
        {code ? (
          <code className="sql-code text-[11px] text-foreground/90">{String(value ?? '-')}</code>
        ) : (
          String(value ?? '-')
        )}
      </dd>
    </>
  )
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <section className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        className="h-9 bg-background"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  )
}

function TextAreaField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <section className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={3}
        className="min-h-20 resize-none bg-background"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  )
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: Array<Option<T>>
  onChange: (value: T) => void
}) {
  return (
    <section className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  )
}

function RelationshipSegmented({
  value,
  onChange,
}: {
  value: RelationshipType
  onChange: (value: RelationshipType) => void
}) {
  return (
    <section className="space-y-2">
      <Label className="text-xs text-muted-foreground">基数</Label>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/30 p-1">
        {RELATIONSHIP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn(
              'h-8 rounded-sm text-xs font-semibold transition-colors',
              value === option.value
                ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function FieldEnumPanel({
  tableId,
  tableName,
  field,
  onChange,
  onClose,
}: FieldEnumPanelProps) {
  const [clearOpen, setClearOpen] = useState(false)
  const [draft, setDraft] = useState(() => fieldDraftFrom(field))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const commit = useCallback(
    (next: typeof draft) => {
      onChange({
        businessName: optionalText(next.businessName),
        description: optionalText(next.description),
        comment: optionalText(next.comment),
        columnRole: next.columnRole ? (next.columnRole as ColumnRole) : undefined,
        tags: optionalTags(next.tagsText),
        enumValues: optionalEnumValues(next.enumValues),
      })
    },
    [onChange],
  )
  const { schedule, flush } = useDebouncedCommit(commit, 400)
  const flushCurrent = useCallback(() => flush(draftRef.current), [flush])
  useFlushOnPageHide(flushCurrent)

  const contentKey = JSON.stringify({
    b: field.businessName ?? '',
    d: field.description ?? '',
    c: field.comment ?? '',
    r: field.columnRole ?? '',
    t: field.tags ?? [],
    e: (field.enumValues ?? []).map((x) => [
      x.value,
      x.label,
      x.description ?? '',
      x.sortOrder ?? '',
    ]),
  })

  useEffect(() => {
    const next = fieldDraftFrom(field)
    setDraft(next)
    draftRef.current = next
  }, [tableId, field.name, contentKey])

  const commitDraft = useCallback(
    (next: typeof draft, immediate = false) => {
      setDraft(next)
      draftRef.current = next
      if (immediate) flush(next)
      else schedule(next)
    },
    [flush, schedule],
  )

  useEffect(() => () => flush(draftRef.current), [flush])

  const qualified = fieldQualifiedName(tableId, field.name)
  const entries = draft.enumValues
  const hasEnum = entries.length > 0

  const updateEntry = (index: number, patch: Partial<FieldEnumEntry>) => {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e))
    commitDraft({ ...draft, enumValues: next })
  }

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index)
    commitDraft({ ...draft, enumValues: next }, true)
  }

  const addEntry = () => {
    commitDraft({ ...draft, enumValues: [...entries, emptyEnumEntry()] }, true)
  }

  const clearEnum = () => {
    commitDraft({ ...draft, enumValues: [] }, true)
    setClearOpen(false)
  }

  return (
    <PanelShell title="字段业务属性" onClose={onClose} onBlur={flushCurrent}>
      <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-2 text-xs">
        <ReadOnlyRow label="字段" value={qualified} code />
        <ReadOnlyRow label="表" value={tableName} />
        <ReadOnlyRow label="类型" value={field.type} code />
        <ReadOnlyRow label="主键" value={field.keyType === 'primary' ? '是' : '否'} />
      </dl>

      <Separator className="bg-border" />

      <TextField
        id="field-business-name"
        label="业务名称"
        value={draft.businessName}
        placeholder="如：订单状态"
        onChange={(value) => commitDraft({ ...draft, businessName: value })}
      />
      <TextAreaField
        id="field-description"
        label="业务说明"
        value={draft.description}
        placeholder="描述该字段的业务含义"
        onChange={(value) => commitDraft({ ...draft, description: value })}
      />
      <TextField
        id="field-comment"
        label="注释"
        value={draft.comment}
        placeholder="如：来自业务系统字典"
        onChange={(value) => commitDraft({ ...draft, comment: value })}
      />
      <SelectField
        id="field-column-role"
        label="字段角色"
        value={(draft.columnRole || 'unknown') as ColumnRole}
        options={COLUMN_ROLE_OPTIONS}
        onChange={(value) => commitDraft({ ...draft, columnRole: value })}
      />
      <TextField
        id="field-tags"
        label="标签"
        value={draft.tagsText}
        placeholder="逗号分隔，如：支付, 状态"
        onChange={(value) => commitDraft({ ...draft, tagsText: value })}
      />

      <Separator className="bg-border" />

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">枚举值</h3>
          {hasEnum ? (
            <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  清空字典
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>清空枚举字典？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将移除该字段的全部枚举项，此操作可通过重新添加恢复。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={clearEnum}>
                    确认清空
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span className="text-xs text-muted-foreground">未配置</span>
          )}
        </header>

        {hasEnum ? (
          <ul className="space-y-3">
            {entries.map((entry, index) => (
              <li key={index}>
                <Card className="gap-0 rounded-lg border-border/80 bg-muted/25 py-0 shadow-none">
                  <CardContent className="space-y-3 p-3">
                    <section className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <section className="space-y-1">
                        <Label className="text-xs text-muted-foreground">值</Label>
                        <Input
                          className="h-8 bg-background"
                          value={entry.value}
                          placeholder="0"
                          onChange={(e) => updateEntry(index, { value: e.target.value })}
                        />
                      </section>
                      <section className="space-y-1">
                        <Label className="text-xs text-muted-foreground">标签</Label>
                        <Input
                          className="h-8 bg-background"
                          value={entry.label}
                          placeholder="已支付"
                          onChange={(e) => updateEntry(index, { label: e.target.value })}
                        />
                      </section>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title="删除此项"
                        onClick={() => removeEntry(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </section>
                    <section className="grid grid-cols-[1fr_86px] items-end gap-2">
                      <section className="space-y-1">
                        <Label className="text-xs text-muted-foreground">说明</Label>
                        <Textarea
                          rows={2}
                          className="min-h-0 resize-none bg-background"
                          value={entry.description ?? ''}
                          placeholder="可选：业务说明"
                          onChange={(e) =>
                            updateEntry(index, { description: e.target.value || undefined })
                          }
                        />
                      </section>
                      <section className="space-y-1">
                        <Label className="text-xs text-muted-foreground">排序</Label>
                        <Input
                          type="number"
                          className="h-8 bg-background"
                          value={entry.sortOrder ?? index}
                          onChange={(e) =>
                            updateEntry(index, {
                              sortOrder: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                        />
                      </section>
                    </section>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            枚举字典供 Agent 理解存库值含义，不会画成 ER 关系线。
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed border-primary/30 bg-background hover:bg-accent"
          onClick={addEntry}
        >
          + 新增枚举项
        </Button>
      </section>
    </PanelShell>
  )
}

export function TableBusinessPanel({ table, onChange, onClose }: TableBusinessPanelProps) {
  const [draft, setDraft] = useState(() => tableDraftFrom(table))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const commit = useCallback(
    (next: typeof draft) => {
      const importance = Number.parseInt(next.importance, 10)
      onChange({
        businessName: optionalText(next.businessName),
        description: optionalText(next.description),
        businessDomain: optionalText(next.businessDomain),
        tableType: next.tableType,
        importance: Number.isFinite(importance) ? importance : undefined,
        tags: optionalTags(next.tagsText),
        comment: optionalText(next.comment),
      })
    },
    [onChange],
  )
  const { schedule, flush } = useDebouncedCommit(commit, 400)
  const flushCurrent = useCallback(() => flush(draftRef.current), [flush])
  useFlushOnPageHide(flushCurrent)

  const contentKey = JSON.stringify({
    b: table.businessName ?? '',
    d: table.description ?? '',
    bd: table.businessDomain ?? '',
    tt: table.tableType ?? '',
    i: table.importance ?? '',
    t: table.tags ?? [],
    c: table.comment ?? '',
  })

  useEffect(() => {
    const next = tableDraftFrom(table)
    setDraft(next)
    draftRef.current = next
  }, [table.id, contentKey])

  const commitDraft = useCallback(
    (next: typeof draft) => {
      setDraft(next)
      draftRef.current = next
      schedule(next)
    },
    [schedule],
  )

  useEffect(() => () => flush(draftRef.current), [flush])

  return (
    <PanelShell title="表业务属性" onClose={onClose} onBlur={flushCurrent}>
      <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-2 text-xs">
        <ReadOnlyRow label="表" value={table.name} code />
        <ReadOnlyRow label="字段数" value={table.fields.length} />
      </dl>

      <Separator className="bg-border" />

      <TextField
        id="table-business-name"
        label="业务名称"
        value={draft.businessName}
        placeholder="如：订单"
        onChange={(value) => commitDraft({ ...draft, businessName: value })}
      />
      <TextAreaField
        id="table-description"
        label="业务说明"
        value={draft.description}
        placeholder="描述该表承载的业务对象或事实"
        onChange={(value) => commitDraft({ ...draft, description: value })}
      />
      <TextField
        id="table-business-domain"
        label="业务域"
        value={draft.businessDomain}
        placeholder="如：交易"
        onChange={(value) => commitDraft({ ...draft, businessDomain: value })}
      />
      <SelectField
        id="table-type"
        label="表类型"
        value={draft.tableType as TableType}
        options={TABLE_TYPE_OPTIONS}
        onChange={(value) => commitDraft({ ...draft, tableType: value })}
      />
      <TextField
        id="table-importance"
        label="重要性"
        value={draft.importance}
        placeholder="1-5"
        onChange={(value) => commitDraft({ ...draft, importance: value })}
      />
      <TextField
        id="table-tags"
        label="标签"
        value={draft.tagsText}
        placeholder="逗号分隔，如：核心, 交易"
        onChange={(value) => commitDraft({ ...draft, tagsText: value })}
      />
      <TextAreaField
        id="table-comment"
        label="注释"
        value={draft.comment}
        placeholder="补充人工备注"
        onChange={(value) => commitDraft({ ...draft, comment: value })}
      />
    </PanelShell>
  )
}

export function RelationBusinessPanel({
  relation,
  onChange,
  onClose,
}: RelationBusinessPanelProps) {
  const [draft, setDraft] = useState(() => relationDraftFrom(relation))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const commit = useCallback(
    (next: typeof draft) => {
      onChange({
        relationName: optionalText(next.relationName),
        description: optionalText(next.description),
        relationType: next.relationType as RelationType,
        relationship: next.relationship as RelationshipType,
        verified: next.verified,
        tags: optionalTags(next.tagsText),
      })
    },
    [onChange],
  )
  const { schedule, flush } = useDebouncedCommit(commit, 400)
  const flushCurrent = useCallback(() => flush(draftRef.current), [flush])
  useFlushOnPageHide(flushCurrent)

  const contentKey = JSON.stringify({
    n: relation.relationName ?? '',
    d: relation.description ?? '',
    rt: relation.relationType ?? '',
    rs: relation.relationship ?? relation.type ?? '',
    v: relation.verified ?? false,
    t: relation.tags ?? [],
  })

  useEffect(() => {
    const next = relationDraftFrom(relation)
    setDraft(next)
    draftRef.current = next
  }, [relation.relationKey, contentKey])

  const commitDraft = useCallback(
    (next: typeof draft, immediate = false) => {
      setDraft(next)
      draftRef.current = next
      if (immediate) flush(next)
      else schedule(next)
    },
    [flush, schedule],
  )

  useEffect(() => () => flush(draftRef.current), [flush])

  return (
    <PanelShell title="关系业务属性" onClose={onClose} onBlur={flushCurrent}>
      <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-2 text-xs">
        <ReadOnlyRow label="来源表" value={relation.sourceTable} code />
        <ReadOnlyRow label="来源字段" value={relation.sourceColumn} code />
        <ReadOnlyRow label="目标表" value={relation.targetTable} code />
        <ReadOnlyRow label="目标字段" value={relation.targetColumn} code />
      </dl>

      <Separator className="bg-border" />

      <TextField
        id="relation-name"
        label="关系名称"
        value={draft.relationName}
        placeholder="如：订单归属用户"
        onChange={(value) => commitDraft({ ...draft, relationName: value })}
      />
      <TextAreaField
        id="relation-description"
        label="关系说明"
        value={draft.description}
        placeholder="描述两个字段之间的业务语义"
        onChange={(value) => commitDraft({ ...draft, description: value })}
      />
      <SelectField
        id="relation-type"
        label="关系类型"
        value={draft.relationType as RelationType}
        options={RELATION_TYPE_OPTIONS}
        onChange={(value) => commitDraft({ ...draft, relationType: value })}
      />
      <RelationshipSegmented
        value={draft.relationship as RelationshipType}
        onChange={(value) => commitDraft({ ...draft, relationship: value }, true)}
      />
      <section className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
        <Label htmlFor="relation-verified" className="text-xs text-muted-foreground">
          已人工确认
        </Label>
        <input
          id="relation-verified"
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.verified}
          onChange={(e) => commitDraft({ ...draft, verified: e.target.checked }, true)}
        />
      </section>
      <TextField
        id="relation-tags"
        label="标签"
        value={draft.tagsText}
        placeholder="逗号分隔，如：核心链路"
        onChange={(value) => commitDraft({ ...draft, tagsText: value })}
      />
    </PanelShell>
  )
}
