import { useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useForm } from '@tanstack/react-form'
import {
  AlertCircle,
  ArrowUpDown,
  Edit3,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
} from 'lucide-react'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getDefaultGraphId, useGraphsQuery } from '@/entities/er-graph/api'
import {
  useBusinessFlowsQuery,
  useSaveBusinessFlowMutation,
  type BusinessFlowRecord,
} from '@/entities/business-flow/api'
import { useUrlSearchState } from '@/shared/lib/useUrlSearchState'
import { DataTable, DataTablePagination } from '@/shared/ui/data-table'

const flowPageSizes = [10, 20, 50]
const flowColumnHelper = createColumnHelper<BusinessFlowRecord>()

export type BusinessFlowListFilters = {
  graphId: string
  q?: string
  page?: number
  pageSize?: number
  sort?: string
}

type BusinessFlowFormMode = 'create' | 'edit'
type BusinessFlowFormValues = z.input<typeof businessFlowMetaFormSchema>
type BusinessFlowFormSubmitValues = z.output<typeof businessFlowMetaFormSchema>

const businessFlowMetaFormSchema = z.object({
  flowKey: z
    .string()
    .trim()
    .min(1, '请输入业务图标识')
    .max(120, '标识不能超过 120 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '标识只能包含字母、数字、下划线和短横线'),
  name: z.string().trim().min(1, '请输入名称').max(120, '名称不能超过 120 个字符'),
  description: z.string().trim().max(500, '描述不能超过 500 个字符').optional(),
})

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBusinessFlowFilters(params: URLSearchParams): BusinessFlowListFilters {
  const pageSize = parsePositiveInteger(params.get('pageSize'), 10)
  return {
    graphId: params.get('graphId') || getDefaultGraphId(),
    q: params.get('q') ?? '',
    page: parsePositiveInteger(params.get('page'), 1),
    pageSize: flowPageSizes.includes(pageSize) ? pageSize : 10,
    sort: params.get('sort') ?? 'version.desc',
  }
}

function serializeBusinessFlowFilters(filters: BusinessFlowListFilters) {
  const params = new URLSearchParams()
  if (filters.graphId && filters.graphId !== getDefaultGraphId()) {
    params.set('graphId', filters.graphId)
  }
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if ((filters.page ?? 1) > 1) params.set('page', String(filters.page))
  if ((filters.pageSize ?? 10) !== 10) params.set('pageSize', String(filters.pageSize))
  if (filters.sort && filters.sort !== 'version.desc') params.set('sort', filters.sort)
  return params
}

function sortingFromParam(sort?: string): SortingState {
  const [id, direction] = (sort ?? 'version.desc').split('.')
  if (!id) return [{ id: 'version', desc: true }]
  return [{ id, desc: direction !== 'asc' }]
}

function sortingToParam(sorting: SortingState) {
  const first = sorting[0]
  return first ? `${first.id}.${first.desc ? 'desc' : 'asc'}` : 'version.desc'
}

function flowSearchText(flow: BusinessFlowRecord) {
  return [flow.flow_key, flow.name, flow.description]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function defaultFlowKey() {
  return `business_flow_${Date.now()}`
}

function defaultCreateValues(): BusinessFlowFormValues {
  return {
    flowKey: defaultFlowKey(),
    name: '新建业务图',
    description: '',
  }
}

function valuesFromFlow(flow: BusinessFlowRecord): BusinessFlowFormValues {
  return {
    flowKey: flow.flow_key,
    name: flow.name,
    description: flow.description ?? '',
  }
}

function HeaderSortButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button type="button" variant="ghost" size="xs" className="-ml-2" onClick={onClick}>
      {label}
      <ArrowUpDown className="size-3.5" />
    </Button>
  )
}

