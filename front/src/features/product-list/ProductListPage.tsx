import { useMemo, useState } from 'react'
import { Edit3, Package, Plus, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'

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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import {
  useArchiveProductMutation,
  useCreateProductMutation,
  useProductMembersQuery,
  useProductsQuery,
  useRemoveProductMemberMutation,
  useUpdateProductMutation,
  useUpsertProductMemberMutation,
  type ProductMember,
  type ProductMeta,
  type ProductRole,
} from '@/entities/product'
import { formatDateTime } from '@/shared/lib/date'
import { EntityTitleCell } from '@/shared/ui/entity-title-cell'

const roleText: Record<ProductRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

function effectiveProductRole(product: ProductMeta): ProductRole {
  return product.current_user_role ?? 'viewer'
}

function canEditProduct(product: ProductMeta) {
  const role = effectiveProductRole(product)
  return role === 'owner' || role === 'editor'
}

function canManageProduct(product: ProductMeta) {
  return effectiveProductRole(product) === 'owner'
}

function defaultCode() {
  return `product_${Date.now()}`
}

function ProductMetaDialog({
  initial,
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  initial: { code: string; name: string; description: string }
  mode: 'create' | 'edit'
  onClose: () => void
  onSubmit: (values: { code: string; name: string; description: string }) => Promise<void>
  pending: boolean
}) {
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增产品' : '编辑产品'}</DialogTitle>
          <DialogDescription>产品是 ER 图、业务图和泳道组件的共同归属。</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit({ code: code.trim(), name: name.trim(), description: description.trim() })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel>产品标识</FieldLabel>
              <Input value={code} disabled={mode === 'edit' || pending} onChange={(event) => setCode(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>产品名称</FieldLabel>
              <Input value={name} disabled={pending} autoFocus onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Textarea className="min-h-24 resize-none" value={description} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !code.trim() || !name.trim()}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProductMembersDialog({
  product,
  members,
  loading,
  pending,
  onClose,
  onUpsert,
  onRemove,
}: {
  product: ProductMeta
  members: ProductMember[]
  loading: boolean
  pending: boolean
  onClose: () => void
  onUpsert: (email: string, role: ProductRole) => Promise<void>
  onRemove: (member: ProductMember) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProductRole>('viewer')
  const sortedMembers = useMemo(
    () =>
      [...members].sort((left, right) => {
        const createdAt = new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        return createdAt || left.email.localeCompare(right.email)
      }),
    [members],
  )
  const ownerCount = sortedMembers.filter((member) => member.role === 'owner').length

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>产品成员</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(220px,1fr)_170px_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void onUpsert(email.trim(), role).then(() => setEmail(''))
          }}
        >
          <Field>
            <FieldLabel>用户邮箱</FieldLabel>
            <Input value={email} disabled={pending} placeholder="user@example.com" onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>角色</FieldLabel>
            <Select value={role} disabled={pending} onValueChange={(value) => setRole(value as ProductRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="viewer">Viewer 只读</SelectItem>
                  <SelectItem value="editor">Editor 可编辑</SelectItem>
                  <SelectItem value="owner">Owner 可管理</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={pending || !email.trim()}>
            <UserPlus className="size-4" />
            添加/更新
          </Button>
        </form>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">成员</th>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : sortedMembers.length ? (
                sortedMembers.map((member) => {
                  const locked = member.is_creator || (member.role === 'owner' && ownerCount <= 1)
                  return (
                    <tr key={member.user_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{member.display_name}</span>
                          {member.is_creator ? <Badge variant="secondary">创建者</Badge> : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={member.role}
                          disabled={pending || locked}
                          onValueChange={(value) => {
                            void onUpsert(member.email, value as ProductRole)
                          }}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="owner">Owner</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="xs" variant="ghost" disabled={pending || locked} onClick={() => void onRemove(member)}>
                          <Trash2 className="size-3.5" />
                          移除
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    暂无成员
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProductListPage() {
  const productsQuery = useProductsQuery()
  const createMutation = useCreateProductMutation()
  const updateMutation = useUpdateProductMutation()
  const archiveMutation = useArchiveProductMutation()
  const upsertMemberMutation = useUpsertProductMemberMutation()
  const removeMemberMutation = useRemoveProductMemberMutation()
  const [editingProduct, setEditingProduct] = useState<ProductMeta | 'new' | null>(null)
  const [memberProduct, setMemberProduct] = useState<ProductMeta | null>(null)
  const membersQuery = useProductMembersQuery(memberProduct?.id ?? null, { enabled: Boolean(memberProduct) })
  const products = productsQuery.data ?? []
  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    archiveMutation.isPending ||
    upsertMemberMutation.isPending ||
    removeMemberMutation.isPending

  async function submitProduct(values: { code: string; name: string; description: string }) {
    if (editingProduct === 'new') {
      await createMutation.mutateAsync({
        code: values.code,
        name: values.name,
        description: values.description || null,
      })
    } else if (editingProduct) {
      await updateMutation.mutateAsync({
        productId: editingProduct.id,
        body: {
          name: values.name,
          description: values.description || null,
        },
      })
    }
    setEditingProduct(null)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">产品</h3>
          <p className="text-xs text-muted-foreground">管理 ER 图、业务图和泳道组件的产品归属与成员权限。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void productsQuery.refetch()}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setEditingProduct('new')}>
            <Plus className="size-4" />
            新增产品
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">产品</th>
                <th className="px-3 py-2 text-left font-medium">资产</th>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                <th className="px-3 py-2 text-left font-medium">更新时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {productsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : products.length ? (
                products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <EntityTitleCell
                        icon={<Package className="size-4" />}
                        title={product.name}
                        description={product.description || product.code}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      ER {product.er_graph_count} · 业务图 {product.business_flow_count} · 泳道 {product.swimlane_component_count}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={effectiveProductRole(product) === 'owner' ? 'default' : 'secondary'}>
                        {roleText[effectiveProductRole(product)]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(product.updated_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {canManageProduct(product) ? (
                          <Button size="xs" variant="ghost" onClick={() => setMemberProduct(product)}>
                            <Users className="size-3.5" />
                            成员
                          </Button>
                        ) : null}
                        {canEditProduct(product) ? (
                          <Button size="xs" variant="ghost" onClick={() => setEditingProduct(product)}>
                            <Edit3 className="size-3.5" />
                            编辑
                          </Button>
                        ) : null}
                        {canManageProduct(product) ? (
                          <Button size="xs" variant="ghost" onClick={() => void archiveMutation.mutateAsync(product.id)}>
                            <Trash2 className="size-3.5" />
                            归档
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    暂无产品
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingProduct ? (
        <ProductMetaDialog
          mode={editingProduct === 'new' ? 'create' : 'edit'}
          initial={
            editingProduct === 'new'
              ? { code: defaultCode(), name: '新建产品', description: '' }
              : {
                  code: editingProduct.code,
                  name: editingProduct.name,
                  description: editingProduct.description ?? '',
                }
          }
          pending={pending}
          onClose={() => setEditingProduct(null)}
          onSubmit={submitProduct}
        />
      ) : null}

      {memberProduct ? (
        <ProductMembersDialog
          product={memberProduct}
          members={membersQuery.data ?? []}
          loading={membersQuery.isLoading}
          pending={pending}
          onClose={() => setMemberProduct(null)}
          onUpsert={async (email, role) => {
            await upsertMemberMutation.mutateAsync({
              productId: memberProduct.id,
              body: { email, role },
            })
          }}
          onRemove={async (member) => {
            await removeMemberMutation.mutateAsync({
              productId: memberProduct.id,
              userId: member.user_id,
            })
          }}
        />
      ) : null}
    </section>
  )
}
