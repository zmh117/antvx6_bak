import { useEffect, useMemo, useRef, useState } from 'react'
import { Graph, type Cell, type Edge } from '@antv/x6'
import {
  ArrowLeft,
  Boxes,
  Circle,
  Diamond,
  MousePointer2,
  Pencil,
  Plus,
  Save,
  Square,
  Workflow,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { BusinessFlowNodeType, SwimlaneComponent } from '@/entities/business-flow'
import {
  createLocalId,
  createSwimlaneComponent,
  getCurrentComponentVersion,
  getSwimlaneComponent,
  listSwimlaneComponents,
  newComponentNodeDraft,
  saveSwimlaneComponentVersion,
} from '@/features/business-flow/domain/localBusinessFlowStore'
import {
  addComponentNode,
  componentDraftFromGraph,
  createBusinessFlowGraph,
  graphPointFromEvent,
  readCellData,
  renderComponentVersion,
  updateEdgeText,
  updateNodeText,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'

const NODE_TOOLS: Array<{
  type: BusinessFlowNodeType
  label: string
  icon: typeof Square
}> = [
  { type: 'START', label: '开始', icon: Circle },
  { type: 'END', label: '结束', icon: Circle },
  { type: 'TASK', label: '任务', icon: Square },
  { type: 'DECISION', label: '决策', icon: Diamond },
  { type: 'SERVICE', label: '服务', icon: Boxes },
  { type: 'MANUAL', label: '人工', icon: MousePointer2 },
  { type: 'EVENT', label: '事件', icon: Workflow },
]

type SelectedComponentCell =
  | { kind: 'node'; cell: Cell; title: string; description: string; actor: string; businessRule: string }
  | { kind: 'edge'; cell: Edge; label: string }
  | null

export function SwimlaneComponentListPage({
  onCreate,
  onEdit,
}: {
  onCreate: (componentId: string) => void
  onEdit: (componentId: string) => void
}) {
  const [components, setComponents] = useState<SwimlaneComponent[]>(() => listSwimlaneComponents())
  const sortedComponents = useMemo(
    () =>
      [...components].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [components],
  )

  function createComponent() {
    const component = createSwimlaneComponent()
    setComponents(listSwimlaneComponents())
    onCreate(component.id)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">泳道组件</h3>
          <p className="text-xs text-muted-foreground">
            预画可复用流程组件，业务图中拖入后生成独立实例。
          </p>
        </div>
        <Button size="sm" onClick={createComponent}>
          <Plus className="size-4" />
          新建组件
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {sortedComponents.map((component) => {
            const version = getCurrentComponentVersion(component)
            return (
              <button
                key={component.id}
                type="button"
                className="group flex min-h-40 flex-col rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/50 hover:bg-accent/40"
                onClick={() => onEdit(component.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{component.name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {component.description || component.code}
                    </div>
                  </div>
                  <Badge variant="outline">v{version?.versionNo ?? component.currentVersionNo}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border bg-background px-2 py-1.5">
                    <div className="text-muted-foreground">节点</div>
                    <div className="font-semibold tabular-nums">{version?.nodes.length ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-2 py-1.5">
                    <div className="text-muted-foreground">连线</div>
                    <div className="font-semibold tabular-nums">{version?.edges.length ?? 0}</div>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                  <span className="truncate">{component.ownerRole || '未设置角色'}</span>
                  <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    <Pencil className="size-3" />
                    编辑
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
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
  const [componentSnapshot, setComponentSnapshot] = useState<SwimlaneComponent | null>(() =>
    getSwimlaneComponent(componentId),
  )
  const component = componentSnapshot
  const currentVersion = component ? getCurrentComponentVersion(component) : null
  const [selected, setSelected] = useState<SelectedComponentCell>(null)
  const [name, setName] = useState(component?.name ?? '泳道组件')
  const [category, setCategory] = useState(component?.category ?? '')
  const [ownerRole, setOwnerRole] = useState(component?.ownerRole ?? '')
  const [description, setDescription] = useState(component?.description ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    const nextComponent = getSwimlaneComponent(componentId)
    setComponentSnapshot(nextComponent)
    setName(nextComponent?.name ?? '泳道组件')
    setCategory(nextComponent?.category ?? '')
    setOwnerRole(nextComponent?.ownerRole ?? '')
    setDescription(nextComponent?.description ?? '')
    setSavedAt(null)
    setSelected(null)
  }, [componentId])

  useEffect(() => {
    const initialComponent = getSwimlaneComponent(componentId)
    const initialVersion = initialComponent ? getCurrentComponentVersion(initialComponent) : null
    if (!containerRef.current || !initialVersion) return
    const graph = createBusinessFlowGraph(containerRef.current)
    graphRef.current = graph
    renderComponentVersion(graph, initialVersion)

    graph.on('cell:click', ({ cell }) => setSelected(readSelectedCell(cell)))
    graph.on('blank:click', () => setSelected(null))
    graph.on('edge:connected', ({ edge }) => {
      edge.setData({
        ...readCellData(edge),
        cellRole: 'COMPONENT_EDGE',
        edgeKey: readCellData(edge).edgeKey ?? createLocalId('cmp_edge'),
        title: '',
      })
      setSelected(readSelectedCell(edge))
    })
    return () => {
      graph.dispose()
      graphRef.current = null
    }
  }, [componentId])

  if (!component || !currentVersion) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        未找到泳道组件
      </section>
    )
  }

  function dropNode(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const graph = graphRef.current
    if (!graph) return
    const type = event.dataTransfer.getData('application/x-bf-node') as BusinessFlowNodeType
    if (!type) return
    const point = graphPointFromEvent(graph, event.nativeEvent)
    const draft = newComponentNodeDraft(type, { x: point.x - 60, y: point.y - 24 })
    const node = addComponentNode(graph, draft)
    graph.cleanSelection()
    graph.select(node)
  }

  function saveComponent() {
    const graph = graphRef.current
    if (!graph) return
    const draft = componentDraftFromGraph(graph)
    const saved = saveSwimlaneComponentVersion(componentId, {
      name,
      category,
      ownerRole,
      description,
      nodes: draft.nodes,
      edges: draft.edges,
    })
    if (saved) setComponentSnapshot(saved)
    setSavedAt(new Date().toLocaleTimeString())
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
          <Button size="sm" onClick={saveComponent}>
            <Save className="size-4" />
            保存组件
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
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
                        key={tool.type}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-bf-node', tool.type)
                          event.dataTransfer.effectAllowed = 'copy'
                        }}
                        className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background text-xs transition-colors hover:border-primary/60 hover:bg-accent"
                      >
                        <Icon className="size-4 text-primary" />
                        {tool.label}
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
        <div
          className="min-h-0"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropNode}
        >
          <div ref={containerRef} className="h-full w-full" />
        </div>
        <aside className="min-h-0 border-l border-border bg-card">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              <div>
                <div className="text-xs font-semibold">组件属性</div>
                <FieldGroup className="mt-3">
                  <Field>
                    <FieldLabel>名称</FieldLabel>
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>分类</FieldLabel>
                    <Input value={category} onChange={(event) => setCategory(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>负责角色</FieldLabel>
                    <Input value={ownerRole} onChange={(event) => setOwnerRole(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>描述</FieldLabel>
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                    />
                  </Field>
                </FieldGroup>
              </div>
              <Separator />
              <ComponentInspector selected={selected} onChange={setSelected} />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </section>
  )
}

function ComponentInspector({
  selected,
  onChange,
}: {
  selected: SelectedComponentCell
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
    return (
      <div>
        <div className="text-xs font-semibold">连线属性</div>
        <FieldGroup className="mt-3">
          <Field>
            <FieldLabel>标签</FieldLabel>
            <Input
              value={selected.label}
              onChange={(event) => {
                const label = event.target.value
                updateEdgeText(selected.cell, label)
                onChange({ ...selected, label })
              }}
            />
          </Field>
        </FieldGroup>
      </div>
    )
  }
  return (
    <div>
      <div className="text-xs font-semibold">节点属性</div>
      <FieldGroup className="mt-3">
        <Field>
          <FieldLabel>标题</FieldLabel>
          <Input
            value={selected.title}
            onChange={(event) => {
              const title = event.target.value
              updateNodeText(selected.cell, title)
              onChange({ ...selected, title })
            }}
          />
        </Field>
        <Field>
          <FieldLabel>描述</FieldLabel>
          <Textarea
            value={selected.description}
            rows={3}
            onChange={(event) => {
              const description = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), description })
              onChange({ ...selected, description })
            }}
          />
        </Field>
        <Field>
          <FieldLabel>角色</FieldLabel>
          <Input
            value={selected.actor}
            onChange={(event) => {
              const actor = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), actor })
              onChange({ ...selected, actor })
            }}
          />
        </Field>
        <Field>
          <FieldLabel>业务规则</FieldLabel>
          <Textarea
            value={selected.businessRule}
            rows={3}
            onChange={(event) => {
              const businessRule = event.target.value
              selected.cell.setData({ ...readCellData(selected.cell), businessRule })
              onChange({ ...selected, businessRule })
            }}
          />
        </Field>
      </FieldGroup>
    </div>
  )
}

function readSelectedCell(cell: Cell): SelectedComponentCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
    }
  }
  if (data.cellRole === 'COMPONENT_NODE') {
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      description: data.description ?? '',
      actor: data.actor ?? '',
      businessRule: data.businessRule ?? '',
    }
  }
  return null
}
