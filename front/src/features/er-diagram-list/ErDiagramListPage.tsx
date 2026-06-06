import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowUpDown,
  Database,
  Edit3,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import * as z from 'zod'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
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
import { fetchActiveUsers, type CurrentUser } from '@/entities/auth'
import {
  useArchiveGraphMutation,
  useCreateGraphMutation,
  useGraphMembersQuery,
  useGraphsQuery,
  useRemoveGraphMemberMutation,
  useUpdateGraphMetaMutation,
  useUpsertGraphMemberMutation,
  type GraphMember,
  type GraphMeta,
  type GraphRole,
} from '@/entities/er-graph/api'
import { formatDateTime } from '@/shared/lib/date'
import { useUrlSearchState } from '@/shared/lib/useUrlSearchState'
import { DataTable, DataTablePagination } from '@/shared/ui/data-table'

const statusText: Record<string, string> = {
  active: '使用中',
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

const roleText: Record<GraphRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

const roleOptions: Array<{ value: GraphRole; label: string }> = [
  { value: 'viewer', label: 'Viewer 只读' },
  { value: 'editor', label: 'Editor 可编辑' },
  { value: 'owner', label: 'Owner 可管理' },
]

const graphPageSizes = [10, 20, 50]
const graphColumnHelper = createColumnHelper<GraphMeta>()
const memberColumnHelper = createColumnHelper<GraphMember>()

export type GraphListFilters = {
  q?: string
  domain?: string
  role?: GraphRole | 'all'
  status?: string
  page?: number
  pageSize?: number
  sort?: string
}

type GraphFormMode = 'create' | 'edit'
type GraphMetaFormValues = z.input<typeof graphMetaFormSchema>
type GraphMetaFormSubmitValues = z.output<typeof graphMetaFormSchema>
type GraphMemberFormSubmitValues = z.output<typeof graphMemberFormSchema>

const graphMetaFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入名称')
    .max(120, '名称不能超过 120 个字符'),
  businessDomain: z
    .string()
    .trim()
    .max(80, '业务域不能超过 80 个字符')
    .optional(),
  description: z.string().trim().max(500, '描述不能超过 500 个字符').optional(),
})

const graphMemberFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入有效邮箱'),
  role: z.enum(['owner', 'editor', 'viewer']),
})

function statusLabel(status: string) {
  return statusText[status] ?? status
}

function effectiveGraphRole(graph: GraphMeta): GraphRole {
  return graph.current_user_role ?? 'owner'
}

function canEditGraph(graph: GraphMeta) {
  const role = effectiveGraphRole(graph)
  return role === 'owner' || role === 'editor'
}

function canManageGraph(graph: GraphMeta) {
  return effectiveGraphRole(graph) === 'owner'
}

function defaultCreateValues(): GraphMetaFormValues {
  return {
    name: `新建 ER 图 ${formatDateTime(new Date().toISOString())}`,
    businessDomain: '默认域',
    description: '',
  }
}

function valuesFromGraph(graph: GraphMeta): GraphMetaFormValues {
  return {
    name: graph.name,
    businessDomain: graph.business_domain ?? '',
    description: graph.description ?? '',
  }
}

function graphBodyFromValues(values: GraphMetaFormSubmitValues) {
  return {
    name: values.name,
    business_domain: values.businessDomain || null,
    description: values.description || null,
  }
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseGraphFilters(params: URLSearchParams): GraphListFilters {
  const role = params.get('role')
  return {
    q: params.get('q') ?? '',
    domain: params.get('domain') ?? 'all',
    role:
      role === 'owner' || role === 'editor' || role === 'viewer' ? role : 'all',
    status: params.get('status') ?? 'all',
    page: parsePositiveInteger(params.get('page'), 1),
    pageSize: graphPageSizes.includes(
      parsePositiveInteger(params.get('pageSize'), 10),
    )
      ? parsePositiveInteger(params.get('pageSize'), 10)
      : 10,
    sort: params.get('sort') ?? 'updated_at.desc',
  }
}

function serializeGraphFilters(filters: GraphListFilters) {
  const params = new URLSearchParams()
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.domain && filters.domain !== 'all')
    params.set('domain', filters.domain)
  if (filters.role && filters.role !== 'all') params.set('role', filters.role)
  if (filters.status && filters.status !== 'all')
    params.set('status', filters.status)
  if ((filters.page ?? 1) > 1) params.set('page', String(filters.page))
  if ((filters.pageSize ?? 10) !== 10)
    params.set('pageSize', String(filters.pageSize))
  if (filters.sort && filters.sort !== 'updated_at.desc')
    params.set('sort', filters.sort)
  return params
}

