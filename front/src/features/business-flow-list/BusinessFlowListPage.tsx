import { useCallback, useMemo, useRef, useState } from 'react'
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
  Edit3,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  Waypoints,
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
  useArchiveBusinessFlowMutation,
  useBusinessFlowMembersQuery,
  useBusinessFlowMetasQuery,
  useCreateBusinessFlowMutation,
  useRemoveBusinessFlowMemberMutation,
  useUpdateBusinessFlowMutation,
  useUpsertBusinessFlowMemberMutation,
  type BusinessFlowMember,
  type BusinessFlowMeta,
  type BusinessFlowRole,
} from '@/entities/business-flow/api'
import { useProductsQuery, type ProductMeta } from '@/entities/product'
import { formatDateTime } from '@/shared/lib/date'
import { useUrlSearchState } from '@/shared/lib/useUrlSearchState'
import { DataTable, DataTablePagination } from '@/shared/ui/data-table'

const flowPageSizes = [10, 20, 50]
const flowColumnHelper = createColumnHelper<BusinessFlowMeta>()
const memberColumnHelper = createColumnHelper<BusinessFlowMember>()

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
}

const roleText: Record<BusinessFlowRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

const roleOptions: Array<{ value: BusinessFlowRole; label: string }> = [
  { value: 'viewer', label: 'Viewer 只读' },
  { value: 'editor', label: 'Editor 可编辑' },
  { value: 'owner', label: 'Owner 可管理' },
]

export type BusinessFlowListFilters = {
  q?: string
  productId?: string
  role?: BusinessFlowRole | 'all'
  status?: string
  page?: number
  pageSize?: number
  sort?: string
}

type BusinessFlowFormMode = 'create' | 'edit'
type BusinessFlowFormValues = z.input<typeof businessFlowMetaFormSchema>
type BusinessFlowFormSubmitValues = z.output<typeof businessFlowMetaFormSchema>
type BusinessFlowMemberFormSubmitValues = z.output<typeof businessFlowMemberFormSchema>

const businessFlowMetaFormSchema = z.object({
  productId: z.string().trim().optional(),
  code: z
    .string()
    .trim()
    .min(1, '请输入业务图标识')
    .max(120, '标识不能超过 120 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '标识只能包含字母、数字、下划线和短横线'),
  name: z
    .string()
    .trim()
    .min(1, '请输入名称')
    .max(120, '名称不能超过 120 个字符'),
  description: z.string().trim().max(500, '描述不能超过 500 个字符').optional(),
})

const businessFlowMemberFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入有效邮箱'),
  role: z.enum(['owner', 'editor', 'viewer']),
})

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBusinessFlowFilters(
  params: URLSearchParams,
): BusinessFlowListFilters {
  const pageSize = parsePositiveInteger(params.get('pageSize'), 10)
  const role = params.get('role')
  return {
    q: params.get('q') ?? '',
    productId: params.get('product') ?? 'all',
    role:
      role === 'owner' || role === 'editor' || role === 'viewer' ? role : 'all',
    status: params.get('status') ?? 'all',
    page: parsePositiveInteger(params.get('page'), 1),
    pageSize: flowPageSizes.includes(pageSize) ? pageSize : 10,
    sort: params.get('sort') ?? 'updated_at.desc',
  }
}

function serializeBusinessFlowFilters(filters: BusinessFlowListFilters) {
  const params = new URLSearchParams()
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.productId && filters.productId !== 'all')
    params.set('product', filters.productId)
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

function effectiveFlowRole(flow: BusinessFlowMeta): BusinessFlowRole {
  return flow.current_user_role ?? 'owner'
}

function canEditFlow(flow: BusinessFlowMeta) {
  const role = effectiveFlowRole(flow)
  return role === 'owner' || role === 'editor'
}

function canManageFlow(flow: BusinessFlowMeta) {
  return effectiveFlowRole(flow) === 'owner'
}

function statusLabel(status: string) {
  return statusText[status] ?? status
}

