import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownToLine,
  Circle,
  Diamond,
  GitBranch,
  ListPlus,
  Move3D,
  Plus,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from 'lucide-react'
import {
  Graph,
  History,
  Keyboard,
  Selection,
  Shape,
  type Cell,
  type CellView,
  type Edge,
  type Node,
} from '@antv/x6'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  BUSINESS_FLOW_BINDING_USAGE_OPTIONS,
  canBindBusinessFlowNode,
  nodeTypeLabel,
  useBusinessFlowQuery,
  useSaveBusinessFlowMutation,
  type BusinessFlowBinding,
  type BusinessFlowEdge,
  type BusinessFlowNode,
  type BusinessFlowNodeType,
  type BusinessFlowRecord,
  type BusinessFlowSaveBody,
} from '@/entities/business-flow/api'
import { useGraphQuery } from '@/entities/er-graph/api'
import './business-flow-editor.css'

const SHAPE_BY_TYPE: Record<BusinessFlowNodeType, string> = {
  lane: 'bpmn-lane',
  start_event: 'bpmn-start-event',
  end_event: 'bpmn-end-event',
  activity: 'bpmn-activity',
  subprocess: 'bpmn-subprocess',
  exclusive_gateway: 'bpmn-gateway-exclusive',
  parallel_gateway: 'bpmn-gateway-parallel',
}

const TYPE_BY_SHAPE = Object.fromEntries(
  Object.entries(SHAPE_BY_TYPE).map(([type, shape]) => [shape, type]),
) as Record<string, BusinessFlowNodeType>

type X6NodeMetadata = Parameters<Graph['createNode']>[0]
type X6EdgeMetadata = Parameters<Graph['createEdge']>[0]

const DEFAULT_SIZE_BY_TYPE: Record<BusinessFlowNodeType, { width: number; height: number }> = {
  lane: { width: 240, height: 520 },
  start_event: { width: 44, height: 44 },
  end_event: { width: 44, height: 44 },
  activity: { width: 132, height: 64 },
  subprocess: { width: 164, height: 72 },
  exclusive_gateway: { width: 46, height: 46 },
  parallel_gateway: { width: 46, height: 46 },
}