function sortingFromParam(sort?: string): SortingState {
  const [id, direction] = (sort ?? 'updated_at.desc').split('.')
  if (!id) return [{ id: 'updated_at', desc: true }]
  return [{ id, desc: direction !== 'asc' }]
}

function sortingToParam(sorting: SortingState) {
  const first = sorting[0]
  return first
    ? `${first.id}.${first.desc ? 'desc' : 'asc'}`
    : 'updated_at.desc'
}

function getSearchText(graph: GraphMeta) {
  return [
    graph.name,
    graph.description,
    graph.id,
    graph.business_domain,
    graph.status,
    effectiveGraphRole(graph),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function HeaderSortButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="-ml-2"
      onClick={onClick}
    >
      {label}
      <ArrowUpDown className="size-3.5" />
    </Button>
  )
}

function GraphMetaDialog({
  initialValues,
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  initialValues: GraphMetaFormValues
  mode: GraphFormMode
  onClose: () => void
  onSubmit: (values: GraphMetaFormSubmitValues) => Promise<void>
  pending: boolean
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: graphMetaFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(graphMetaFormSchema.parse(value))
    },
  })
  const title = mode === 'create' ? '新增画布' : '编辑画布信息'
  const submitText = mode === 'create' ? '创建并打开' : '保存'

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>维护 ER 图的业务元数据。</DialogDescription>
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
              name="name"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>名称</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      autoFocus
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="businessDomain"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>业务域</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? ''}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      placeholder="例如：订单域"
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="description"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>描述</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      className="min-h-24 resize-none"
                      value={field.state.value ?? ''}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      placeholder="说明这张 ER 图覆盖的业务范围"
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '处理中...' : submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GraphMembersDialog({
  graph,
  members,
  error,
  loading,
  pending,
  onClose,
  onUpsertMember,
  onRemoveMember,
}: {
  graph: GraphMeta
  members: GraphMember[]
  error: unknown
  loading: boolean
  pending: boolean
  onClose: () => void
  onUpsertMember: (values: GraphMemberFormSubmitValues) => Promise<void>
  onRemoveMember: (member: GraphMember) => Promise<void>
}) {
  const [userQuery, setUserQuery] = useState('')
  const userComboboxPortalRef = useRef<HTMLDivElement | null>(null)
  const activeUsersQuery = useQuery({
    queryKey: ['auth', 'active-users', userQuery.trim()],
    queryFn: () => fetchActiveUsers(userQuery),
  })
  const form = useForm({
    defaultValues: {
      email: '',
      role: 'viewer' as GraphRole,
    },
    validators: {
      onSubmit: graphMemberFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onUpsertMember(graphMemberFormSchema.parse(value))
      form.reset()
      setUserQuery('')
    },
  })
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const byCreatedAt =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return byCreatedAt || a.email.localeCompare(b.email)
      }),
    [members],
  )
  const ownerCount = sortedMembers.filter(
    (member) => member.role === 'owner',
  ).length
  const columns = useMemo(
    () => [
      memberColumnHelper.accessor('display_name', {
        header: '成员',
        size: 260,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">
                {row.original.display_name}
              </span>
              {row.original.is_creator ? (
                <Badge variant="secondary">创建者</Badge>
              ) : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.email}
            </div>
          </div>
        ),
      }),
      memberColumnHelper.accessor('role', {
        header: '角色',
        size: 180,
        cell: ({ row }) => {
          const member = row.original
          const isLastOwner = member.role === 'owner' && ownerCount <= 1
          const locked = member.is_creator || isLastOwner
          return (
            <Select
              value={member.role}
              disabled={pending || locked}
              onValueChange={(role) => {
                void onUpsertMember({
                  email: member.email,
                  role: role as GraphRole,
                })
              }}
            >
              <SelectTrigger aria-label="成员角色">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )
        },
      }),
      memberColumnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        size: 120,
        cell: ({ row }) => {
          const member = row.original
          const isLastOwner = member.role === 'owner' && ownerCount <= 1
          const locked = member.is_creator || isLastOwner
          return (
            <div className="flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={pending || locked}
                onClick={() => {
                  void onRemoveMember(member)
                }}
              >
                <Trash2 className="size-3.5" />
                移除
              </Button>
            </div>
          )
        },
      }),
    ],
    [onRemoveMember, onUpsertMember, ownerCount, pending],
  )
  const table = useReactTable({
    data: sortedMembers,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-visible sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>图成员 / 分享</DialogTitle>
          <DialogDescription className="truncate">
            {graph.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-auto pr-1">
          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {error instanceof Error ? error.message : '成员操作失败'}
            </div>
          ) : null}

          <form
            className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(220px,1fr)_170px_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.Field
              name="email"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                const selectedUser =
                  (activeUsersQuery.data ?? []).find(
                    (activeUser) => activeUser.email === field.state.value,
                  ) ??
                  (field.state.value
                    ? ({
                        id: field.state.value,
                        email: field.state.value,
                        display_name: field.state.value,
                      } satisfies CurrentUser)
                    : null)
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>用户邮箱</FieldLabel>
                    <Combobox<CurrentUser>
                      items={activeUsersQuery.data ?? []}
                      value={selectedUser}
                      inputValue={userQuery}
                      portalContainer={userComboboxPortalRef}
                      filter={null}
                      itemToStringLabel={(user) => user.email}
                      itemToStringValue={(user) => user.email}
                      isItemEqualToValue={(item, value) => item.id === value.id}
                      onInputValueChange={setUserQuery}
                      onOpenChange={(open) => {
                        if (open) setUserQuery('')
                      }}
                      onValueChange={(user) => {
                        field.handleChange(user?.email ?? '')
                        setUserQuery('')
                      }}
                    >
                      <ComboboxTrigger
                        disabled={pending}
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                            aria-invalid={isInvalid}
                          >
                            <span className="min-w-0 flex-1 truncate text-left">
                              {field.state.value || '选择启用用户'}
                            </span>
                          </Button>
                        }
                      />
                      <ComboboxContent
                        side="bottom"
                        className="z-[70] max-w-[calc(100vw-2rem)]"
                      >
                        <ComboboxInput
                          id={field.name}
                          showTrigger={false}
                          placeholder="搜索邮箱或昵称"
                          onBlur={field.handleBlur}
                        />
                        <ComboboxEmpty>
                          {activeUsersQuery.isFetching ? '搜索中...' : '未找到启用用户'}
                        </ComboboxEmpty>
                        <ComboboxList<CurrentUser>>
                          {(user) => (
                            <ComboboxItem key={user.id} value={user}>
                              <span className="grid min-w-0">
                                <span className="truncate">{user.email}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {user.display_name}
                                </span>
                              </span>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="role"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>角色</FieldLabel>
                  <Select
                    value={field.state.value}
                    disabled={pending}
                    onValueChange={(value) =>
                      field.handleChange(value as GraphRole)
                    }
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Button type="submit" disabled={pending}>
              <UserPlus className="size-4" />
              添加/更新
            </Button>
          </form>
          <div ref={userComboboxPortalRef} data-slot="member-user-combobox-portal" />

          <DataTable
            table={table}
            columnsLength={columns.length}
            loading={loading}
            minWidth={560}
            emptyTitle="暂无成员"
          />

          <FieldDescription>
            图创建者固定保留 Owner，不能降级或移除；成员按加入时间从早到晚排列。
          </FieldDescription>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ErDiagramListPage({
  onEditGraph,
}: {
  onEditGraph: (graphId: string) => void
}) {
  const graphsQuery = useGraphsQuery()
  const createGraphMutation = useCreateGraphMutation()
  const updateGraphMutation = useUpdateGraphMetaMutation()
  const archiveGraphMutation = useArchiveGraphMutation()
  const upsertMemberMutation = useUpsertGraphMemberMutation()
  const removeMemberMutation = useRemoveGraphMemberMutation()
  const [filters, setFilters] = useUrlSearchState(
    parseGraphFilters,
    serializeGraphFilters,
  )
  const [sorting, setSorting] = useState<SortingState>(() =>
    sortingFromParam(filters.sort),
  )
  const [formMode, setFormMode] = useState<GraphFormMode | null>(null)
  const [formInitialValues, setFormInitialValues] =
    useState<GraphMetaFormValues>(() => defaultCreateValues())
  const [editingGraph, setEditingGraph] = useState<GraphMeta | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<GraphMeta | null>(null)
  const [sharingGraph, setSharingGraph] = useState<GraphMeta | null>(null)
  const membersQuery = useGraphMembersQuery(sharingGraph?.id ?? null, {
    enabled: sharingGraph != null,
  })
  const pageError =
    graphsQuery.error ??
    createGraphMutation.error ??
    updateGraphMutation.error ??
    archiveGraphMutation.error
  const memberError =
    membersQuery.error ??
    upsertMemberMutation.error ??
    removeMemberMutation.error

  useEffect(() => {
    setSorting(sortingFromParam(filters.sort))
  }, [filters.sort])

  const graphs = graphsQuery.data ?? []
  const domainOptions = useMemo(() => {
    const domains = new Set<string>()
    graphs.forEach((graph) => {
      if (graph.business_domain?.trim())
        domains.add(graph.business_domain.trim())
    })
    return Array.from(domains).sort((a, b) => a.localeCompare(b))
  }, [graphs])
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    graphs.forEach((graph) => statuses.add(graph.status))
    return Array.from(statuses).sort((a, b) => a.localeCompare(b))
  }, [graphs])
  const filteredGraphs = useMemo(() => {
    const query = filters.q?.trim().toLocaleLowerCase() ?? ''
    return graphs.filter((graph) => {
      if (query && !getSearchText(graph).includes(query)) return false
      if (filters.domain && filters.domain !== 'all') {
        if ((graph.business_domain || '默认域') !== filters.domain) return false
      }
      if (
        filters.role &&
        filters.role !== 'all' &&
        effectiveGraphRole(graph) !== filters.role
      ) {
        return false
      }
      if (
        filters.status &&
        filters.status !== 'all' &&
        graph.status !== filters.status
      )
        return false
      return true
    })
  }, [filters.domain, filters.q, filters.role, filters.status, graphs])
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.max((filters.page ?? 1) - 1, 0),
      pageSize: filters.pageSize ?? 10,
    }),
    [filters.page, filters.pageSize],
  )
  const columns = useMemo(
    () => [
      graphColumnHelper.accessor('name', {
        header: ({ column }) => (
          <HeaderSortButton
            label="图名称"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 300,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Database className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.description || row.original.id}
              </div>
            </div>
          </div>
        ),
      }),
      graphColumnHelper.accessor((graph) => graph.business_domain || '默认域', {
        id: 'business_domain',
        header: ({ column }) => (
          <HeaderSortButton
            label="业务域"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 160,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground">
            {getValue()}
          </span>
        ),
      }),
      graphColumnHelper.accessor((graph) => graph.table_count ?? 0, {
        id: 'table_count',
        header: ({ column }) => (
          <HeaderSortButton
            label="表"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 90,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue()}</span>
        ),
      }),
      graphColumnHelper.accessor((graph) => graph.relation_count ?? 0, {
        id: 'relation_count',
        header: ({ column }) => (
          <HeaderSortButton
            label="关系"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 90,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue()}</span>
        ),
      }),
      graphColumnHelper.accessor('status', {
        header: '状态',
        size: 160,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{statusLabel(row.original.status)}</Badge>
            <Badge variant="secondary">
              {roleText[effectiveGraphRole(row.original)]}
            </Badge>
          </div>
        ),
      }),
      graphColumnHelper.accessor((graph) => graph.updated_at ?? '', {
        id: 'updated_at',
        header: ({ column }) => (
          <HeaderSortButton
            label="更新时间"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.updated_at
              ? formatDateTime(row.original.updated_at)
              : '-'}
          </span>
        ),
      }),
      graphColumnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        size: 150,
        cell: ({ row }) => {
          const graph = row.original
          const editable = canEditGraph(graph)
          const manageable = canManageGraph(graph)
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                size="xs"
                onClick={() => onEditGraph(graph.id)}
              >
                <ExternalLink className="size-3.5" />
                打开
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label="更多操作"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>操作</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {editable ? (
                      <DropdownMenuItem onClick={() => openEditDialog(graph)}>
                        <Edit3 className="size-4" />
                        编辑信息
                      </DropdownMenuItem>
                    ) : null}
                    {manageable ? (
                      <DropdownMenuItem onClick={() => setSharingGraph(graph)}>
                        <Users className="size-4" />
                        分享/成员
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                  {manageable ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setArchiveTarget(graph)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      }),
    ],
    [onEditGraph],
  )
  const table = useReactTable({
    data: filteredGraphs,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: (updater) => {
      const nextSorting =
        typeof updater === 'function' ? updater(sorting) : updater
      setSorting(nextSorting)
      setFilters({ sort: sortingToParam(nextSorting), page: 1 })
    },
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === 'function' ? updater(pagination) : updater
      setFilters({
        page: nextPagination.pageIndex + 1,
        pageSize: nextPagination.pageSize,
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const formPending =
    createGraphMutation.isPending || updateGraphMutation.isPending
  const memberPending =
    upsertMemberMutation.isPending || removeMemberMutation.isPending

  function openCreateDialog() {
    setEditingGraph(null)
    setFormInitialValues(defaultCreateValues())
    setFormMode('create')
  }

  function openEditDialog(graph: GraphMeta) {
    setEditingGraph(graph)
    setFormInitialValues(valuesFromGraph(graph))
    setFormMode('edit')
  }

  function closeFormDialog() {
    if (formPending) return
    setFormMode(null)
    setEditingGraph(null)
  }

  async function submitForm(values: GraphMetaFormSubmitValues) {
    const body = graphBodyFromValues(values)
    if (formMode === 'create') {
      const created = await createGraphMutation.mutateAsync(body)
      setFormMode(null)
      onEditGraph(created.id)
      return
    }
    if (formMode === 'edit' && editingGraph) {
      await updateGraphMutation.mutateAsync({ graphId: editingGraph.id, body })
      setFormMode(null)
      setEditingGraph(null)
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    await archiveGraphMutation.mutateAsync(archiveTarget.id)
    setArchiveTarget(null)
  }

  const upsertMember = useCallback(
    async (values: GraphMemberFormSubmitValues) => {
      if (!sharingGraph) return
      await upsertMemberMutation.mutateAsync({
        graphId: sharingGraph.id,
        body: values,
      })
    },
    [sharingGraph, upsertMemberMutation],
  )

  const removeMember = useCallback(
    async (member: GraphMember) => {
      if (!sharingGraph) return
      await removeMemberMutation.mutateAsync({
        graphId: sharingGraph.id,
        userId: member.user_id,
      })
    },
    [removeMemberMutation, sharingGraph],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">ER 图列表</h3>
          <p className="text-xs text-muted-foreground">
            按业务域管理数据结构关系
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => graphsQuery.refetch()}
            disabled={
              graphsQuery.isFetching ||
              formPending ||
              archiveGraphMutation.isPending
            }
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={formPending}>
            <Plus className="size-4" />
            新增画布
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {pageError ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {pageError instanceof Error ? pageError.message : '操作失败'}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_150px_150px_120px]">
          <Input
            value={filters.q ?? ''}
            onChange={(event) => setFilters({ q: event.target.value, page: 1 })}
            placeholder="搜索名称、描述、ID、业务域"
          />
          <Select
            value={filters.domain ?? 'all'}
            onValueChange={(value) => setFilters({ domain: value, page: 1 })}
          >
            <SelectTrigger aria-label="业务域筛选">
              <SelectValue placeholder="业务域" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部业务域</SelectItem>
                {domainOptions.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {domain}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.role ?? 'all'}
            onValueChange={(value) =>
              setFilters({ role: value as GraphRole | 'all', page: 1 })
            }
          >
            <SelectTrigger aria-label="角色筛选">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部角色</SelectItem>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={(value) => setFilters({ status: value, page: 1 })}
          >
            <SelectTrigger aria-label="状态筛选">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={String(filters.pageSize ?? 10)}
            onValueChange={(value) =>
              setFilters({ pageSize: Number(value), page: 1 })
            }
          >
            <SelectTrigger aria-label="分页大小">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {graphPageSizes.map((pageSize) => (
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
          loading={graphsQuery.isLoading}
          error={graphsQuery.error}
          minWidth={1090}
          emptyTitle="暂无 ER 图"
          emptyDescription="可以新建画布，或调整筛选条件。"
        />
        <DataTablePagination
          table={table}
          label={`共 ${filteredGraphs.length} 张 ER 图，当前显示 ${table.getRowModel().rows.length} 张`}
        />
      </div>

      {formMode ? (
        <GraphMetaDialog
          key={`${formMode}-${editingGraph?.id ?? 'new'}`}
          mode={formMode}
          initialValues={formInitialValues}
          onClose={closeFormDialog}
          onSubmit={submitForm}
          pending={formPending}
        />
      ) : null}

      {sharingGraph ? (
        <GraphMembersDialog
          graph={sharingGraph}
          members={membersQuery.data ?? []}
          error={memberError}
          loading={membersQuery.isLoading}
          pending={memberPending}
          onClose={() => {
            if (!memberPending) setSharingGraph(null)
          }}
          onUpsertMember={upsertMember}
          onRemoveMember={removeMember}
        />
      ) : null}

      <AlertDialog
        open={archiveTarget != null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 ER 图</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `将“${archiveTarget.name}”移出 ER 图列表。该操作为软删除，会保留数据库记录和历史数据。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveGraphMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={archiveGraphMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                void confirmArchive()
              }}
            >
              {archiveGraphMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