function flowSearchText(flow: BusinessFlowMeta) {
  return [
    flow.id,
    flow.product_name,
    flow.product_code,
    flow.code,
    flow.name,
    flow.description,
    flow.status,
    effectiveFlowRole(flow),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function defaultFlowCode() {
  return `business_flow_${Date.now()}`
}

function defaultCreateValues(productId = ''): BusinessFlowFormValues {
  return {
    productId,
    code: defaultFlowCode(),
    name: '新建业务图',
    description: '',
  }
}

function valuesFromFlow(flow: BusinessFlowMeta): BusinessFlowFormValues {
  return {
    productId: flow.product_id,
    code: flow.code,
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

function BusinessFlowMetaDialog({
  initialValues,
  mode,
  onClose,
  onSubmit,
  pending,
  products,
}: {
  initialValues: BusinessFlowFormValues
  mode: BusinessFlowFormMode
  onClose: () => void
  onSubmit: (values: BusinessFlowFormSubmitValues) => Promise<void>
  pending: boolean
  products: ProductMeta[]
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
          <DialogTitle>
            {mode === 'create' ? '新增业务图' : '编辑业务图信息'}
          </DialogTitle>
          <DialogDescription>
            维护新 Business Flow Context 的业务图元数据。
          </DialogDescription>
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
              name="productId"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>产品</FieldLabel>
                  <Select
                    value={field.state.value || products[0]?.id || ''}
                    disabled={mode === 'edit' || pending || products.length === 0}
                    onValueChange={(value) => field.handleChange(value)}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder="选择产品" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <form.Field
              name="code"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>标识</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      disabled={mode === 'edit' || pending}
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )
              }}
            />
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
                      disabled={pending}
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
                      disabled={pending}
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
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BusinessFlowMembersDialog({
  flow,
  members,
  error,
  loading,
  pending,
  onClose,
  onUpsertMember,
  onRemoveMember,
}: {
  flow: BusinessFlowMeta
  members: BusinessFlowMember[]
  error: unknown
  loading: boolean
  pending: boolean
  onClose: () => void
  onUpsertMember: (values: BusinessFlowMemberFormSubmitValues) => Promise<void>
  onRemoveMember: (member: BusinessFlowMember) => Promise<void>
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
      role: 'viewer' as BusinessFlowRole,
    },
    validators: {
      onSubmit: businessFlowMemberFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onUpsertMember(businessFlowMemberFormSchema.parse(value))
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
                  role: role as BusinessFlowRole,
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
          <DialogTitle>业务图成员 / 分享</DialogTitle>
          <DialogDescription className="truncate">
            {flow.name}
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
                      field.handleChange(value as BusinessFlowRole)
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
            业务图创建者固定保留 Owner，不能降级或移除；成员按加入时间从早到晚排列。
          </FieldDescription>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function BusinessFlowListPage({
  onOpenCanvas,
}: {
  onOpenCanvas?: (businessFlowId: string) => void
}) {
  const [filters, setFilters] = useUrlSearchState(
    parseBusinessFlowFilters,
    serializeBusinessFlowFilters,
  )
  const productsQuery = useProductsQuery()
  const selectedProductId = filters.productId ?? 'all'
  const flowsQuery = useBusinessFlowMetasQuery(selectedProductId)
  const createFlowMutation = useCreateBusinessFlowMutation(selectedProductId)
  const updateFlowMutation = useUpdateBusinessFlowMutation(selectedProductId)
  const archiveFlowMutation = useArchiveBusinessFlowMutation(selectedProductId)
  const upsertMemberMutation = useUpsertBusinessFlowMemberMutation()
  const removeMemberMutation = useRemoveBusinessFlowMemberMutation()
  const [sorting, setSorting] = useState<SortingState>(() =>
    sortingFromParam(filters.sort),
  )
  const [formMode, setFormMode] = useState<BusinessFlowFormMode | null>(null)
  const [editingFlow, setEditingFlow] = useState<BusinessFlowMeta | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<BusinessFlowMeta | null>(null)
  const [sharingFlow, setSharingFlow] = useState<BusinessFlowMeta | null>(null)
  const [formInitialValues, setFormInitialValues] =
    useState<BusinessFlowFormValues>(() => defaultCreateValues())
  const membersQuery = useBusinessFlowMembersQuery(sharingFlow?.id ?? null, {
    enabled: sharingFlow != null,
  })
  const pageError =
    flowsQuery.error ??
    createFlowMutation.error ??
    updateFlowMutation.error ??
    archiveFlowMutation.error
  const memberError =
    membersQuery.error ??
    upsertMemberMutation.error ??
    removeMemberMutation.error

  const flows = flowsQuery.data ?? []
  const products = productsQuery.data ?? []
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    flows.forEach((flow) => statuses.add(flow.status))
    return Array.from(statuses).sort((a, b) => a.localeCompare(b))
  }, [flows])
  const filteredFlows = useMemo(() => {
    const query = filters.q?.trim().toLocaleLowerCase() ?? ''
    return flows.filter((flow) => {
      if (query && !flowSearchText(flow).includes(query)) return false
      if (
        filters.role &&
        filters.role !== 'all' &&
        effectiveFlowRole(flow) !== filters.role
      ) {
        return false
      }
      if (
        filters.status &&
        filters.status !== 'all' &&
        flow.status !== filters.status
      ) {
        return false
      }
      return true
    })
  }, [filters.q, filters.role, filters.status, flows])
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
        size: 300,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Network className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.description || row.original.code}
              </div>
            </div>
          </div>
        ),
      }),
      flowColumnHelper.accessor((flow) => flow.product_name || '未分配产品', {
        id: 'product',
        header: ({ column }) => (
          <HeaderSortButton
            label="产品"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 160,
        cell: ({ row, getValue }) => (
          <div className="min-w-0">
            <div className="truncate text-muted-foreground">{getValue()}</div>
            {row.original.product_code ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.product_code}
              </div>
            ) : null}
          </div>
        ),
      }),
      flowColumnHelper.accessor('code', {
        header: ({ column }) => (
          <HeaderSortButton
            label="标识"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 180,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground">
            {getValue()}
          </span>
        ),
      }),
      flowColumnHelper.accessor('lane_instance_count', {
        header: ({ column }) => (
          <HeaderSortButton
            label="泳道"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 90,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor('node_count', {
        header: ({ column }) => (
          <HeaderSortButton
            label="节点"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 90,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor('edge_count', {
        header: ({ column }) => (
          <HeaderSortButton
            label="边"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 90,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      flowColumnHelper.accessor('status', {
        header: '状态',
        size: 160,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{statusLabel(row.original.status)}</Badge>
            <Badge variant="secondary">
              {roleText[effectiveFlowRole(row.original)]}
            </Badge>
          </div>
        ),
      }),
      flowColumnHelper.accessor((flow) => flow.updated_at ?? '', {
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
      flowColumnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        size: 140,
        cell: ({ row }) => {
          const flow = row.original
          const editable = canEditFlow(flow)
          const manageable = canManageFlow(flow)
          return (
            <div className="flex justify-end">
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
                    <DropdownMenuItem onClick={() => onOpenCanvas?.(flow.id)}>
                      <Waypoints className="size-4" />
                      打开画布
                    </DropdownMenuItem>
                    {editable ? (
                      <DropdownMenuItem onClick={() => openEditDialog(flow)}>
                        <Edit3 className="size-4" />
                        编辑信息
                      </DropdownMenuItem>
                    ) : null}
                    {manageable ? (
                      <DropdownMenuItem onClick={() => setSharingFlow(flow)}>
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
                        onClick={() => setArchiveTarget(flow)}
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
    createFlowMutation.isPending || updateFlowMutation.isPending
  const memberPending =
    upsertMemberMutation.isPending || removeMemberMutation.isPending

  function openCreateDialog() {
    setEditingFlow(null)
    const productId =
      selectedProductId !== 'all' ? selectedProductId : products[0]?.id ?? ''
    setFormInitialValues(defaultCreateValues(productId))
    setFormMode('create')
  }

  function openEditDialog(flow: BusinessFlowMeta) {
    setEditingFlow(flow)
    setFormInitialValues(valuesFromFlow(flow))
    setFormMode('edit')
  }

  function closeDialog() {
    if (formPending) return
    setFormMode(null)
    setEditingFlow(null)
  }

  async function submitFlow(values: BusinessFlowFormSubmitValues) {
    if (formMode === 'create') {
      await createFlowMutation.mutateAsync({
        product_id: values.productId || null,
        code: values.code,
        name: values.name,
        description: values.description || null,
      })
      setFormMode(null)
      return
    }
    if (formMode === 'edit' && editingFlow) {
      await updateFlowMutation.mutateAsync({
        businessFlowId: editingFlow.id,
        body: {
          name: values.name,
          description: values.description || null,
        },
      })
      setFormMode(null)
      setEditingFlow(null)
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    await archiveFlowMutation.mutateAsync(archiveTarget.id)
    setArchiveTarget(null)
  }

  const upsertMember = useCallback(
    async (values: BusinessFlowMemberFormSubmitValues) => {
      if (!sharingFlow) return
      await upsertMemberMutation.mutateAsync({
        businessFlowId: sharingFlow.id,
        body: values,
      })
    },
    [sharingFlow, upsertMemberMutation],
  )

  const removeMember = useCallback(
    async (member: BusinessFlowMember) => {
      if (!sharingFlow) return
      await removeMemberMutation.mutateAsync({
        businessFlowId: sharingFlow.id,
        userId: member.user_id,
      })
    },
    [removeMemberMutation, sharingFlow],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">业务图列表</h3>
          <p className="text-xs text-muted-foreground">
            基于可复用泳道组件组合业务流程
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => flowsQuery.refetch()}
            disabled={
              flowsQuery.isFetching ||
              formPending ||
              archiveFlowMutation.isPending
            }
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={openCreateDialog}
            disabled={formPending}
          >
            <Plus className="size-4" />
            新增业务图
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
            placeholder="搜索业务图名称、描述、标识、产品、ID"
          />
          <Select
            value={filters.productId ?? 'all'}
            onValueChange={(value) => setFilters({ productId: value, page: 1 })}
          >
            <SelectTrigger aria-label="产品筛选">
              <SelectValue placeholder="产品" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部产品</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.role ?? 'all'}
            onValueChange={(value) =>
              setFilters({ role: value as BusinessFlowRole | 'all', page: 1 })
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
          minWidth={1100}
          emptyTitle="暂无业务图"
          emptyDescription="可以新建业务图，后续在编辑器中组合泳道组件。"
        />
        <DataTablePagination
          table={table}
          label={`共 ${filteredFlows.length} 张业务图，当前显示 ${table.getRowModel().rows.length} 张`}
        />
      </div>

      {formMode ? (
        <BusinessFlowMetaDialog
          key={`${formMode}-${editingFlow?.id ?? 'new'}`}
          mode={formMode}
          initialValues={formInitialValues}
          pending={formPending}
          products={products}
          onClose={closeDialog}
          onSubmit={submitFlow}
        />
      ) : null}

      {sharingFlow ? (
        <BusinessFlowMembersDialog
          flow={sharingFlow}
          members={membersQuery.data ?? []}
          error={memberError}
          loading={membersQuery.isLoading}
          pending={memberPending}
          onClose={() => {
            if (!memberPending) setSharingFlow(null)
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
            <AlertDialogTitle>删除业务图</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `将“${archiveTarget.name}”移出业务图列表。该操作为软删除，会保留数据库记录和后续历史数据。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveFlowMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={archiveFlowMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                void confirmArchive()
              }}
            >
              {archiveFlowMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
