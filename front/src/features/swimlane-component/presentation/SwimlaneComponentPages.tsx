import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Graph, type Cell, type Edge } from '@antv/x6'
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
  ArrowLeft,
  ArrowUpDown,
  Circle,
  Diamond,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Workflow,
  X,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BpmnSemanticJson,
  BusinessFlowNodeErRef,
  BusinessFlowNodeType,
  SwimlaneComponent,
  TaskUiContext,
} from '@/entities/business-flow'
import {
  BPMN_NODE_OPTIONS,
  bpmnSemanticDisplayName,
  edgeSemanticType,
  isDataBpmnElement,
  legacyNodeTypeForBpmn,
  mergeBpmnIntoProperties,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
  nodeSemanticType,
  normalizeBpmnSemantic,
  normalizeTaskUiContext,
  taskUiTaskName,
} from '@/entities/business-flow'
import {
  useArchiveSwimlaneComponentMutation,
  useCreateSwimlaneComponentMutation,
  usePublishSwimlaneComponentVersionMutation,
  useSaveSwimlaneComponentDraftMutation,
  useSwimlaneComponentQuery,
  useSwimlaneComponentsQuery,
  useUpdateSwimlaneComponentMutation,
} from '@/entities/business-flow/api'
import { useGraphsQuery } from '@/entities/er-graph/api'
import { useProductsQuery, type ProductMeta } from '@/entities/product'
import {
  createLocalId,
  getCurrentComponentVersion,
  newComponentNodeDraft,
} from '@/features/business-flow/domain/localBusinessFlowStore'
import {
  addComponentNode,
  bindBusinessFlowDeleteKeys,
  componentDraftFromGraph,
  createBusinessFlowGraph,
  defaultBpmnEdgeProfileForEdge,
  graphPointFromEvent,
  readCellData,
  removeBusinessFlowCells,
  renderComponentVersion,
  updateEdgeText,
  updateNodeText,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'
import { BpmnSemanticFields } from '@/features/business-flow/presentation/components/BpmnSemanticFields'
import {
  TaskUiContextFields,
} from '@/features/business-flow/presentation/components/TaskUiContextFields'
import {
  NodeErBindingEditor,
  type ErGraphOption,
} from '@/features/business-flow/presentation/components/NodeErBindingEditor'
import { formatDateTime } from '@/shared/lib/date'
import { DataTable, DataTablePagination } from '@/shared/ui/data-table'
import { EntityTitleCell } from '@/shared/ui/entity-title-cell'

const NODE_TOOLS = BPMN_NODE_OPTIONS.map((option) => ({
  ...option,
  icon:
    option.group === '事件'
      ? Circle
      : option.group === '网关'
        ? Diamond
        : option.group === '数据'
          ? Pencil
          : option.profile.bpmnElementType === 'SUB_PROCESS'
            ? Workflow
            : Square,
}))

type SelectedComponentCell =
  | {
      kind: 'node'
      cell: Cell
      title: string
      bpmnProfile: BpmnNodeProfile
      bpmnSemanticJson: BpmnSemanticJson | null
      taskUiJson: TaskUiContext | null
      erRefs: BusinessFlowNodeErRef[]
    }
  | {
      kind: 'edge'
      cell: Edge
      label: string
      bpmnProfile: BpmnEdgeProfile
      bpmnSemanticJson: BpmnSemanticJson
    }
  | null

const componentPageSizes = [10, 20, 50]
const componentColumnHelper = createColumnHelper<SwimlaneComponent>()
const BPMN_NODE_PROFILE_MIME = 'application/x-bpmn-node-profile'

type SwimlaneComponentFormMode = 'create' | 'edit'
type SwimlaneComponentFormValues = z.input<typeof swimlaneComponentFormSchema>
type SwimlaneComponentFormSubmitValues = z.output<typeof swimlaneComponentFormSchema>

const swimlaneComponentFormSchema = z.object({
  productId: z.string().trim().min(1, '请选择产品'),
  code: z
    .string()
    .trim()
    .min(1, '请输入组件标识')
    .max(120, '标识不能超过 120 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '标识只能包含字母、数字、下划线和短横线'),
  name: z
    .string()
    .trim()
    .min(1, '请输入名称')
    .max(120, '名称不能超过 120 个字符'),
  category: z.string().trim().max(120, '分类不能超过 120 个字符').optional(),
  ownerRole: z.string().trim().max(120, '负责角色不能超过 120 个字符').optional(),
  description: z.string().trim().max(500, '描述不能超过 500 个字符').optional(),
})

function defaultComponentCode() {
  return `swimlane_${Date.now()}`
}

function defaultCreateValues(productId = ''): SwimlaneComponentFormValues {
  return {
    productId,
    code: defaultComponentCode(),
    name: '新泳道组件',
    category: '自定义',
    ownerRole: '业务系统',
    description: '',
  }
}

function valuesFromComponent(component: SwimlaneComponent): SwimlaneComponentFormValues {
  return {
    productId: component.productId,
    code: component.code,
    name: component.name,
    category: component.category ?? '',
    ownerRole: component.ownerRole ?? '',
    description: component.description ?? '',
  }
}

function componentSearchText(component: SwimlaneComponent, productName?: string) {
  return [
    component.id,
    component.code,
    component.name,
    component.category,
    component.ownerRole,
    component.description,
    productName,
    component.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function readDraggedNodeProfile(event: React.DragEvent<HTMLDivElement>) {
  const rawProfile = event.dataTransfer.getData(BPMN_NODE_PROFILE_MIME)
  if (rawProfile) {
    try {
      return normalizeBpmnNodeProfile(JSON.parse(rawProfile) as Partial<BpmnNodeProfile>)
    } catch {
      return normalizeBpmnNodeProfile({})
    }
  }
  const legacyType = event.dataTransfer.getData('application/x-bf-node') as BusinessFlowNodeType
  return legacyType ? normalizeBpmnNodeProfile({ nodeType: legacyType }) : null
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

function SwimlaneComponentMetaDialog({
  initialValues,
  mode,
  onClose,
  onSubmit,
  pending,
  products,
}: {
  initialValues: SwimlaneComponentFormValues
  mode: SwimlaneComponentFormMode
  onClose: () => void
  onSubmit: (values: SwimlaneComponentFormSubmitValues) => Promise<void>
  pending: boolean
  products: ProductMeta[]
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: swimlaneComponentFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(swimlaneComponentFormSchema.parse(value))
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增泳道组件' : '编辑泳道组件'}</DialogTitle>
          <DialogDescription>
            维护泳道组件元数据；流程节点和连线在组件画布中编辑。
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
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>产品</FieldLabel>
                    <Select
                      value={field.state.value}
                      disabled={pending || products.length === 0}
                      onValueChange={(value) => field.handleChange(value)}
                    >
                      <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                        <SelectValue placeholder="选择启用产品" />
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
                    {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="code"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>组件标识</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      disabled={pending || mode === 'edit'}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
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
                      disabled={pending}
                      autoFocus
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
            <form.Field
              name="category"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>分类</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ''}
                    disabled={pending}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            />
            <form.Field
              name="ownerRole"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>负责角色</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ''}
                    disabled={pending}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
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
                      disabled={pending}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
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
            <Button type="submit" disabled={pending || products.length === 0}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SwimlaneComponentListPage({
  onCreate,
  onEdit,
}: {
  onCreate: (componentId: string) => void
  onEdit: (componentId: string) => void
}) {
  const productsQuery = useProductsQuery()
  const [query, setQuery] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [formMode, setFormMode] = useState<SwimlaneComponentFormMode | null>(null)
  const [editingComponent, setEditingComponent] = useState<SwimlaneComponent | null>(null)
  const [formInitialValues, setFormInitialValues] = useState<SwimlaneComponentFormValues>(() =>
    defaultCreateValues(),
  )
  const [deleteTarget, setDeleteTarget] = useState<SwimlaneComponent | null>(null)
  const products = productsQuery.data ?? []
  const componentsQuery = useSwimlaneComponentsQuery(productFilter)
  const createMutation = useCreateSwimlaneComponentMutation(productFilter === 'all' ? undefined : productFilter)
  const updateMutation = useUpdateSwimlaneComponentMutation(productFilter === 'all' ? undefined : productFilter)
  const archiveMutation = useArchiveSwimlaneComponentMutation(productFilter === 'all' ? undefined : productFilter)
  const components = componentsQuery.data ?? []
  const formPending = createMutation.isPending || updateMutation.isPending
  const productNameById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  )
  const filteredComponents = useMemo(
    () => {
      const keyword = query.trim().toLocaleLowerCase()
      return components.filter((component) => {
        if (productFilter !== 'all' && component.productId !== productFilter) return false
        if (!keyword) return true
        return componentSearchText(component, productNameById.get(component.productId)).includes(keyword)
      })
    },
    [components, productFilter, productNameById, query],
  )

  const columns = useMemo(
    () => [
      componentColumnHelper.accessor('name', {
        header: ({ column }) => (
          <HeaderSortButton
            label="组件名称"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 300,
        cell: ({ row }) => {
          const component = row.original
          return (
            <EntityTitleCell
              icon={<Workflow className="size-4" />}
              title={component.name}
              description={component.description || component.code}
            />
          )
        },
      }),
      componentColumnHelper.accessor((component) => productNameById.get(component.productId) || '未分配产品', {
        id: 'product',
        header: ({ column }) => (
          <HeaderSortButton
            label="产品"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 180,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground">{getValue()}</span>
        ),
      }),
      componentColumnHelper.accessor((component) => component.category || '未分类', {
        id: 'category',
        header: ({ column }) => (
          <HeaderSortButton
            label="分类"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 150,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground">{getValue()}</span>
        ),
      }),
      componentColumnHelper.accessor((component) => component.ownerRole || '未设置', {
        id: 'ownerRole',
        header: '负责角色',
        size: 150,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground">{getValue()}</span>
        ),
      }),
      componentColumnHelper.display({
        id: 'version',
        header: '版本 / 内容',
        size: 160,
        cell: ({ row }) => {
          const version = getCurrentComponentVersion(row.original)
          return (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">v{version?.versionNo ?? row.original.currentVersionNo}</Badge>
              <Badge variant="secondary">{version?.nodes.length ?? 0} 节点</Badge>
              <Badge variant="secondary">{version?.edges.length ?? 0} 线</Badge>
            </div>
          )
        },
      }),
      componentColumnHelper.accessor('updatedAt', {
        header: ({ column }) => (
          <HeaderSortButton
            label="更新时间"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        size: 150,
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(getValue())}</span>
        ),
      }),
      componentColumnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        size: 150,
        cell: ({ row }) => {
          const component = row.original
          return (
            <div className="flex justify-end gap-1">
              <Button type="button" size="xs" onClick={() => onEdit(component.id)}>
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
                    <DropdownMenuItem onClick={() => openEditDialog(component)}>
                      <Pencil className="size-4" />
                      编辑信息
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(component)}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      }),
    ],
    [onEdit, productNameById],
  )

  const table = useReactTable({
    data: filteredComponents,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  function refreshComponents() {
    void componentsQuery.refetch()
  }

  function openCreateDialog() {
    const selectedProductId =
      productFilter !== 'all' ? productFilter : products[0]?.id ?? ''
    setEditingComponent(null)
    setFormInitialValues(defaultCreateValues(selectedProductId))
    setFormMode('create')
  }

  function openEditDialog(component: SwimlaneComponent) {
    setEditingComponent(component)
    setFormInitialValues(valuesFromComponent(component))
    setFormMode('edit')
  }

  async function submitForm(values: SwimlaneComponentFormSubmitValues) {
    if (formMode === 'create') {
      const component = await createMutation.mutateAsync({
        productId: values.productId,
        code: values.code,
        name: values.name,
        category: values.category || null,
        ownerRole: values.ownerRole || null,
        description: values.description || null,
      })
      refreshComponents()
      setFormMode(null)
      onCreate(component.id)
      return
    }
    if (formMode === 'edit' && editingComponent) {
      await updateMutation.mutateAsync({
        componentId: editingComponent.id,
        body: {
        code: values.code,
        name: values.name,
        category: values.category || null,
        ownerRole: values.ownerRole || null,
        description: values.description || null,
        },
      })
      refreshComponents()
      setFormMode(null)
      setEditingComponent(null)
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return
    archiveMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        refreshComponents()
        setDeleteTarget(null)
      },
    })
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">泳道组件</h3>
          <p className="text-xs text-muted-foreground">
            预画可复用流程组件，业务图中拖入后生成独立实例。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshComponents}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={products.length === 0}>
            <Plus className="size-4" />
            新建组件
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {productsQuery.error ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {productsQuery.error instanceof Error ? productsQuery.error.message : '产品加载失败'}
          </div>
        ) : null}
        {componentsQuery.error ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {componentsQuery.error instanceof Error ? componentsQuery.error.message : '泳道组件加载失败'}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_120px]">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
            }}
            placeholder="搜索名称、标识、产品、分类、角色"
          />
          <Select
            value={productFilter}
            onValueChange={(value) => {
              setProductFilter(value)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
            }}
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
            value={String(pagination.pageSize)}
            onValueChange={(value) =>
              setPagination({ pageIndex: 0, pageSize: Number(value) })
            }
          >
            <SelectTrigger aria-label="分页大小">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {componentPageSizes.map((pageSize) => (
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
          loading={productsQuery.isLoading || componentsQuery.isLoading}
          minWidth={1120}
          emptyTitle="暂无泳道组件"
          emptyDescription="可以新建泳道组件，或调整筛选条件。"
        />
        <DataTablePagination
          table={table}
          label={`共 ${filteredComponents.length} 个泳道组件，当前显示 ${table.getRowModel().rows.length} 个`}
        />
      </div>

      {formMode ? (
        <SwimlaneComponentMetaDialog
          key={`${formMode}-${editingComponent?.id ?? 'new'}`}
          mode={formMode}
          initialValues={formInitialValues}
          pending={formPending}
          products={products}
          onClose={() => {
            setFormMode(null)
            setEditingComponent(null)
          }}
          onSubmit={submitForm}
        />
      ) : null}

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除泳道组件？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除“{deleteTarget?.name}”及其本地版本数据。已实例化到业务图中的泳道不会自动清理。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={archiveMutation.isPending}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export function SwimlaneComponentEditorPage({
  componentId,
  onBack,
}: {
  componentId: string
  onBack: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const componentQuery = useSwimlaneComponentQuery(componentId)
  const saveDraftMutation = useSaveSwimlaneComponentDraftMutation()
  const publishMutation = usePublishSwimlaneComponentVersionMutation()
  const component = componentQuery.data ?? null
  const erGraphsQuery = useGraphsQuery(component?.productId ?? 'all')
  const erGraphOptions: ErGraphOption[] = (erGraphsQuery.data ?? []).map(
    (graph) => ({ id: graph.id, name: graph.name }),
  )
  const currentVersion = component
    ? component.versions.find((version) => version.status === 'DRAFT')
      ?? getCurrentComponentVersion(component)
    : null
  const [selected, setSelected] = useState<SelectedComponentCell>(null)
  const selectedRef = useRef<SelectedComponentCell>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    setSavedAt(null)
    setSelected(null)
  }, [componentId])

  const removeSelectedCell = useCallback(() => {
    const graph = graphRef.current
    const cell = selectedRef.current?.cell
    if (!graph || !cell) return
    const removedCells = removeBusinessFlowCells(graph, [cell])
    if (!removedCells.length) return
    setSelected(null)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !currentVersion) return
    const graph = createBusinessFlowGraph(containerRef.current)
    graphRef.current = graph
    renderComponentVersion(graph, currentVersion)

    graph.on('cell:click', ({ cell }) => setSelected(readSelectedCell(cell)))
    graph.on('blank:click', () => setSelected(null))
    graph.on('edge:connected', ({ edge }) => {
      const bpmnProfile = defaultBpmnEdgeProfileForEdge(edge)
      edge.setData({
        ...readCellData(edge),
        cellRole: 'COMPONENT_EDGE',
        edgeKey: readCellData(edge).edgeKey ?? createLocalId('cmp_edge'),
        edgeType: bpmnProfile.bpmnFlowType === 'ASSOCIATION' ? 'ASSOCIATION' : 'SEQUENCE',
        ...bpmnProfile,
        propertiesJson: mergeBpmnIntoProperties(readCellData(edge).propertiesJson, bpmnProfile),
        title: '',
      })
      setSelected(readSelectedCell(edge))
    })
    const unbindDeleteKeys = bindBusinessFlowDeleteKeys(graph, {
      getFallbackCell: () => selectedRef.current?.cell ?? null,
      onDeleted: () => setSelected(null),
    })
    return () => {
      unbindDeleteKeys()
      graph.dispose()
      graphRef.current = null
    }
  }, [componentId, currentVersion?.id])

  if (!component || !currentVersion) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {componentQuery.isLoading ? '正在加载泳道组件...' : '未找到泳道组件'}
      </section>
    )
  }

  function dropNode(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const graph = graphRef.current
    if (!graph) return
    const profile = readDraggedNodeProfile(event)
    if (!profile) return
    const point = graphPointFromEvent(graph, event.nativeEvent)
    const draft = newComponentNodeDraft(profile, { x: point.x - 60, y: point.y - 24 })
    const node = addComponentNode(graph, draft)
    graph.cleanSelection()
    graph.select(node)
  }

  function buildVersionBody() {
    const graph = graphRef.current
    if (!graph || !component) return null
    const draft = componentDraftFromGraph(graph)
    return {
      name: component.name,
      category: component.category,
      ownerRole: component.ownerRole,
      description: component.description,
      nodes: draft.nodes,
      edges: draft.edges,
    }
  }

  async function saveComponent() {
    const body = buildVersionBody()
    if (!body) return
    await saveDraftMutation.mutateAsync({ componentId, body })
    setSavedAt(new Date().toLocaleTimeString())
  }

  async function publishComponent() {
    const body = buildVersionBody()
    if (!body) return
    await publishMutation.mutateAsync({ componentId, body })
    setSavedAt(new Date().toLocaleTimeString())
  }

  return (
    <section className="business-flow-x6-workbench flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            返回
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="truncate text-xs text-muted-foreground">{component.id}</div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <span className="text-xs text-muted-foreground">已保存 {savedAt}</span> : null}
          <Button size="sm" variant="outline" onClick={saveComponent} disabled={saveDraftMutation.isPending}>
            <Save className="size-4" />
            保存草稿
          </Button>
          <Button size="sm" onClick={publishComponent} disabled={publishMutation.isPending}>
            <Save className="size-4" />
            发布
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-border bg-card">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              <div>
                <div className="text-xs font-semibold">节点工具箱</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {NODE_TOOLS.map((tool) => {
                    const Icon = tool.icon
                    return (
                      <button
                        key={tool.key}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            BPMN_NODE_PROFILE_MIME,
                            JSON.stringify(tool.profile),
                          )
                          event.dataTransfer.setData(
                            'application/x-bf-node',
                            legacyNodeTypeForBpmn(tool.profile),
                          )
                          event.dataTransfer.effectAllowed = 'copy'
                        }}
                        className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background text-xs transition-colors hover:border-primary/60 hover:bg-accent"
                      >
                        <Icon className="size-4 text-primary" />
                        <span>{tool.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {tool.group}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div>拖节点到画布，使用节点四周端口连线。</div>
                <div>保存后会覆盖当前本地组件版本。</div>
              </div>
            </div>
          </ScrollArea>
        </aside>
        <section className="flex min-h-0 min-w-0">
          <div
            className="min-h-0 min-w-0 flex-1"
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropNode}
          >
            <div ref={containerRef} className="h-full w-full" />
          </div>
          {selected ? (
            <ComponentInspectorDrawer
              selected={selected}
              erGraphs={erGraphOptions}
              onChange={setSelected}
              onDelete={removeSelectedCell}
              onClose={() => {
                graphRef.current?.cleanSelection()
                setSelected(null)
              }}
            />
          ) : null}
        </section>
      </div>
    </section>
  )
}