const PALETTE: Array<{
  type: BusinessFlowNodeType
  icon: typeof Square
  label: string
}> = [
  { type: 'lane', icon: Move3D, label: '泳道' },
  { type: 'start_event', icon: Circle, label: '开始' },
  { type: 'end_event', icon: Circle, label: '结束' },
  { type: 'activity', icon: Square, label: '任务' },
  { type: 'subprocess', icon: ListPlus, label: '子流程' },
  { type: 'exclusive_gateway', icon: Diamond, label: '排他' },
  { type: 'parallel_gateway', icon: GitBranch, label: '并行' },
]

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function registerBpmnShapes() {
  Graph.registerNode(
    SHAPE_BY_TYPE.lane,
    {
      inherit: 'rect',
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'rect', selector: 'name-rect' },
        { tagName: 'text', selector: 'name-text' },
      ],
      attrs: {
        body: {
          fill: '#fff',
          stroke: '#5f95ff',
          strokeWidth: 1,
        },
        'name-rect': {
          width: '100%',
          height: 30,
          fill: '#5f95ff',
          strokeWidth: 0,
        },
        'name-text': {
          ref: 'name-rect',
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 12,
          fontWeight: 700,
          fill: '#fff',
        },
      },
    },
    true,
  )

  Graph.registerNode(
    SHAPE_BY_TYPE.start_event,
    {
      inherit: 'circle',
      attrs: {
        body: { strokeWidth: 2, stroke: '#52c41a', fill: '#fff' },
        label: {
          refY: '100%',
          y: 8,
          fontSize: 11,
          fill: '#595959',
          textAnchor: 'middle',
          textVerticalAnchor: 'top',
        },
      },
    },
    true,
  )

  Graph.registerNode(
    SHAPE_BY_TYPE.end_event,
    {
      inherit: 'circle',
      attrs: {
        body: { strokeWidth: 4, stroke: '#ff4d4f', fill: '#fff' },
        label: {
          refY: '100%',
          y: 8,
          fontSize: 11,
          fill: '#595959',
          textAnchor: 'middle',
          textVerticalAnchor: 'top',
        },
      },
    },
    true,
  )

  Graph.registerNode(
    SHAPE_BY_TYPE.activity,
    {
      inherit: 'rect',
      attrs: {
        body: {
          rx: 6,
          ry: 6,
          stroke: '#5f95ff',
          fill: '#eff4ff',
          strokeWidth: 1,
        },
        label: {
          ref: 'body',
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 12,
          fill: '#262626',
          textWrap: { width: -20, height: -12, ellipsis: true },
        },
      },
    },
    true,
  )

  Graph.registerNode(
    SHAPE_BY_TYPE.subprocess,
    {
      inherit: 'rect',
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'text', selector: 'label' },
        { tagName: 'text', selector: 'expand' },
        { tagName: 'text', selector: 'details' },
      ],
      attrs: {
        body: {
          rx: 6,
          ry: 6,
          stroke: '#5f95ff',
          fill: '#fafbff',
          strokeWidth: 1,
        },
        label: {
          ref: 'body',
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 12,
          fill: '#262626',
          textWrap: { width: -24, height: -12, ellipsis: true },
        },
        expand: {
          ref: 'body',
          refX: '100%',
          refY: '100%',
          x: -8,
          y: -8,
          textAnchor: 'end',
          textVerticalAnchor: 'bottom',
          fontSize: 16,
          fontWeight: 'bold',
          fill: '#5f95ff',
          cursor: 'pointer',
          text: '+',
          event: 'subproc:toggle',
        },
        details: {
          ref: 'body',
          refX: '50%',
          refY: 40,
          textAnchor: 'middle',
          textVerticalAnchor: 'top',
          fontSize: 11,
          fill: '#8c8c8c',
          display: 'none',
          textWrap: { width: -24 },
          text: '',
        },
      },
    },
    true,
  )

  function registerGateway(type: 'exclusive_gateway' | 'parallel_gateway', symbol: string) {
    Graph.registerNode(
      SHAPE_BY_TYPE[type],
      {
        inherit: 'polygon',
        attrs: {
          body: {
            refPoints: '0,10 10,0 20,10 10,20',
            strokeWidth: 2,
            stroke: '#5f95ff',
            fill: '#eff4ff',
          },
          label: {
            text: symbol,
            fontSize: 28,
            fontWeight: 'bold',
            fill: '#5f95ff',
          },
        },
      },
      true,
    )
  }

  registerGateway('exclusive_gateway', '×')
  registerGateway('parallel_gateway', '⨁')

  Graph.registerEdge(
    'bpmn-edge',
    {
      inherit: 'edge',
      router: { name: 'orth' },
      connector: { name: 'rounded', args: { radius: 8 } },
      attrs: {
        line: {
          stroke: '#a2b1c3',
          strokeWidth: 2,
          targetMarker: 'classic',
        },
      },
    },
    true,
  )
}

function keyboardGuard(this: Graph, e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return false
  return !el.isContentEditable
}

function readCellLabel(cell: Node | Edge) {
  const data = cell.getData() as { label?: string } | undefined
  if (typeof data?.label === 'string') return data.label
  if (cell.isNode()) {
    const node = cell as Node
    const laneLabel = node.attr('name-text/text')
    const label = node.attr('label/text')
    return String(laneLabel || label || '')
  }
  const labels = (cell as Edge).getLabels()
  const label = labels[0]?.attrs?.label?.text
  return typeof label === 'string' ? label : ''
}

function applyNodeLabel(node: Node, label: string) {
  if (node.shape === SHAPE_BY_TYPE.lane) {
    node.attr('name-text/text', label)
  } else if (
    node.shape === SHAPE_BY_TYPE.activity ||
    node.shape === SHAPE_BY_TYPE.subprocess ||
    node.shape === SHAPE_BY_TYPE.start_event ||
    node.shape === SHAPE_BY_TYPE.end_event
  ) {
    node.attr('label/text', label)
  }
  node.setData({ ...(node.getData() ?? {}), label })
}

function applyEdgeLabel(edge: Edge, label: string) {
  edge.setData({ ...(edge.getData() ?? {}), label })
  edge.setLabels(
    label
      ? [
          {
            attrs: {
              label: {
                text: label,
                fill: '#8c8c8c',
                fontSize: 11,
              },
            },
          },
        ]
      : [],
  )
}

