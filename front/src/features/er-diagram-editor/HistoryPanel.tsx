import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getDefaultGraphId,
  type ChangeLogEntry,
  useGraphHistoryQuery,
  useRestoreGraphCheckpointMutation,
} from '@/entities/er-graph/api'

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function entryBadge(entry: ChangeLogEntry) {
  if (entry.change_type === 'checkpoint') return '快照'
  if (entry.change_type === 'delete') return '删除'
  return '变更'
}

const SOURCE_BADGE: Record<string, string> = {
  undo: '撤销',
  redo: '重做',
  auto_save: '自动',
  manual_save: '手动',
  restore: '恢复',
  collab_auto_save: '协同',
  collab_restore: '协同恢复',
}

function checkpointSourceBadge(entry: ChangeLogEntry): string | null {
  if (entry.change_type !== 'checkpoint') return null
  const source = entry.after_data?.operation_source
  if (typeof source !== 'string') return null
  return SOURCE_BADGE[source] ?? source
}

type SnapshotHistoryGroup = {
  checkpoint: ChangeLogEntry
  changes: ChangeLogEntry[]
}

function groupSnapshotHistory(entries: ChangeLogEntry[]) {
  const groups: SnapshotHistoryGroup[] = []
  const looseChanges: ChangeLogEntry[] = []
  let currentGroup: SnapshotHistoryGroup | null = null

  for (const entry of entries) {
    if (entry.change_type === 'checkpoint') {
      currentGroup = { checkpoint: entry, changes: [] }
      groups.push(currentGroup)
      continue
    }

    if (currentGroup) {
      currentGroup.changes.push(entry)
    } else {
      looseChanges.push(entry)
    }
  }

  return { groups, looseChanges }
}

function changeBadgeClass(entry: ChangeLogEntry) {
  if (entry.change_type === 'delete') return 'bg-destructive/15 text-destructive'
  if (entry.entity_type === 'relation') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  if (entry.entity_type === 'table') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (entry.entity_type === 'column') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}

type HistoryPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  graphId?: string
  /** 保存成功后递增，侧栏打开时自动刷新列表 */
  refreshKey?: number
  onRestored?: (newVersion: number) => void
}

export function HistoryPanel({
  open,
  onOpenChange,
  graphId = getDefaultGraphId(),
  refreshKey = 0,
  onRestored,
}: HistoryPanelProps) {
  const [restoreTarget, setRestoreTarget] = useState<ChangeLogEntry | null>(null)
  const [expandedCheckpointId, setExpandedCheckpointId] = useState<number | null>(null)
  const historyQuery = useGraphHistoryQuery(graphId, { enabled: false, limit: 200 })
  const restoreMutation = useRestoreGraphCheckpointMutation(graphId)
  const entries = historyQuery.data?.entries ?? []
  const { groups, looseChanges } = useMemo(() => groupSnapshotHistory(entries), [entries])
  const version = historyQuery.data?.version
  const refetchHistory = historyQuery.refetch
  const error = historyQuery.error ?? restoreMutation.error
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null

  useEffect(() => {
    if (open) void refetchHistory()
  }, [open, refreshKey, refetchHistory])

  const confirmRestore = async () => {
    if (!restoreTarget) return
    try {
      const result = await restoreMutation.mutateAsync(restoreTarget.id)
      setRestoreTarget(null)
      onOpenChange(false)
      onRestored?.(result.new_version)
    } catch {
      /* surfaced through restoreMutation.error */
    }
  }

  if (!open) return null

  return (
    <>
      <aside
        className="relative z-50 flex h-full w-80 shrink-0 flex-col border-l border-border bg-card shadow-lg"
        aria-label="历史记录"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <div className="min-w-0 pr-2">
            <h2 className="text-sm font-semibold">历史记录</h2>
            {version != null ? (
              <p className="text-xs text-muted-foreground">当前版本 v{version}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="关闭历史记录"
          >
            <X className="size-4" />
          </Button>
        </div>

        {errorMessage ? (
          <p className="shrink-0 px-3 py-2 text-xs text-destructive">{errorMessage}</p>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-2 px-2 py-2">
            {historyQuery.isFetching && entries.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                加载中…
              </li>
            ) : null}
            {!historyQuery.isFetching && entries.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂无历史
              </li>
            ) : null}
            {groups.map((group) => {
              const entry = group.checkpoint
              const sourceBadge = checkpointSourceBadge(entry)
              const expanded = expandedCheckpointId === entry.id
              const changeCount = group.changes.length
              return (
                <li key={entry.id}>
                  <div className="rounded-lg border border-border bg-background p-2.5 shadow-sm transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            快照
                          </span>
                          {sourceBadge ? (
                            <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {sourceBadge}
                            </span>
                          ) : null}
                          {entry.graph_version != null ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              v{entry.graph_version}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">
                          {entry.summary}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>{formatTime(entry.created_at)}</span>
                          <span>{changeCount > 0 ? `${changeCount} 条变更` : '无实体变更'}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={changeCount === 0}
                          onClick={() =>
                            setExpandedCheckpointId(expanded ? null : entry.id)
                          }
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          变更
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRestoreTarget(entry)}
                        >
                          恢复
                        </Button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-2 border-t border-border pt-2">
                        <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>本次快照的全部变更</span>
                          <span>{changeCount} 条</span>
                        </div>
                        <ul className="max-h-56 space-y-1 overflow-auto pr-1">
                          {group.changes.map((change) => (
                            <li
                              key={change.id}
                              className="rounded-md bg-muted/45 px-2 py-1.5"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${changeBadgeClass(change)}`}
                                >
                                  {entryBadge(change)}
                                </span>
                                {change.graph_version != null ? (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    v{change.graph_version}
                                  </span>
                                ) : null}
                                <span className="min-w-0 truncate text-xs">
                                  {change.summary}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {formatTime(change.created_at)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
            {groups.length === 0 && looseChanges.length > 0
              ? looseChanges.map((entry) => (
                  <li key={entry.id}>
                    <div className="rounded-lg border border-border bg-background p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${changeBadgeClass(entry)}`}
                        >
                          {entryBadge(entry)}
                        </span>
                        {entry.graph_version != null ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            v{entry.graph_version}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-snug">{entry.summary}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatTime(entry.created_at)}
                      </p>
                    </div>
                  </li>
                ))
              : null}
          </ul>
        </ScrollArea>
      </aside>

      <AlertDialog
        open={restoreTarget != null}
        onOpenChange={(v) => {
          if (!v) setRestoreTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复到该快照？</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget
                ? `将画布与表结构恢复为 v${restoreTarget.graph_version ?? '?'} 时的状态（${restoreTarget.summary}）。当前未保存的修改会丢失。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                void confirmRestore()
              }}
            >
              {restoreMutation.isPending ? '恢复中…' : '确认恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