function ComponentInspectorDrawer({
  selected,
  erGraphs,
  onChange,
  onDelete,
  onClose,
}: {
  selected: Exclude<SelectedComponentCell, null>
  erGraphs: ErGraphOption[]
  onChange: (selected: SelectedComponentCell) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <ComponentPanelShell
      title={selected.kind === 'edge' ? '连线属性' : '节点属性'}
      action={
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
          删除
        </Button>
      }
      onClose={onClose}
    >
      <ComponentInspector selected={selected} erGraphs={erGraphs} onChange={onChange} />
    </ComponentPanelShell>
  )
}

function ComponentPanelShell({
  title,
  children,
  action,
  onClose,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  onClose: () => void
}) {
  return (
    <aside
      className="z-30 flex h-full min-h-0 w-[344px] shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-sm"
      role="complementary"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
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
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <section className="space-y-4 p-4">{children}</section>
      </ScrollArea>
    </aside>
  )
}

function outgoingFlowOptions(cell: Cell) {
  return (cell.model?.getConnectedEdges(cell) ?? [])
    .filter((edge) => edge.getSourceCellId() === cell.id)
    .map((edge) => {
      const data = readCellData(edge)
      const value = data.edgeKey ?? edge.id
      return { value, label: data.title || value }
    })
}