function applySubprocessState(node: Node, expanded: boolean, details?: string | null) {
  if (node.shape !== SHAPE_BY_TYPE.subprocess) return
  const text = details?.trim() || ''
  node.attr('expand/text', expanded ? '-' : '+')
  node.attr('details/display', expanded ? 'block' : 'none')
  node.attr('details/text', expanded ? text : '')
  if (expanded) {
    const lines = Math.max(text.split(/\n/).length, 1)
    node.size(node.getSize().width, Math.max(92, 54 + lines * 18))
    node.attr('label', {
      textVerticalAnchor: 'top',
      refY: 18,
      refX: '50%',
      ref: 'body',
    })
  } else {
    const data = node.getData() as BusinessFlowNode | undefined
    node.size(node.getSize().width, data?.size?.height ?? DEFAULT_SIZE_BY_TYPE.subprocess.height)
    node.attr('label', {
      textVerticalAnchor: 'middle',
      refY: '50%',
      refX: '50%',
      ref: 'body',
    })
  }
}

function businessNodeToCell(node: BusinessFlowNode): X6NodeMetadata {
  const shape = SHAPE_BY_TYPE[node.type]
  const base = {
    id: node.id,
    shape,
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    data: node,
  }
  if (node.type === 'lane') {
    return {
      ...base,
      attrs: { 'name-text': { text: node.label || '泳道' } },
    } as X6NodeMetadata
  }
  if (node.type === 'subprocess') {
    return {
      ...base,
      attrs: {
        label: { text: node.label || '子流程' },
        details: { text: node.details || '' },
        expand: { text: node.expanded ? '-' : '+' },
      },
    } as X6NodeMetadata
  }
  if (node.type === 'exclusive_gateway' || node.type === 'parallel_gateway') {
    return base as X6NodeMetadata
  }
  return {
    ...base,
    attrs: { label: { text: node.label || nodeTypeLabel(node.type) } },
  } as X6NodeMetadata
}

function businessEdgeToCell(edge: BusinessFlowEdge): X6EdgeMetadata {
  return {
    id: edge.id,
    shape: 'bpmn-edge',
    source: { cell: edge.source },
    target: { cell: edge.target },
    vertices: edge.vertices,
    data: edge,
    attrs: {
      line: {
        strokeDasharray: edge.dashed ? '5,5' : undefined,
      },
    },
    labels: edge.label
      ? [
          {
            attrs: {
              label: {
                text: edge.label,
                fill: '#8c8c8c',
                fontSize: 11,
              },
            },
          },
        ]
      : [],
  } as X6EdgeMetadata
}

function normalizeNodeFromCell(node: Node): BusinessFlowNode | null {
  const type = TYPE_BY_SHAPE[node.shape]
  if (!type) return null
  const position = node.getPosition()
  const size = node.getSize()
  const data = (node.getData() ?? {}) as Partial<BusinessFlowNode>
  return {
    id: node.id,
    type,
    label: readCellLabel(node) || nodeTypeLabel(type),
    position,
    size,
    lane_id: data.lane_id ?? (node.prop('parent') as string | undefined) ?? null,
    details: type === 'subprocess' ? data.details ?? null : undefined,
    expanded: type === 'subprocess' ? Boolean(data.expanded) : undefined,
  }
}

function normalizeEdgeFromCell(edge: Edge): BusinessFlowEdge | null {
  const source = edge.getSourceCellId()
  const target = edge.getTargetCellId()
  if (!source || !target) return null
  const data = (edge.getData() ?? {}) as Partial<BusinessFlowEdge>
  return {
    id: edge.id,
    source,
    target,
    label: readCellLabel(edge) || null,
    vertices: edge.getVertices().map((point) => ({ x: point.x, y: point.y })),
    dashed: Boolean(data.dashed || edge.attr('line/strokeDasharray')),
  }
}

