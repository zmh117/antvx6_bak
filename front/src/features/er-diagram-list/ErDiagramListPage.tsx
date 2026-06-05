import type { FormEvent } from 'react'
import { useState } from 'react'
import {
  AlertCircle,
  Database,
  Edit3,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

const selectClassName =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

type GraphFormMode = 'create' | 'edit'

type GraphFormValues = {
  name: string
  businessDomain: string
  description: string
}

function statusLabel(status: string) {
  return statusText[status] ?? status
}

function effectiveGraphRole(graph: GraphMeta): GraphRole {
  return graph.current_user_role ?? 'owner'
}

function roleLabel(graph: GraphMeta) {
  return roleText[effectiveGraphRole(graph)]
}

function canEditGraph(graph: GraphMeta) {
  const role = effectiveGraphRole(graph)
  return role === 'owner' || role === 'editor'
}

function canManageGraph(graph: GraphMeta) {
  return effectiveGraphRole(graph) === 'owner'
}

function defaultCreateValues(): GraphFormValues {
  return {
    name: `新建 ER 图 ${formatDateTime(new Date().toISOString())}`,
    businessDomain: '默认域',
    description: '',
  }
}

function valuesFromGraph(graph: GraphMeta): GraphFormValues {
  return {
    name: graph.name,
    businessDomain: graph.business_domain ?? '',
    description: graph.description ?? '',
  }
}

function graphBodyFromValues(values: GraphFormValues) {
  return {
    name: values.name.trim(),
    business_domain: values.businessDomain.trim() || null,
    description: values.description.trim() || null,
  }
}

function GraphFormDialog({
  mode,
  onClose,
  onSubmit,
  pending,
  values,
  setValues,
}: {
  mode: GraphFormMode
  onClose: () => void
  onSubmit: () => Promise<void>
  pending: boolean
  values: GraphFormValues
  setValues: (values: GraphFormValues) => void
}) {
  const title = mode === 'create' ? '新增画布' : '编辑画布信息'
  const submitText = mode === 'create' ? '创建并打开' : '保存'
  const disabled = pending || !values.name.trim()

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    await onSubmit()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <form
        className="grid w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-5 shadow-lg"
        onSubmit={onFormSubmit}
      >
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">维护 ER 图的业务元数据。</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="graph-name">名称</Label>
          <Input
            id="graph-name"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            autoFocus
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="graph-domain">业务域</Label>
          <Input
            id="graph-domain"
            value={values.businessDomain}
            onChange={(event) => setValues({ ...values, businessDomain: event.target.value })}
            placeholder="例如：订单域"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="graph-description">描述</Label>
          <Textarea
            id="graph-description"
            className="min-h-24 resize-none"
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            placeholder="说明这张 ER 图覆盖的业务范围"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button type="submit" disabled={disabled}>
            {pending ? '处理中...' : submitText}
          </Button>
        </div>
      </form>
    </div>
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
  onUpsertMember: (email: string, role: GraphRole) => Promise<void>
  onRemoveMember: (member: GraphMember) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<GraphRole>('viewer')
  const ownerCount = members.filter((member) => member.role === 'owner').length
  const disabled = pending || !email.trim()

  const submitMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    await onUpsertMember(email, role)
    setEmail('')
    setRole('viewer')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 px-4 py-8">
      <div className="grid w-full max-w-3xl gap-4 rounded-lg border border-border bg-background p-5 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold">图成员 / 分享</h3>
            <p className="truncate text-sm text-muted-foreground">{graph.name}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            关闭
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error instanceof Error ? error.message : '成员操作失败'}
          </div>
        ) : null}

        <form
          className="grid grid-cols-1 items-end gap-2 md:grid-cols-[minmax(220px,1fr)_150px_auto]"
          onSubmit={submitMember}
        >
          <div className="grid gap-2">
            <Label htmlFor="member-email">用户邮箱</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              disabled={pending}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-role">角色</Label>
            <select
              id="member-role"
              className={selectClassName}
              value={role}
              disabled={pending}
              onChange={(event) => setRole(event.target.value as GraphRole)}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={disabled}>
            <UserPlus className="size-4" />
            添加/更新
          </Button>
        </form>

        <div className="overflow-x-auto rounded-md border border-border">
          <div className="min-w-[560px]">
            <div className="grid h-9 grid-cols-[minmax(220px,1fr)_150px_170px] items-center gap-3 border-b border-border bg-muted/50 px-3 text-xs font-medium text-muted-foreground">
              <div>成员</div>
              <div>角色</div>
              <div className="text-right">操作</div>
            </div>
            {loading ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">加载成员中...</div>
            ) : members.length ? (
              members.map((member) => {
                const isLastOwner = member.role === 'owner' && ownerCount <= 1
                return (
                  <div
                    key={member.user_id}
                    className="grid min-h-12 grid-cols-[minmax(220px,1fr)_150px_170px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{member.display_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                    </div>
                    <select
                      className={selectClassName}
                      value={member.role}
                      disabled={pending || isLastOwner}
                      onChange={(event) => {
                        void onUpsertMember(member.email, event.target.value as GraphRole)
                      }}
                    >
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={pending || isLastOwner}
                        onClick={() => {
                          void onRemoveMember(member)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        移除
                      </Button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-6 text-sm text-muted-foreground">暂无成员</div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          最后一个 Owner 不能被降级或移除；只有已注册且启用的用户可以加入。
        </p>
      </div>
    </div>
  )
}

function GraphRow({
  graph,
  onArchiveGraph,
  onEditGraphMeta,
  onOpenGraph,
  onShareGraph,
}: {
  graph: GraphMeta
  onArchiveGraph: (graph: GraphMeta) => void
  onEditGraphMeta: (graph: GraphMeta) => void
  onOpenGraph: (graphId: string) => void
  onShareGraph: (graph: GraphMeta) => void
}) {
  const editable = canEditGraph(graph)
  const manageable = canManageGraph(graph)

  return (
    <div className="grid min-h-14 grid-cols-[minmax(220px,1.5fr)_minmax(120px,0.8fr)_90px_90px_130px_120px_260px] items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Database className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{graph.name}</div>
          <div className="truncate text-xs text-muted-foreground">{graph.description || graph.id}</div>
        </div>
      </div>
      <div className="truncate text-muted-foreground">{graph.business_domain || '默认域'}</div>
      <div className="tabular-nums">{graph.table_count ?? 0}</div>
      <div className="tabular-nums">{graph.relation_count ?? 0}</div>
      <div>
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex h-6 items-center rounded-md border border-border px-2 text-xs">
            {statusLabel(graph.status)}
          </span>
          <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted/60 px-2 text-xs">
            {roleLabel(graph)}
          </span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{formatDateTime(graph.updated_at)}</div>
      <div className="flex justify-end gap-1">
        <Button size="xs" onClick={() => onOpenGraph(graph.id)}>
          <ExternalLink className="size-3.5" />
          打开
        </Button>
        {editable ? (
          <Button size="xs" variant="outline" onClick={() => onEditGraphMeta(graph)}>
            <Edit3 className="size-3.5" />
            编辑
          </Button>
        ) : null}
        {manageable ? (
          <Button size="xs" variant="outline" onClick={() => onShareGraph(graph)}>
            <Users className="size-3.5" />
            分享
          </Button>
        ) : null}
        {manageable ? (
          <Button size="xs" variant="ghost" onClick={() => onArchiveGraph(graph)}>
            <Trash2 className="size-3.5" />
            删除
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ErDiagramListPage({ onEditGraph }: { onEditGraph: (graphId: string) => void }) {
  const graphsQuery = useGraphsQuery()
  const createGraphMutation = useCreateGraphMutation()
  const updateGraphMutation = useUpdateGraphMetaMutation()
  const archiveGraphMutation = useArchiveGraphMutation()
  const upsertMemberMutation = useUpsertGraphMemberMutation()
  const removeMemberMutation = useRemoveGraphMemberMutation()
  const [formMode, setFormMode] = useState<GraphFormMode | null>(null)
  const [formValues, setFormValues] = useState<GraphFormValues>(() => defaultCreateValues())
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
  const memberError = membersQuery.error ?? upsertMemberMutation.error ?? removeMemberMutation.error

  const openCreateDialog = () => {
    setEditingGraph(null)
    setFormValues(defaultCreateValues())
    setFormMode('create')
  }

  const openEditDialog = (graph: GraphMeta) => {
    setEditingGraph(graph)
    setFormValues(valuesFromGraph(graph))
    setFormMode('edit')
  }

  const closeFormDialog = () => {
    if (createGraphMutation.isPending || updateGraphMutation.isPending) return
    setFormMode(null)
    setEditingGraph(null)
  }

  const submitForm = async () => {
    const body = graphBodyFromValues(formValues)
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

  const confirmArchive = async () => {
    if (!archiveTarget) return
    await archiveGraphMutation.mutateAsync(archiveTarget.id)
    setArchiveTarget(null)
  }

  const upsertMember = async (email: string, role: GraphRole) => {
    if (!sharingGraph) return
    await upsertMemberMutation.mutateAsync({
      graphId: sharingGraph.id,
      body: { email: email.trim().toLowerCase(), role },
    })
  }

  const removeMember = async (member: GraphMember) => {
    if (!sharingGraph) return
    await removeMemberMutation.mutateAsync({
      graphId: sharingGraph.id,
      userId: member.user_id,
    })
  }

  const formPending = createGraphMutation.isPending || updateGraphMutation.isPending
  const memberPending = upsertMemberMutation.isPending || removeMemberMutation.isPending

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">ER 图列表</h3>
          <p className="text-xs text-muted-foreground">按业务域管理数据结构关系</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => graphsQuery.refetch()}
            disabled={graphsQuery.isFetching || formPending || archiveGraphMutation.isPending}
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
        <div className="min-w-[1160px] overflow-hidden rounded-md border border-border bg-card">
          <div className="grid h-9 grid-cols-[minmax(220px,1.5fr)_minmax(120px,0.8fr)_90px_90px_130px_120px_260px] items-center gap-3 border-b border-border bg-muted/50 px-4 text-xs font-medium text-muted-foreground">
            <div>图名称</div>
            <div>业务域</div>
            <div>表</div>
            <div>关系</div>
            <div>状态</div>
            <div>更新时间</div>
            <div className="text-right">操作</div>
          </div>

          {graphsQuery.isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">加载中...</div>
          ) : graphsQuery.error ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">加载失败</div>
          ) : graphsQuery.data?.length ? (
            graphsQuery.data.map((graph) => (
              <GraphRow
                key={graph.id}
                graph={graph}
                onArchiveGraph={setArchiveTarget}
                onEditGraphMeta={openEditDialog}
                onOpenGraph={onEditGraph}
                onShareGraph={setSharingGraph}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">暂无 ER 图</div>
          )}
        </div>
      </div>

      {formMode ? (
        <GraphFormDialog
          mode={formMode}
          onClose={closeFormDialog}
          onSubmit={submitForm}
          pending={formPending}
          values={formValues}
          setValues={setFormValues}
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

      <AlertDialog open={archiveTarget != null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
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
            <AlertDialogCancel disabled={archiveGraphMutation.isPending}>取消</AlertDialogCancel>
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