function ComponentInspector({
  selected,
  erGraphs,
  onChange,
}: {
  selected: SelectedComponentCell
  erGraphs: ErGraphOption[]
  onChange: (selected: SelectedComponentCell) => void
}) {
  if (!selected) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        选择节点或连线后编辑属性。
      </div>
    )
  }
  if (selected.kind === 'edge') {
    const semanticType = edgeSemanticType(selected.bpmnProfile)
    return (
      <BpmnSemanticFields
        value={selected.bpmnSemanticJson}
        semanticType={semanticType}
        onChange={(bpmnSemanticJson) => {
          const label = bpmnSemanticDisplayName(bpmnSemanticJson, selected.label)
          updateEdgeText(selected.cell, label)
          selected.cell.setData({
            ...readCellData(selected.cell),
            title: label,
            bpmnSemanticJson,
          })
          onChange({ ...selected, label, bpmnSemanticJson })
        }}
      />
    )
  }
  if (selected.bpmnProfile.bpmnElementType === 'TASK') {
    return (
      <div className="space-y-4">
        <div className="text-xs font-semibold">任务</div>
        <TaskUiContextFields
          value={selected.taskUiJson}
          fallbackTaskName={selected.title}
          onChange={(taskUiJson) => {
            const nextTaskUi = normalizeTaskUiContext(taskUiJson, { taskName: selected.title })
            const title = taskUiTaskName(nextTaskUi, selected.title || '任务')
            updateNodeText(selected.cell, title)
            selected.cell.setData({
              ...readCellData(selected.cell),
              title,
              taskUiJson: nextTaskUi,
            })
            onChange({
              ...selected,
              title,
              taskUiJson: nextTaskUi,
            })
          }}
        />
      </div>
    )
  }
  const semanticType = nodeSemanticType(selected.bpmnProfile)
  if (!semanticType || !selected.bpmnSemanticJson) return null
  return (
    <BpmnSemanticFields
      value={selected.bpmnSemanticJson}
      semanticType={semanticType}
      flowOptions={outgoingFlowOptions(selected.cell)}
      onChange={(bpmnSemanticJson) => {
        const title = bpmnSemanticDisplayName(bpmnSemanticJson, selected.title)
        updateNodeText(selected.cell, title)
        selected.cell.setData({
          ...readCellData(selected.cell),
          title,
          bpmnSemanticJson,
        })
        onChange({
          ...selected,
          title,
          bpmnSemanticJson,
        })
      }}
    >
      {isDataBpmnElement(selected.bpmnProfile.bpmnElementType) ? (
        <NodeErBindingEditor
          erRefs={selected.erRefs}
          erGraphs={erGraphs}
          onChange={(erRefs) => {
            selected.cell.setData({ ...readCellData(selected.cell), erRefs })
            onChange({ ...selected, erRefs })
          }}
        />
      ) : null}
    </BpmnSemanticFields>
  )
}