function collectFlowBody(
  graph: Graph,
  flow: BusinessFlowRecord,
  bindings: BusinessFlowBinding[],
): BusinessFlowSaveBody {
  const nodes = graph
    .getNodes()
    .map(normalizeNodeFromCell)
    .filter((node): node is BusinessFlowNode => Boolean(node))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const bindableIds = new Set(
    nodes
      .filter((node) => canBindBusinessFlowNode(node.type))
      .map((node) => node.id),
  )
  const edges = graph
    .getEdges()
    .map(normalizeEdgeFromCell)
    .filter(
      (edge): edge is BusinessFlowEdge =>
        edge != null && nodeIds.has(edge.source) && nodeIds.has(edge.target),
    )
  return {
    name: flow.name,
    description: flow.description ?? null,
    nodes,
    edges,
    bindings: bindings.filter((binding) => bindableIds.has(binding.step_key)),
  }
}

type BindingTargetOption = {
  value: string
  label: string
  tableKey?: string
  columnKey?: string
  relationKey?: string
}

function bindingTargetValue(binding: BusinessFlowBinding) {
  if (binding.relation_key) return `relation:${binding.relation_key}`
  if (binding.table_key && binding.column_key) {
    return `column:${binding.table_key}:${binding.column_key}`
  }
  if (binding.table_key) return `table:${binding.table_key}`
  return 'none'
}

function createBindingFromTarget(stepKey: string, option: BindingTargetOption): BusinessFlowBinding {
  return {
    binding_key: makeId('binding'),
    step_key: stepKey,
    table_key: option.tableKey ?? null,
    column_key: option.columnKey ?? null,
    relation_key: option.relationKey ?? null,
    usage_type: 'read',
    description: null,
  }
}

