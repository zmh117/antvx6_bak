import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
  fetchGraphHistory,
  getDefaultGraphId,
  restoreGraphCheckpoint,
  type ChangeLogEntry,
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
}

function checkpointSourceBadge(entry: ChangeLogEntry): string | null {
  if (entry.change_type !== 'checkpoint') return null
  const source = entry.after_data?.operation_source
  if (typeof source !== 'string') return null
  return SOURCE_BADGE[source] ?? source
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
  const [entries, setEntries] = useState<ChangeLogEntry[]>([])
  const [version, setVersion] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<ChangeLogEntry | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGraphHistory(graphId)
      setEntries(data.entries)
      setVersion(data.version)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [graphId])

  useEffect(() => {
    if (open) void loadHistory()
  }, [open, loadHistory, refreshKey])

  const confirmRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    setError(null)
    try {
      const result = await restoreGraphCheckpoint(restoreTarget.id, graphId)
      setRestoreTarget(null)
      onOpenChange(false)
      onRestored?.(result.new_version)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRestoring(false)
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

        {error ? (
          <p className="shrink-0 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border px-2 py-1">
            {loading && entries.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                加载中…
              </li>
            ) : null}
            {!loading && entries.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂无历史
              </li>
            ) : null}
            {entries.map((entry) => {
              const isCheckpoint = entry.change_type === 'checkpoint'
              const sourceBadge = checkpointSourceBadge(entry)
              return (
                <li key={entry.id} className="px-2 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded px-1 py-0.5 text-[10px] font-medium ${
                            isCheckpoint
                              ? 'bg-primary/15 text-primary'
                              : entry.change_type === 'delete'
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {entryBadge(entry)}
                        </span>
                        {sourceBadge ? (
                          <span className="inline-flex rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {sourceBadge}
                          </span>
                        ) : null}
                        {entry.graph_version != null ? (
                          <span className="text-[10px] text-muted-foreground">
                            v{entry.graph_version}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-snug">
                        {entry.summary}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatTime(entry.created_at)}
                      </p>
                    </div>
                    {isCheckpoint ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => setRestoreTarget(entry)}
                      >
                        恢复
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
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
            <AlertDialogCancel disabled={restoring}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={(e) => {
                e.preventDefault()
                void confirmRestore()
              }}
            >
              {restoring ? '恢复中…' : '确认恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
