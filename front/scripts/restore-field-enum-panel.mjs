import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const Z = {
  fieldProps: '\u5b57\u6bb5\u5c5e\u6027',
  close: '\u5173\u95ed',
  field: '\u5b57\u6bb5',
  table: '\u8868',
  type: '\u7c7b\u578b',
  comment: '\u6ce8\u91ca',
  commentPh: '\u5982\uff1a\u8ba2\u5355\u72b6\u6001',
  enumValues: '\u679a\u4e3e\u503c',
  clearDict: '\u6e05\u7a7a\u5b57\u5178',
  clearDictTitle: '\u6e05\u7a7a\u679a\u4e3e\u5b57\u5178\uff1f',
  clearDictDesc:
    '\u5c06\u79fb\u9664\u8be5\u5b57\u6bb5\u7684\u5168\u90e8\u679a\u4e3e\u9879\uff0c\u6b64\u64cd\u4f5c\u53ef\u901a\u8fc7\u91cd\u65b0\u6dfb\u52a0\u6062\u590d\u3002',
  cancel: '\u53d6\u6d88',
  confirmClear: '\u786e\u8ba4\u6e05\u7a7a',
  enumHint: '\u672a\u914d\u7f6e\u65f6\u53ef\u70b9\u51fb\u4e0b\u65b9\u6dfb\u52a0',
  value: '\u503c',
  label: '\u6807\u7b7e',
  paid: '\u5df2\u652f\u4ed8',
  deleteItem: '\u5220\u9664\u6b64\u9879',
  desc: '\u8bf4\u660e',
  descPh: '\u53ef\u9009\uff1a\u4e1a\u52a1\u8bf4\u660e',
  unnamed: '\uff08\u672a\u547d\u540d\uff09',
  enumHelp:
    '\u679a\u4e3e\u5b57\u5178\u5199\u5728 JSON \u7684',
  enumHelpMid: '\u4e2d\uff0c\u4f9b Agent \u7406\u89e3\u5b58\u5e93\u503c\u542b\u4e49\uff08\u5982',
  enumHelpEnd:
    '\u8868\u793a\u300c\u5df2\u652f\u4ed8\u300d\uff09\uff0c\u4e0d\u4f1a\u753b\u6210 ER \u5173\u7cfb\u7ebf\u3002',
  addEnum: '+ \u65b0\u589e\u679a\u4e3e\u9879',
}

const content = `import { Trash2, X } from 'lucide-react'
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
} from './erSchema'

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

  useEffect(() => {
    const next = draftFromField(field)
    setDraft(next)
    draftRef.current = next
  }, [tableId, field.name])

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
      aria-label="${Z.fieldProps}"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">${Z.fieldProps}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="${Z.close}"
        >
          <X className="size-4" />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <section className="space-y-4 p-4">
          <dl className="grid grid-cols-[56px_1fr] gap-x-2 gap-y-2 text-xs">
            <dt className="text-muted-foreground">${Z.field}</dt>
            <dd className="m-0">
              <code className="sql-code text-[11px] text-foreground/90">{qualified}</code>
            </dd>
            <dt className="text-muted-foreground">${Z.table}</dt>
            <dd className="m-0 text-foreground/90">{tableName}</dd>
            <dt className="text-muted-foreground">${Z.type}</dt>
            <dd className="m-0">
              <code className="sql-code text-[11px] text-foreground/90">{field.type}</code>
            </dd>
          </dl>

          <section className="space-y-2">
            <Label htmlFor="field-comment" className="text-xs text-muted-foreground">
              ${Z.comment}
            </Label>
            <Input
              id="field-comment"
              className="h-9 bg-background"
              value={draft.comment}
              placeholder="${Z.commentPh}"
              onChange={(e) => commitDraft({ ...draft, comment: e.target.value })}
            />
          </section>

          <Separator className="bg-border" />

          <section className="space-y-3">
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground">${Z.enumValues}</h3>
              {hasEnum ? (
                <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      ${Z.clearDict}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>${Z.clearDictTitle}</AlertDialogTitle>
                      <AlertDialogDescription>${Z.clearDictDesc}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>${Z.cancel}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={clearEnum}>
                        ${Z.confirmClear}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <span className="text-xs text-muted-foreground">${Z.enumHint}</span>
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
                            <Label className="text-xs text-muted-foreground">${Z.value}</Label>
                            <Input
                              className="h-8 bg-background"
                              value={entry.value}
                              placeholder="0"
                              onChange={(e) => updateEntry(index, { value: e.target.value })}
                            />
                          </section>
                          <section className="space-y-1">
                            <Label className="text-xs text-muted-foreground">${Z.label}</Label>
                            <Input
                              className="h-8 bg-background"
                              value={entry.label}
                              placeholder="${Z.paid}"
                              onChange={(e) => updateEntry(index, { label: e.target.value })}
                            />
                          </section>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                            title="${Z.deleteItem}"
                            onClick={() => removeEntry(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </section>
                        <section className="space-y-1">
                          <Label className="text-xs text-muted-foreground">${Z.desc}</Label>
                          <Textarea
                            rows={2}
                            className="min-h-0 resize-none bg-background"
                            value={entry.description ?? ''}
                            placeholder="${Z.descPh}"
                            onChange={(e) =>
                              updateEntry(index, { description: e.target.value || undefined })
                            }
                          />
                        </section>
                        <p className="text-xs text-muted-foreground">
                          <code className="sql-code text-foreground/80">{entry.value || '?'}</code> ={' '}
                          {entry.label || '${Z.unnamed}'}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                ${Z.enumHelp}{' '}
                <code className="sql-code text-foreground/80">enumValues</code> ${Z.enumHelpMid}{' '}
                <code className="sql-code text-foreground/80">1</code> ${Z.enumHelpEnd}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed border-primary/30 bg-background hover:bg-accent"
              onClick={addEntry}
            >
              ${Z.addEnum}
            </Button>
          </section>
        </section>
      </ScrollArea>
    </aside>
  )
}
`

const target = join(dirname(fileURLToPath(import.meta.url)), '../src/FieldEnumPanel.tsx')
writeFileSync(target, content, { encoding: 'utf8' })
console.log('Restored UTF-8:', target)