export function BusinessFlowEditor({
  graphId,
  flowKey,
}: {
  graphId: string
  flowKey: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const loadedKeyRef = useRef<string | null>(null)
  const flowQuery = useBusinessFlowQuery(graphId, flowKey)
  const graphQuery = useGraphQuery(graphId)
  const saveMutation = useSaveBusinessFlowMutation(graphId)
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [bindings, setBindings] = useState<BusinessFlowBinding[]>([])

  const bump = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    registerBpmnShapes()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || graphRef.current) return
    const graph = new Graph({
      container,
      async: true,
      autoResize: true,
      background: { color: '#ffffff' },
      grid: { visible: true, type: 'dot', args: { color: '#e6edf7' } },
      mousewheel: {
        enabled: true,
        modifiers: 'ctrl',
        minScale: 0.4,
        maxScale: 2,
      },
      panning: {
        enabled: true,
        eventTypes: ['rightMouseDown'],
      },
      connecting: {
        router: 'orth',
        connector: { name: 'rounded', args: { radius: 8 } },
        allowBlank: false,
        allowLoop: false,
        snap: { radius: 20 },
        createEdge() {
          return new Shape.Edge({
            shape: 'bpmn-edge',
            data: { dashed: false },
          })
        },
      },
      translating: {
        restrict(this: Graph, cellView: CellView | null) {
          const cell = cellView?.cell
          if (!cell?.isNode()) return this.transform.getGraphArea()
          if (cell.shape === SHAPE_BY_TYPE.lane) return this.transform.getGraphArea()
          const parentId = cell.prop('parent')
          if (!parentId) return this.transform.getGraphArea()
          const parentNode = this.getCellById(parentId)
          if (!parentNode?.isNode()) return this.transform.getGraphArea()
          return parentNode.getBBox().moveAndExpand({
            x: 0,
            y: 30,
            width: 0,
            height: -30,
          })
        },
      },
    })
    graph.use(new Selection({ enabled: true, multiple: false, rubberband: true }))
    graph.use(new Keyboard({ enabled: true, global: true, guard: keyboardGuard }))
    graph.use(new History({ enabled: true, stackSize: 80 }))

    graph.on('cell:selected', ({ cell }: { cell: Cell }) => {
      setSelectedCellId(cell.id)
      bump()
    })
    graph.on('cell:unselected', () => {
      setSelectedCellId(null)
      bump()
    })
    graph.on('blank:click', () => {
      graph.cleanSelection()
      setSelectedCellId(null)
      bump()
    })
    graph.on('node:moved', () => bump())
    graph.on('node:resized', () => bump())
    graph.on('edge:connected', ({ edge }: { edge: Edge }) => {
      const sourceId = edge.getSourceCellId()
      const targetId = edge.getTargetCellId()
      const sourceParent = sourceId ? graph.getCellById(sourceId)?.prop('parent') : null
      const targetParent = targetId ? graph.getCellById(targetId)?.prop('parent') : null
      const dashed = Boolean(sourceParent && targetParent && sourceParent !== targetParent)
      edge.setData({ ...(edge.getData() ?? {}), dashed })
      edge.attr('line/strokeDasharray', dashed ? '5,5' : null)
      bump()
    })
    graph.on('subproc:toggle', ({ node }: { node: Node }) => {
      if (node.shape !== SHAPE_BY_TYPE.subprocess) return
      const data = (node.getData() ?? {}) as BusinessFlowNode
      const expanded = !data.expanded
      node.setData({ ...data, expanded })
      applySubprocessState(node, expanded, data.details)
      bump()
    })
    graph.bindKey(['backspace', 'delete'], () => {
      const cells = graph.getSelectedCells()
      if (!cells.length) return false
      const ids = new Set(cells.map((cell) => cell.id))
      graph.removeCells(cells)
      setBindings((current) => current.filter((binding) => !ids.has(binding.step_key)))
      setSelectedCellId(null)
      bump()
      return false
    })

    graphRef.current = graph
    return () => {
      graph.dispose()
      graphRef.current = null
      loadedKeyRef.current = null
    }
  }, [bump, flowQuery.isLoading])

  useEffect(() => {
    const graph = graphRef.current
    const flow = flowQuery.data
    if (!graph || !flow) return
    const loadedKey = `${flow.graph_id}:${flow.flow_key}:${flow.version}`
    if (loadedKeyRef.current === loadedKey) return
    const cells = [
      ...flow.nodes.map((node) => graph.createNode(businessNodeToCell(node))),
      ...flow.edges.map((edge) => graph.createEdge(businessEdgeToCell(edge))),
    ]
    graph.resetCells(cells)
    const nodesById = new Map(graph.getNodes().map((node) => [node.id, node]))
    graph.getNodes().forEach((node) => {
      const data = (node.getData() ?? {}) as BusinessFlowNode
      if (data.lane_id) {
        const parent = nodesById.get(data.lane_id)
        parent?.addChild(node)
      }
      if (data.type === 'subprocess') {
        applySubprocessState(node, Boolean(data.expanded), data.details)
      }
    })
    setBindings(flow.bindings)
    loadedKeyRef.current = loadedKey
    setSelectedCellId(null)
    requestAnimationFrame(() => {
      graph.zoomToFit({ padding: 24, maxScale: 1 })
      bump()
    })
  }, [bump, flowQuery.data])

  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null
    return graphRef.current?.getCellById(selectedCellId) ?? null
  }, [revision, selectedCellId])
  const selectedNode = selectedCell?.isNode() ? (selectedCell as Node) : null
  const selectedEdge = selectedCell?.isEdge() ? (selectedCell as Edge) : null
  const selectedNodeType = selectedNode ? TYPE_BY_SHAPE[selectedNode.shape] : null

  const bindingTargetOptions = useMemo<BindingTargetOption[]>(() => {
    const data = graphQuery.data
    const options: BindingTargetOption[] = [{ value: 'none', label: '不绑定' }]
    for (const table of data?.tables ?? []) {
      const title = table.business_name || table.table_name || table.table_key
      options.push({
        value: `table:${table.table_key}`,
        label: `表 / ${title}`,
        tableKey: table.table_key,
      })
    }
    for (const column of data?.columns ?? []) {
      const title = column.business_name || column.column_key
      options.push({
        value: `column:${column.table_key}:${column.column_key}`,
        label: `字段 / ${column.table_key}.${title}`,
        tableKey: column.table_key,
        columnKey: column.column_key,
      })
    }
    for (const relation of data?.relations ?? []) {
      if (!relation.relation_key) continue
      const label =
        relation.relation_name ||
        `${relation.source_table_key}.${relation.source_column_key} -> ${relation.target_table_key}.${relation.target_column_key}`
      options.push({
        value: `relation:${relation.relation_key}`,
        label: `关系 / ${label}`,
        relationKey: relation.relation_key,
      })
    }
    return options
  }, [graphQuery.data])

  const selectedBinding = useMemo(() => {
    if (!selectedNode || !selectedNodeType || !canBindBusinessFlowNode(selectedNodeType)) {
      return null
    }
    return bindings.find((binding) => binding.step_key === selectedNode.id) ?? null
  }, [bindings, selectedNode, selectedNodeType])

  function addNode(type: BusinessFlowNodeType) {
    const graph = graphRef.current
    if (!graph) return
    const size = DEFAULT_SIZE_BY_TYPE[type]
    const point = graph.clientToLocal(260, 160)
    const id = makeId(type.replace('_', '-'))
    const node = graph.addNode(
      businessNodeToCell({
        id,
        type,
        label: nodeTypeLabel(type),
        position: { x: point.x, y: point.y },
        size,
      }),
    )
    graph.cleanSelection()
    graph.select(node)
    setSelectedCellId(node.id)
    bump()
  }

  function updateSelectedLabel(label: string) {
    if (selectedNode) applyNodeLabel(selectedNode, label)
    if (selectedEdge) applyEdgeLabel(selectedEdge, label)
    bump()
  }

  function updateSubprocessDetails(details: string) {
    if (!selectedNode || selectedNode.shape !== SHAPE_BY_TYPE.subprocess) return
    const data = (selectedNode.getData() ?? {}) as BusinessFlowNode
    selectedNode.setData({ ...data, details })
    applySubprocessState(selectedNode, Boolean(data.expanded), details)
    bump()
  }

  function updateBindingTarget(value: string) {
    if (!selectedNode || !selectedNodeType || !canBindBusinessFlowNode(selectedNodeType)) return
    if (value === 'none') {
      setBindings((current) => current.filter((binding) => binding.step_key !== selectedNode.id))
      return
    }
    const option = bindingTargetOptions.find((item) => item.value === value)
    if (!option) return
    setBindings((current) => {
      const existing = current.find((binding) => binding.step_key === selectedNode.id)
      const nextBinding = {
        ...(existing ?? createBindingFromTarget(selectedNode.id, option)),
        table_key: option.tableKey ?? null,
        column_key: option.columnKey ?? null,
        relation_key: option.relationKey ?? null,
      }
      return existing
        ? current.map((binding) =>
            binding.binding_key === existing.binding_key ? nextBinding : binding,
          )
        : [...current, nextBinding]
    })
  }

  function updateBindingPatch(patch: Partial<BusinessFlowBinding>) {
    if (!selectedBinding) return
    setBindings((current) =>
      current.map((binding) =>
        binding.binding_key === selectedBinding.binding_key
          ? { ...binding, ...patch }
          : binding,
      ),
    )
  }

  async function saveFlow() {
    const graph = graphRef.current
    const flow = flowQuery.data
    if (!graph || !flow) return
    const body = collectFlowBody(graph, flow, bindings)
    await saveMutation.mutateAsync({ flowKey: flow.flow_key, body })
  }

  function deleteSelection() {
    const graph = graphRef.current
    const cells = graph?.getSelectedCells() ?? []
    if (!graph || !cells.length) return
    const ids = new Set(cells.map((cell) => cell.id))
    graph.removeCells(cells)
    setBindings((current) => current.filter((binding) => !ids.has(binding.step_key)))
    setSelectedCellId(null)
    bump()
  }

  const selectedLabel = selectedCell ? readCellLabel(selectedCell as Node | Edge) : ''
  const currentUserRole = (
    graphQuery.data?.graph as { current_user_role?: string } | undefined
  )?.current_user_role
  const isReadonly = currentUserRole === 'viewer' || saveMutation.isPending

  if (flowQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">加载业务图...</div>
  }

  if (flowQuery.error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>业务图加载失败</AlertTitle>
          <AlertDescription>
            {flowQuery.error instanceof Error ? flowQuery.error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="business-flow-editor">
      <aside className="business-flow-stencil">
        <div className="business-flow-panel-header">
          <div>
            <h3>组件</h3>
            <p>BPMN stencil</p>
          </div>
          <Badge variant="outline">v{flowQuery.data?.version}</Badge>
        </div>
        <div className="business-flow-stencil-grid">
          {PALETTE.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.type}
                type="button"
                variant="outline"
                className="business-flow-stencil-item"
                onClick={() => addNode(item.type)}
                disabled={isReadonly}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Button>
            )
          })}
        </div>
        <div className="business-flow-help">
          <div className="font-medium">连接</div>
          <p>拖动节点边缘创建连线；跨泳道连线自动显示为虚线。</p>
        </div>
      </aside>

      <main className="business-flow-canvas-shell">
        <div className="business-flow-toolbar">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{flowQuery.data?.name}</div>
            <div className="truncate text-xs text-muted-foreground">{flowKey}</div>
          </div>
          <div className="flex items-center gap-2">
            {saveMutation.error ? (
              <span className="max-w-80 truncate text-xs text-destructive">
                {saveMutation.error instanceof Error ? saveMutation.error.message : '保存失败'}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => flowQuery.refetch()}
              disabled={flowQuery.isFetching || saveMutation.isPending}
            >
              <RefreshCw className="size-4" />
              重载
            </Button>
            <Button type="button" size="sm" onClick={saveFlow} disabled={isReadonly}>
              <Save className="size-4" />
              保存
            </Button>
          </div>
        </div>
        <div className="business-flow-canvas" ref={containerRef} />
      </main>

      <aside className="business-flow-inspector">
        <div className="business-flow-panel-header">
          <div>
            <h3>属性</h3>
            <p>{selectedCell ? selectedCell.id : '未选择'}</p>
          </div>
          {selectedNodeType ? <Badge variant="secondary">{nodeTypeLabel(selectedNodeType)}</Badge> : null}
        </div>

        {selectedCell ? (
          <div className="business-flow-inspector-body">
            <div className="grid gap-2">
              <Label htmlFor="flow-cell-label">名称</Label>
              <Input
                id="flow-cell-label"
                value={selectedLabel}
                onChange={(event) => updateSelectedLabel(event.target.value)}
                disabled={isReadonly}
              />
            </div>

            {selectedNode?.shape === SHAPE_BY_TYPE.subprocess ? (
              <div className="grid gap-2">
                <Label htmlFor="flow-subprocess-details">展开明细</Label>
                <Textarea
                  id="flow-subprocess-details"
                  className="min-h-28 resize-none"
                  value={((selectedNode.getData() ?? {}) as BusinessFlowNode).details ?? ''}
                  onChange={(event) => updateSubprocessDetails(event.target.value)}
                  disabled={isReadonly}
                />
              </div>
            ) : null}

            {selectedEdge ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dashed = !selectedEdge.attr('line/strokeDasharray')
                    selectedEdge.attr('line/strokeDasharray', dashed ? '5,5' : null)
                    selectedEdge.setData({ ...(selectedEdge.getData() ?? {}), dashed })
                    bump()
                  }}
                  disabled={isReadonly}
                >
                  <ArrowDownToLine className="size-4" />
                  切换虚线
                </Button>
              </div>
            ) : null}

            {selectedNodeType && canBindBusinessFlowNode(selectedNodeType) ? (
              <div className="business-flow-binding-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">ER 绑定</div>
                  {selectedBinding ? <Badge variant="outline">{selectedBinding.usage_type}</Badge> : null}
                </div>
                <div className="grid gap-2">
                  <Label>目标</Label>
                  <Select
                    value={selectedBinding ? bindingTargetValue(selectedBinding) : 'none'}
                    onValueChange={updateBindingTarget}
                    disabled={isReadonly || graphQuery.isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-w-96">
                      <SelectGroup>
                        {bindingTargetOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                {selectedBinding ? (
                  <>
                    <div className="grid gap-2">
                      <Label>用途</Label>
                      <Select
                        value={String(selectedBinding.usage_type ?? 'read')}
                        onValueChange={(value) => updateBindingPatch({ usage_type: value })}
                        disabled={isReadonly}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {BUSINESS_FLOW_BINDING_USAGE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="flow-binding-description">说明</Label>
                      <Textarea
                        id="flow-binding-description"
                        className="min-h-24 resize-none"
                        value={selectedBinding.description ?? ''}
                        onChange={(event) =>
                          updateBindingPatch({ description: event.target.value || null })
                        }
                        disabled={isReadonly}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : selectedNode ? (
              <div className="business-flow-help">
                只有任务和子流程节点可绑定 ER 表、字段或关系。
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deleteSelection}
              disabled={isReadonly}
            >
              <Trash2 className="size-4" />
              删除选中
            </Button>
          </div>
        ) : (
          <div className="business-flow-empty">
            <Plus className="size-5" />
            <span>选择节点或连线后编辑属性。</span>
          </div>
        )}
      </aside>
    </div>
  )
}