function readSelectedCell(cell: Cell): SelectedComponentCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    const bpmnProfile = normalizeBpmnEdgeProfile({
      edgeType: data.edgeType,
      bpmnFlowType: data.bpmnFlowType,
      bpmnSequenceFlowKind: data.bpmnSequenceFlowKind,
      propertiesJson: data.propertiesJson,
    })
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
      bpmnProfile,
      bpmnSemanticJson: normalizeBpmnSemantic(
        data.bpmnSemanticJson,
        edgeSemanticType(bpmnProfile),
        data.title ?? '',
      ),
    }
  }
  if (data.cellRole === 'COMPONENT_NODE') {
    const bpmnProfile = normalizeBpmnNodeProfile({
      nodeType: data.nodeType,
      bpmnElementType: data.bpmnElementType,
      bpmnEventKind: data.bpmnEventKind,
      bpmnEventDefinition: data.bpmnEventDefinition,
      bpmnTaskType: data.bpmnTaskType,
      bpmnGatewayType: data.bpmnGatewayType,
      bpmnSubProcessKind: data.bpmnSubProcessKind,
      propertiesJson: data.propertiesJson,
    })
    const semanticType = nodeSemanticType(bpmnProfile)
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      bpmnProfile,
      bpmnSemanticJson: semanticType
        ? normalizeBpmnSemantic(
            data.bpmnSemanticJson,
            semanticType,
            data.title ?? String(cell.attr('label/text') ?? ''),
          )
        : null,
      taskUiJson: bpmnProfile.bpmnElementType === 'TASK'
        ? normalizeTaskUiContext(data.taskUiJson, { taskName: data.title ?? String(cell.attr('label/text') ?? '') })
        : data.taskUiJson ?? null,
      erRefs: isDataBpmnElement(bpmnProfile.bpmnElementType) ? data.erRefs ?? [] : [],
    }
  }
  return null
}
