import { Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  emptyEnumEntry,
  fieldQualifiedName,
  type FieldEnumEntry,
  type TableField,
} from '@/entities/er-graph/model/erSchema'

export interface FieldEnumPanelProps {
  tableId: string
  tableName: string
  field: TableField
  onChange: (patch: {
    comment?: string
    enumValues?: FieldEnumEntry[] | undefined
  }) => void
  onClose: () => void
}

type FieldDraft = {
  comment: string
  enumValues: FieldEnumEntry[]
}

function draftFromField(field: TableField): FieldDraft {
  return {
    comment: field.comment ?? '',
    enumValues: field.enumValues ? field.enumValues.map((e) => ({ ...e })) : [],
  }
}

function fieldContentKey(field: TableField) {
  return JSON.stringify({
    c: field.comment ?? '',
    e: (field.enumValues ?? []).map((x) => [x.value, x.label, x.description ?? '']),
  })
}

function useDebouncedFieldCommit(
  onChange: FieldEnumPanelProps['onChange'],
  delayMs: number,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback((draft: FieldDraft) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    onChangeRef.current({
      comment: draft.comment || undefined,
      enumValues: draft.enumValues.length > 0 ? draft.enumValues : undefined,
    })
  }, [])

  const schedule = useCallback(
    (draft: FieldDraft) => {
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

export function FieldEnumPanel({
  tableId,
  tableName,
  field,
  onChange,
  onClose,
}: FieldEnumPanelProps) {
  const [clearOpen, setClearOpen] = useState(false)
  const [draft, setDraft] = useState<FieldDraft>(() => draftFromField(field))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const { schedule, flush } = useDebouncedFieldCommit(onChange, 400)

  const contentKey = fieldContentKey(field)

  useEffect(() => {
    const next = draftFromField(field)
    setDraft(next)
    draftRef.current = next
  }, [tableId, field.name, contentKey])

  const commitDraft = useCallback(
    (next: FieldDraft, immediate = false) => {
      setDraft(next)
      draftRef.current = next
      if (immediate) flush(next)
      else schedule(next)
    },
    [flush, schedule],
  )

  useEffect(
    () => () => {
      flush(draftRef.current)
    },
    [flush],
  )

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
    <aside
      className="z-30 flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-sm"
      role="complementary"
      aria-label="字段属性"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">字段属性</h2>
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
        <section className="space-y-4 p-4">
          <dl className="grid grid-cols-[56px_1fr] gap-x-2 gap-y-2 text-xs">
            <dt className="text-muted-foreground">字段</dt>
            <dd className="m-0">
              <code className="sql-code text-[11px] text-foreground/90">{qualified}</code>
            </dd>
            <dt className="text-muted-foreground">表</dt>
            <dd className="m-0 text-foreground/90">{tableName}</dd>
            <dt className="text-muted-foreground">类型</dt>
            <dd className="m-0">
              <code className="sql-code text-[11px] text-foreground/90">{field.type}</code>
            </dd>
          </dl>

          <section className="space-y-2">
            <Label htmlFor="field-comment" className="text-xs text-muted-foreground">
              注释
            </Label>
            <Input
              id="field-comment"
              className="h-9 bg-background"
              value={draft.comment}
              placeholder="如：订单状态"
              onChange={(e) => commitDraft({ ...draft, comment: e.target.value })}
            />
          </section>

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
                      <AlertDialogDescription>将移除该字段的全部枚举项，此操作可通过重新添加恢复。</AlertDialogDescription>
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
                <span className="text-xs text-muted-foreground">未配置时可点击下方添加</span>
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
                        <p className="text-xs text-muted-foreground">
                          <code className="sql-code text-foreground/80">{entry.value || '?'}</code> ={' '}
                          {entry.label || '（未命名）'}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                枚举字典写在 JSON 的{' '}
                <code className="sql-code text-foreground/80">enumValues</code> 中，供 Agent 理解存库值含义（如{' '}
                <code className="sql-code text-foreground/80">1</code> 表示「已支付」），不会画成 ER 关系线。
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
        </section>
      </ScrollArea>
    </aside>
  )
}
