import type { ReactNode } from 'react'
import { flexRender, type Table as TanStackTable } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export function DataTable<TData>({
  columnsLength,
  emptyDescription,
  emptyTitle = '暂无数据',
  error,
  loading,
  minWidth = 720,
  table,
}: {
  columnsLength: number
  emptyDescription?: string
  emptyTitle?: string
  error?: unknown
  loading?: boolean
  minWidth?: number
  table: TanStackTable<TData>
}) {
  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '加载失败'

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <Table style={{ minWidth }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={columnsLength}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columnsLength}>
                  <Empty>
                    <EmptyTitle>加载失败</EmptyTitle>
                    <EmptyDescription>{errorMessage}</EmptyDescription>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnsLength}>
                  <Empty>
                    <EmptyTitle>{emptyTitle}</EmptyTitle>
                    {emptyDescription ? (
                      <EmptyDescription>{emptyDescription}</EmptyDescription>
                    ) : null}
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function DataTablePagination<TData>({
  className,
  label,
  table,
}: {
  className?: string
  label?: ReactNode
  table: TanStackTable<TData>
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 py-3', className)}>
      <div className="text-xs text-muted-foreground">
        {label ??
          `第 ${table.getState().pagination.pageIndex + 1} / ${Math.max(table.getPageCount(), 1)} 页`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          下一页
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