function BusinessFlowMetaDialog({
  initialValues,
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  initialValues: BusinessFlowFormValues
  mode: BusinessFlowFormMode
  onClose: () => void
  onSubmit: (values: BusinessFlowFormSubmitValues) => Promise<void>
  pending: boolean
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: businessFlowMetaFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(businessFlowMetaFormSchema.parse(value))
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增业务图' : '编辑业务图信息'}</DialogTitle>
          <DialogDescription>维护业务图元数据；完整流程编辑器后续接入。</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="flowKey"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>标识</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      disabled={mode === 'edit' || pending}
                    />
                    {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>名称</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      autoFocus
                      disabled={pending}
                    />
                    {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="description"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>描述</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      className="min-h-24 resize-none"
                      value={field.state.value ?? ''}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      disabled={pending}
                    />
                    {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BusinessFlowListPage() {
  const graphsQuery = useGraphsQuery()
  const [filters, setFilters] = useUrlSearchState(
    parseBusinessFlowFilters,
    serializeBusinessFlowFilters,
  )
  const [sorting, setSorting] = useState<SortingState>(() => sortingFromParam(filters.sort))
  const [formMode, setFormMode] = useState<BusinessFlowFormMode | null>(null)
  const [editingFlow, setEditingFlow] = useState<BusinessFlowRecord | null>(null)
  const [formInitialValues, setFormInitialValues] =
    useState<BusinessFlowFormValues>(() => defaultCreateValues())
  const graphs = graphsQuery.data ?? []

  useEffect(() => {
    setSorting(sortingFromParam(filters.sort))
  }, [filters.sort])

  useEffect(() => {
    if (graphs.length && !graphs.some((graph) => graph.id === filters.graphId)) {
      setFilters({ graphId: graphs[0].id, page: 1 })
    }
  }, [filters.graphId, graphs, setFilters])

  const selectedGraphName = useMemo(
    () => graphs.find((graph) => graph.id === filters.graphId)?.name ?? filters.graphId,
    [filters.graphId, graphs],
  )
  const flowsQuery = useBusinessFlowsQuery(filters.graphId)
  const saveFlowMutation = useSaveBusinessFlowMutation(filters.graphId)
  const flows = flowsQuery.data ?? []
  const filteredFlows = useMemo(() => {
    const query = filters.q?.trim().toLocaleLowerCase() ?? ''
    if (!query) return flows
    return flows.filter((flow) => flowSearchText(flow).includes(query))
  }, [filters.q, flows])
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.max((filters.page ?? 1) - 1, 0),
      pageSize: filters.pageSize ?? 10,
    }),
    [filters.page, filters.pageSize],
  )
  const columns = useMemo(
    () => [
      flowColumnHelper.accessor('name', {
        header: ({ column }) => (
          <HeaderSortButton
            label="业务图"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 320,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Network className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.description || row.original.flow_key}
              </div>
            </div>
          </div>
        ),
      }),
      flowColumnHelper.accessor((flow) => flow.nodes.length, {
        id: 'nodes',
        header: ({ column }) => (
          <HeaderSortButton
            label="节点"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 100,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor((flow) => flow.edges.length, {
        id: 'edges',
        header: ({ column }) => (
          <HeaderSortButton
            label="边"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 100,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor((flow) => flow.bindings.length, {
        id: 'bindings',
        header: ({ column }) => (
          <HeaderSortButton
            label="绑定"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 100,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor('version', {
        header: ({ column }) => (
          <HeaderSortButton
            label="版本"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground tabular-nums">v{getValue()}</span>
        ),
      }),
      flowColumnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        size: 110,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-xs" aria-label="更多操作">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>操作</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                  <Edit3 className="size-4" />
                  编辑信息
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [],
  )
  const table = useReactTable({
    data: filteredFlows,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(nextSorting)
      setFilters({ sort: sortingToParam(nextSorting), page: 1 })
    },
    onPaginationChange: (updater) => {
      const nextPagination = typeof updater === 'function' ? updater(pagination) : updater
      setFilters({ page: nextPagination.pageIndex + 1, pageSize: nextPagination.pageSize })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  function openCreateDialog() {
    setEditingFlow(null)
    setFormInitialValues(defaultCreateValues())
    setFormMode('create')
  }

  function openEditDialog(flow: BusinessFlowRecord) {
    setEditingFlow(flow)
    setFormInitialValues(valuesFromFlow(flow))
    setFormMode('edit')
  }

  function closeDialog() {
    if (saveFlowMutation.isPending) return
    setFormMode(null)
    setEditingFlow(null)
  }

  async function submitFlow(values: BusinessFlowFormSubmitValues) {
    const body =
      formMode === 'edit' && editingFlow
        ? {
            name: values.name,
            description: values.description || null,
            nodes: editingFlow.nodes,
            edges: editingFlow.edges,
            bindings: editingFlow.bindings,
          }
        : {
            name: values.name,
            description: values.description || null,
            nodes: [],
            edges: [],
            bindings: [],
          }
    await saveFlowMutation.mutateAsync({
      flowKey: values.flowKey,
      body,
    })
    setFormMode(null)
    setEditingFlow(null)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">业务图列表</h3>
          <p className="truncate text-xs text-muted-foreground">当前 ER 图：{selectedGraphName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filters.graphId}
            onValueChange={(graphId) => setFilters({ graphId, page: 1 })}
          >
            <SelectTrigger className="w-64 max-w-[50vw]" aria-label="选择 ER 图">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {graphs.length ? (
                  graphs.map((graph) => (
                    <SelectItem key={graph.id} value={graph.id}>
                      {graph.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={filters.graphId}>{filters.graphId}</SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => flowsQuery.refetch()}
            disabled={flowsQuery.isFetching}
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={saveFlowMutation.isPending}>
            <Plus className="size-4" />
            新增业务图
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {saveFlowMutation.error ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {saveFlowMutation.error instanceof Error ? saveFlowMutation.error.message : '保存失败'}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_120px]">
          <Input
            value={filters.q ?? ''}
            onChange={(event) => setFilters({ q: event.target.value, page: 1 })}
            placeholder="搜索业务图名称、描述、标识"
          />
          <Select
            value={String(filters.pageSize ?? 10)}
            onValueChange={(value) => setFilters({ pageSize: Number(value), page: 1 })}
          >
            <SelectTrigger aria-label="分页大小">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {flowPageSizes.map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize} / 页
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <DataTable
          table={table}
          columnsLength={columns.length}
          loading={flowsQuery.isLoading}
          error={flowsQuery.error}
          minWidth={830}
          emptyTitle="暂无业务图"
          emptyDescription="可以新建业务图，或调整筛选条件。"
        />
        <DataTablePagination
          table={table}
          label={`共 ${filteredFlows.length} 张业务图，当前显示 ${table.getRowModel().rows.length} 张`}
        />
      </div>

      {formMode ? (
        <BusinessFlowMetaDialog
          key={`${formMode}-${editingFlow?.flow_key ?? 'new'}`}
          mode={formMode}
          initialValues={formInitialValues}
          pending={saveFlowMutation.isPending}
          onClose={closeDialog}
          onSubmit={submitFlow}
        />
      ) : null}
    </section>
  )
}
