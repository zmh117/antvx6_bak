import { Edge, Graph, Node, Shape, Transform, type Cell, type ValidateConnectionArgs } from '@antv/x6'
import type {
  BusinessFlowEdgeRecord,
  BusinessFlowJson,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  BusinessFlowNodeType,
  LocalBusinessFlowCanvas,
  SwimlaneComponentVersion,
} from '@/entities/business-flow'
import type {
  ComponentEditorEdgeDraft,
  ComponentEditorNodeDraft,
} from '@/features/business-flow/domain/localBusinessFlowStore'

export const NODE_PORTS = {
  groups: {
    top: portGroup('top'),
    right: portGroup('right'),
    bottom: portGroup('bottom'),
    left: portGroup('left'),
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'right', group: 'right' },
    { id: 'bottom', group: 'bottom' },
    { id: 'left', group: 'left' },
  ],
}

export type FlowCellRole = 'LANE_INSTANCE' | 'FLOW_NODE' | 'FLOW_EDGE' | 'COMPONENT_NODE' | 'COMPONENT_EDGE'

export type FlowCellData = {
  boundedContext: 'business-flow'
  cellRole: FlowCellRole
  businessFlowId?: string
  laneInstanceId?: string
  laneInstanceKey?: string
  nodeKey?: string
  edgeKey?: string
  componentId?: string
  componentVersionId?: string
  originComponentNodeKey?: string | null
  originComponentEdgeKey?: string | null
  nodeType?: BusinessFlowNodeType
  title?: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  erRefs?: BusinessFlowNodeErRef[]
  layoutJson?: BusinessFlowJson | null
}

type Point = { x: number; y: number }
type TerminalData = ReturnType<Edge['getSource']>

export const BUSINESS_FLOW_LANE_LAYOUT = {
  paddingLeft: 24,
  paddingRight: 32,
  headerHeight: 46,
  paddingBottom: 32,
  minWidth: 360,
  minHeight: 360,
}

const LANE_Z_INDEX_BASE = 10
const EDGE_Z_INDEX = 200
const FLOW_NODE_Z_INDEX = 300
const UNBOUNDED_DRAG_SIZE = 100000

function portGroup(position: 'top' | 'right' | 'bottom' | 'left') {
  return {
    position,
    attrs: {
      circle: {
        r: 5,
        magnet: true,
        stroke: '#5f95ff',
        strokeWidth: 1.5,
        fill: '#fff',
        cursor: 'crosshair',
        visibility: 'visible',
      },
    },
  }
}

function nodeBodyAttrs(type: BusinessFlowNodeType) {
  const common = {
    stroke: '#5f95ff',
    strokeWidth: 1.6,
    fill: '#f7faff',
  }
  if (type === 'END') return { ...common, stroke: '#ef4444', fill: '#fff7f7' }
  if (type === 'START') return { ...common, stroke: '#22c55e', fill: '#f6fff8' }
  if (type === 'EVENT') return { ...common, stroke: '#8b5cf6', fill: '#faf5ff' }
  if (type === 'SERVICE') return { ...common, fill: '#eef6ff' }
  if (type === 'MANUAL') return { ...common, fill: '#fff8ed' }
  return common
}

function nodeMarkup(type: BusinessFlowNodeType) {
  if (type === 'DECISION') {
    return [
      { tagName: 'polygon', selector: 'body' },
      { tagName: 'text', selector: 'label' },
    ]
  }
  if (type === 'START' || type === 'END' || type === 'EVENT') {
    return [
      { tagName: 'circle', selector: 'body' },
      { tagName: 'text', selector: 'label' },
    ]
  }
  return [
    { tagName: 'rect', selector: 'body' },
    { tagName: 'text', selector: 'label' },
    { tagName: 'text', selector: 'badge' },
  ]
}

function nodeAttrs(type: BusinessFlowNodeType, title: string) {
  const body = nodeBodyAttrs(type)
  if (type === 'DECISION') {
    return {
      body: {
        refPoints: '0,10 10,0 20,10 10,20',
        ...body,
      },
      label: labelAttrs(title),
      badge: { text: '' },
    }
  }
  if (type === 'START' || type === 'END' || type === 'EVENT') {
    return {
      body: {
        refCx: '50%',
        refCy: '50%',
        refR: '48%',
        ...body,
      },
      label: labelAttrs(title, 11),
      badge: { text: '' },
    }
  }
  return {
    body: {
      rx: 6,
      ry: 6,
      ...body,
    },
    label: labelAttrs(title),
    badge: {
      text: typeText(type),
      refX: 8,
      refY: 14,
      fontSize: 9,
      fontWeight: 600,
      fill: '#5f95ff',
      textAnchor: 'start',
      textVerticalAnchor: 'middle',
    },
  }
}

function labelAttrs(text: string, fontSize = 12) {
  return {
    text,
    refX: '50%',
    refY: '56%',
    fill: '#1f2937',
    fontSize,
    fontWeight: 600,
    textAnchor: 'middle',
    textVerticalAnchor: 'middle',
    textWrap: {
      width: -14,
      height: -10,
      ellipsis: true,
    },
  }
}

function typeText(type: BusinessFlowNodeType) {
  const labels: Record<BusinessFlowNodeType, string> = {
    START: 'START',
    END: 'END',
    TASK: 'TASK',
    DECISION: 'IF',
    SERVICE: 'API',
    MANUAL: 'USER',
    EVENT: 'EVT',
  }
  return labels[type]
}

function edgeLabels(label?: string | null) {
  return label
    ? [
        {
          attrs: {
            label: {
              text: label,
              fill: '#475569',
              fontSize: 11,
              fontWeight: 500,
            },
            body: {
              fill: '#ffffff',
              stroke: '#dbe3ef',
              strokeWidth: 1,
              rx: 4,
              ry: 4,
            },
          },
        },
      ]
    : []
}

export function registerBusinessFlowShapes() {
  Graph.registerNode(
    'bf-lane',
    {
      inherit: 'rect',
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'rect', selector: 'header' },
        { tagName: 'text', selector: 'label' },
        { tagName: 'text', selector: 'owner' },
      ],
      attrs: {
        body: {
          rx: 8,
          ry: 8,
          stroke: '#8fb2ff',
          strokeWidth: 1.5,
          fill: '#ffffff',
        },
        header: {
          refWidth: '100%',
          height: 34,
          rx: 8,
          ry: 8,
          fill: '#5f95ff',
          stroke: '#5f95ff',
          strokeWidth: 1.5,
        },
        label: {
          refX: 14,
          refY: 18,
          textAnchor: 'start',
          textVerticalAnchor: 'middle',
          fontSize: 13,
          fontWeight: 700,
          fill: '#ffffff',
        },
        owner: {
          refX: '100%',
          refX2: -14,
          refY: 18,
          textAnchor: 'end',
          textVerticalAnchor: 'middle',
          fontSize: 11,
          fontWeight: 500,
          fill: '#eaf1ff',
        },
      },
    },
    true,
  )

  const nodeTypes: BusinessFlowNodeType[] = [
    'START',
    'END',
    'TASK',
    'DECISION',
    'SERVICE',
    'MANUAL',
    'EVENT',
  ]
  nodeTypes.forEach((type) => {
    Graph.registerNode(
      shapeName(type),
      {
        inherit: 'rect',
        markup: nodeMarkup(type),
        attrs: nodeAttrs(type, typeText(type)),
        ports: NODE_PORTS,
      },
      true,
    )
  })
}

export function createBusinessFlowGraph(container: HTMLElement) {
  registerBusinessFlowShapes()
  const graph = new Graph({
    container,
    autoResize: true,
    background: { color: '#f7f8fb' },
    grid: { visible: true, type: 'dot', args: { color: '#e1e7f0' } },
    panning: { enabled: true, eventTypes: ['rightMouseDown'] },
    mousewheel: {
      enabled: true,
      modifiers: 'ctrl',
      minScale: 0.35,
      maxScale: 2.4,
    },
    translating: {
      restrict(view) {
        const cell = view?.cell
        if (!cell || !cell.isNode() || readCellData(cell).cellRole !== 'FLOW_NODE') return null
        const parent = cell.getParent()
        if (!(parent instanceof Node) || readCellData(parent).cellRole !== 'LANE_INSTANCE') return null
        const parentPosition = parent.position()
        return {
          x: parentPosition.x + BUSINESS_FLOW_LANE_LAYOUT.paddingLeft,
          y: parentPosition.y + BUSINESS_FLOW_LANE_LAYOUT.headerHeight,
          width: UNBOUNDED_DRAG_SIZE,
          height: UNBOUNDED_DRAG_SIZE,
        }
      },
    },
    connecting: {
      router: { name: 'manhattan' },
      connector: { name: 'rounded', args: { radius: 8 } },
      anchor: 'center',
      connectionPoint: 'anchor',
      allowBlank: false,
      allowLoop: false,
      allowPort: true,
      allowMulti: allowMultiplePortEdges,
      snap: { radius: 20 },
      validateMagnet({ magnet }) {
        return magnet.getAttribute('magnet') === 'true'
      },
      validateConnection: validatePortConnection,
      createEdge() {
        return new Shape.Edge({
          attrs: edgeAttrs(false),
          zIndex: EDGE_Z_INDEX,
          data: {
            boundedContext: 'business-flow',
            cellRole: 'FLOW_EDGE',
          } satisfies FlowCellData,
        })
      },
    },
    interacting: {
      nodeMovable(view) {
        return readCellData(view.cell).cellRole !== 'FLOW_EDGE'
      },
    },
  })
  graph.use(
    new Transform({
      resizing: {
        enabled(node) {
          return readCellData(node).cellRole === 'LANE_INSTANCE'
        },
        minWidth(node) {
          return minLaneSize(node).width
        },
        minHeight(node) {
          return minLaneSize(node).height
        },
        orthogonal: true,
        allowReverse: false,
      },
      rotating: false,
    }),
  )
  return graph
}

function allowMultiplePortEdges() {
  return true
}

function validatePortConnection({ sourceCell, targetCell, sourceMagnet, targetMagnet }: ValidateConnectionArgs) {
  if (!sourceCell || !targetCell || sourceCell === targetCell) return false
  if (!isFlowNodeCell(sourceCell) || !isFlowNodeCell(targetCell)) return false
  return isReusablePort(sourceMagnet) && isReusablePort(targetMagnet)
}

function isFlowNodeCell(cell: Cell) {
  const role = readCellData(cell).cellRole
  return role === 'FLOW_NODE' || role === 'COMPONENT_NODE'
}

function isReusablePort(magnet?: Element | null) {
  return magnet?.getAttribute('magnet') === 'true'
}

export function shapeName(type: BusinessFlowNodeType) {
  return `bf-node-${type.toLocaleLowerCase()}`
}

export function graphPointFromEvent(graph: Graph, event: DragEvent): Point {
  const client = graph.clientToLocal({ x: event.clientX, y: event.clientY })
  return { x: client.x, y: client.y }
}

export function addComponentNode(graph: Graph, draft: ComponentEditorNodeDraft) {
  return graph.addNode({
    id: draft.nodeKey,
    shape: shapeName(draft.nodeType),
    x: draft.position.x,
    y: draft.position.y,
    width: draft.size.width,
    height: draft.size.height,
    attrs: nodeAttrs(draft.nodeType, draft.title),
    ports: NODE_PORTS,
    data: {
      boundedContext: 'business-flow',
      cellRole: 'COMPONENT_NODE',
      nodeKey: draft.nodeKey,
      nodeType: draft.nodeType,
      title: draft.title,
      description: draft.description ?? null,
      actor: draft.actor ?? null,
      businessRule: draft.businessRule ?? null,
    } satisfies FlowCellData,
    zIndex: FLOW_NODE_Z_INDEX,
  })
}

export function addFlowNode(graph: Graph, record: BusinessFlowNodeRecord) {
  return graph.addNode({
    id: record.nodeKey,
    shape: shapeName(record.nodeType),
    x: record.position.x,
    y: record.position.y,
    width: record.size.width,
    height: record.size.height,
    attrs: nodeAttrs(record.nodeType, record.title),
    ports: NODE_PORTS,
    data: {
      boundedContext: 'business-flow',
      cellRole: 'FLOW_NODE',
      businessFlowId: record.businessFlowId,
      laneInstanceId: record.laneInstanceId,
      laneInstanceKey: undefined,
      nodeKey: record.nodeKey,
      originComponentNodeKey: record.originComponentNodeKey,
      nodeType: record.nodeType,
      title: record.title,
      description: record.description ?? null,
      actor: record.actor ?? null,
      businessRule: record.businessRule ?? null,
      erRefs: record.erRefs ?? [],
    } satisfies FlowCellData,
    zIndex: FLOW_NODE_Z_INDEX,
  })
}

export function renderComponentVersion(graph: Graph, version: SwimlaneComponentVersion) {
  graph.clearCells()
  version.nodes.forEach((node) => addComponentNode(graph, node))
  version.edges.forEach((edge) => {
    graph.addEdge({
      id: edge.edgeKey,
      source: { cell: edge.sourceNodeKey, port: edge.sourcePort ?? undefined },
      target: { cell: edge.targetNodeKey, port: edge.targetPort ?? undefined },
      attrs: edgeAttrs(false),
      labels: edgeLabels(edge.label),
      data: {
        boundedContext: 'business-flow',
        cellRole: 'COMPONENT_EDGE',
        edgeKey: edge.edgeKey,
        title: edge.label ?? '',
      } satisfies FlowCellData,
      zIndex: EDGE_Z_INDEX,
    })
  })
  graph.centerContent()
}

function addLaneInstanceCell(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  lane: LocalBusinessFlowCanvas['laneInstances'][number],
) {
  graph.addNode({
    id: lane.instanceKey,
    shape: 'bf-lane',
    x: lane.position.x,
    y: lane.position.y,
    width: lane.size.width,
    height: lane.size.height,
    attrs: {
      label: { text: lane.displayName },
      owner: { text: lane.ownerRole ?? '' },
    },
    data: {
      boundedContext: 'business-flow',
      cellRole: 'LANE_INSTANCE',
      businessFlowId: canvas.businessFlowId,
      laneInstanceId: lane.laneInstanceId,
      laneInstanceKey: lane.instanceKey,
      componentId: lane.componentId,
      componentVersionId: lane.componentVersionId,
      title: lane.displayName,
      layoutJson: lane.layoutJson ?? null,
    } satisfies FlowCellData,
    zIndex: LANE_Z_INDEX_BASE + lane.zIndex,
  })
}

function addFlowNodeCell(
  graph: Graph,
  node: BusinessFlowNodeRecord,
  laneById: Map<string, LocalBusinessFlowCanvas['laneInstances'][number]>,
  laneKeyById: Map<string, string>,
) {
  const laneKey = laneKeyById.get(node.laneInstanceId)
  const laneRecord = laneById.get(node.laneInstanceId)
  const x6Node = addFlowNode(graph, {
    ...node,
    position: laneRecord
      ? {
          x: laneRecord.position.x + node.position.x,
          y: laneRecord.position.y + node.position.y,
        }
      : node.position,
  })
  const lane = laneKey ? graph.getCellById(laneKey) : null
  if (lane instanceof Node) {
    lane.addChild(x6Node)
    x6Node.setData(
      {
        ...readCellData(x6Node),
        laneInstanceKey: laneKey,
      },
      { silent: true },
    )
  }
}

function addFlowEdgeCell(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  edge: LocalBusinessFlowCanvas['edges'][number],
) {
  if (!edge.sourceNodeKey || !edge.targetNodeKey) return
  graph.addEdge({
    id: edge.edgeKey,
    source: { cell: edge.sourceNodeKey, port: edge.sourcePort ?? undefined },
    target: { cell: edge.targetNodeKey, port: edge.targetPort ?? undefined },
    attrs: edgeAttrs(edge.isCrossLane),
    labels: edgeLabels(edge.label),
    data: {
      boundedContext: 'business-flow',
      cellRole: 'FLOW_EDGE',
      businessFlowId: canvas.businessFlowId,
      laneInstanceId: edge.laneInstanceId ?? undefined,
      edgeKey: edge.edgeKey,
      originComponentEdgeKey: edge.originComponentEdgeKey,
      title: edge.label ?? '',
    } satisfies FlowCellData,
    zIndex: EDGE_Z_INDEX,
  })
}

export function renderBusinessFlowCanvas(graph: Graph, canvas: LocalBusinessFlowCanvas) {
  graph.clearCells()
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  const laneById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane]))
  canvas.laneInstances.forEach((lane) => addLaneInstanceCell(graph, canvas, lane))
  canvas.nodes.forEach((node) => addFlowNodeCell(graph, node, laneById, laneKeyById))
  normalizeBusinessFlowLanes(graph, { preserveManualSize: true })
  canvas.edges.forEach((edge) => addFlowEdgeCell(graph, canvas, edge))
  graph.zoomToFit({ maxScale: 1, minScale: 0.7, padding: 40 })
}

/**
 * 增量挂载画布中尚未渲染的 cell（按 id 去重），不触碰已有 cell 的视图。
 * 用于放置新泳道等场景，避免对已挂载画布做 clearCells + 全量重建（会在 X6 复用
 * id 的视图上留下拖动残影）。返回是否有新增。
 */
export function addMissingBusinessFlowCells(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
): boolean {
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  const laneById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane]))
  let added = false
  canvas.laneInstances.forEach((lane) => {
    if (graph.getCellById(lane.instanceKey)) return
    addLaneInstanceCell(graph, canvas, lane)
    added = true
  })
  canvas.nodes.forEach((node) => {
    if (graph.getCellById(node.nodeKey)) return
    addFlowNodeCell(graph, node, laneById, laneKeyById)
    added = true
  })
  if (added) {
    normalizeBusinessFlowLanes(graph, { preserveManualSize: true })
  }
  canvas.edges.forEach((edge) => {
    if (!edge.sourceNodeKey || !edge.targetNodeKey) return
    if (graph.getCellById(edge.edgeKey)) return
    addFlowEdgeCell(graph, canvas, edge)
  })
  return added
}

export function normalizeBusinessFlowLanes(
  graph: Graph,
  options: {
    preserveManualSize?: boolean
    clampChildren?: boolean
    shrinkToFit?: boolean
  } = {},
) {
  let changed = false
  graph.getNodes().forEach((node) => {
    if (readCellData(node).cellRole !== 'LANE_INSTANCE') return
    changed = fitLaneToChildren(node, options) || changed
  })
  return changed
}

export function fitLaneToChildren(
  lane: Node,
  options: {
    preserveManualSize?: boolean
    clampChildren?: boolean
    shrinkToFit?: boolean
  } = {},
) {
  const children = flowNodeChildren(lane)
  const layout = BUSINESS_FLOW_LANE_LAYOUT
  let changed = false
  let maxRight = layout.paddingLeft
  let maxBottom = layout.headerHeight

  children.forEach((child) => {
    const relativePosition = child.position({ relative: true })
    const size = child.size()
    const shouldClampChildren = options.clampChildren ?? true
    const nextX = shouldClampChildren
      ? Math.max(layout.paddingLeft, relativePosition.x)
      : relativePosition.x
    const nextY = shouldClampChildren
      ? Math.max(layout.headerHeight, relativePosition.y)
      : relativePosition.y
    if (nextX !== relativePosition.x || nextY !== relativePosition.y) {
      child.position(nextX, nextY, { relative: true })
      changed = true
    }
    maxRight = Math.max(maxRight, nextX + size.width)
    maxBottom = Math.max(maxBottom, nextY + size.height)
  })

  const sizePolicy = readLaneSizePolicy(lane)
  const currentSize = lane.size()
  const contentWidth = Math.max(
    layout.minWidth,
    maxRight + layout.paddingRight,
    options.preserveManualSize ? sizePolicy.manualWidth ?? 0 : 0,
  )
  const contentHeight = Math.max(
    layout.minHeight,
    maxBottom + layout.paddingBottom,
    options.preserveManualSize ? sizePolicy.manualHeight ?? 0 : 0,
  )
  const canShrink = options.shrinkToFit ?? true
  const requiredWidth = canShrink
    ? contentWidth
    : Math.max(currentSize.width, contentWidth)
  const requiredHeight = canShrink
    ? contentHeight
    : Math.max(currentSize.height, contentHeight)
  if (currentSize.width !== requiredWidth || currentSize.height !== requiredHeight) {
    lane.resize(requiredWidth, requiredHeight)
    changed = true
  }
  return changed
}

export function rememberManualLaneSize(lane: Node) {
  const currentSize = lane.size()
  const minimum = minLaneSize(lane)
  const manualWidth = Math.max(currentSize.width, minimum.width)
  const manualHeight = Math.max(currentSize.height, minimum.height)
  if (manualWidth !== currentSize.width || manualHeight !== currentSize.height) {
    lane.resize(manualWidth, manualHeight)
  }
  setLaneSizePolicy(lane, { manualWidth, manualHeight })
}

export function componentDraftFromGraph(graph: Graph) {
  const nodes: ComponentEditorNodeDraft[] = graph
    .getNodes()
    .filter((node) => readCellData(node).cellRole === 'COMPONENT_NODE')
    .map((node) => {
      const data = readCellData(node)
      const position = node.position()
      const size = node.size()
      return {
        nodeKey: data.nodeKey ?? node.id,
        nodeType: data.nodeType ?? 'TASK',
        title: data.title ?? String(node.attr('label/text') ?? '任务'),
        description: data.description ?? null,
        actor: data.actor ?? null,
        businessRule: data.businessRule ?? null,
        position,
        size,
      }
    })
  const edges: ComponentEditorEdgeDraft[] = graph
    .getEdges()
    .filter((edge) => readCellData(edge).cellRole === 'COMPONENT_EDGE')
    .flatMap((edge) => {
      const source = edge.getSource()
      const target = edge.getTarget()
      const sourceCell = terminalCellId(source)
      const targetCell = terminalCellId(target)
      if (!sourceCell || !targetCell) return []
      const data = readCellData(edge)
      return [
        {
          edgeKey: data.edgeKey ?? edge.id,
          sourceNodeKey: sourceCell,
          targetNodeKey: targetCell,
          sourcePort: terminalPort(source),
          targetPort: terminalPort(target),
          edgeType: 'SEQUENCE' as const,
          label: data.title ?? readEdgeLabel(edge),
          conditionText: null,
        },
      ]
    })
  return { nodes, edges }
}

export function flowDraftFromGraph(
  graph: Graph,
  canvas: Pick<LocalBusinessFlowCanvas, 'businessFlowId' | 'name' | 'code' | 'description'>,
) {
  const timestamp = new Date().toISOString()
  const lanes = graph
    .getNodes()
    .filter((node) => readCellData(node).cellRole === 'LANE_INSTANCE')
    .map((node, index) => {
      const data = readCellData(node)
      const position = node.position()
      const size = node.size()
      return {
        kind: 'LANE_INSTANCE' as const,
        businessFlowId: canvas.businessFlowId,
        laneInstanceId: data.laneInstanceId ?? node.id,
        instanceKey: data.laneInstanceKey ?? node.id,
        componentId: data.componentId ?? '',
        componentVersionId: data.componentVersionId ?? '',
        componentName: data.title ?? String(node.attr('label/text') ?? '泳道实例'),
        componentVersionNo: 1,
        displayName: String(node.attr('label/text') ?? data.title ?? '泳道实例'),
        ownerRole: String(node.attr('owner/text') ?? ''),
        isOverridden: true,
        position,
        size,
        zIndex: index + 1,
        layoutJson: (data.layoutJson as BusinessFlowJson | null | undefined) ?? null,
        overrideJson: null,
        status: 'ACTIVE' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })
  const laneIdByKey = new Map(lanes.map((lane) => [lane.instanceKey, lane.laneInstanceId]))
  const nodeLaneKey = new Map<string, string | undefined>()
  const nodes = graph
    .getNodes()
    .filter((node) => readCellData(node).cellRole === 'FLOW_NODE')
    .map((node) => {
      const data = readCellData(node)
      const parent = node.getParent()
      const position =
        parent instanceof Node && readCellData(parent).cellRole === 'LANE_INSTANCE'
          ? node.position({ relative: true })
          : node.position()
      const size = node.size()
      const laneKey = data.laneInstanceKey ?? parent?.id
      nodeLaneKey.set(node.id, laneKey)
      return {
        kind: 'BUSINESS_FLOW_NODE' as const,
        businessFlowId: canvas.businessFlowId,
        nodeId: data.nodeKey ?? node.id,
        nodeKey: data.nodeKey ?? node.id,
        laneInstanceId: data.laneInstanceId ?? laneIdByKey.get(laneKey ?? '') ?? '',
        originComponentNodeKey: data.originComponentNodeKey ?? null,
        nodeType: data.nodeType ?? 'TASK',
        title: data.title ?? String(node.attr('label/text') ?? '任务'),
        description: data.description ?? null,
        actor: data.actor ?? null,
        businessRule: data.businessRule ?? null,
        erRefs: data.erRefs ?? [],
        position,
        size,
        inputSummary: null,
        outputSummary: null,
        isOverridden: true,
        styleJson: null,
        propertiesJson: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies BusinessFlowNodeRecord
    })
  const edges = graph
    .getEdges()
    .filter((edge) => readCellData(edge).cellRole === 'FLOW_EDGE')
    .flatMap((edge) => {
      const source = edge.getSource()
      const target = edge.getTarget()
      const sourceCell = terminalCellId(source)
      const targetCell = terminalCellId(target)
      if (!sourceCell || !targetCell) return []
      const data = readCellData(edge)
      const sourceNodeKey = sourceCell
      const targetNodeKey = targetCell
      const sourceLaneKey = nodeLaneKey.get(sourceNodeKey)
      const targetLaneKey = nodeLaneKey.get(targetNodeKey)
      const isCrossLane = Boolean(sourceLaneKey && targetLaneKey && sourceLaneKey !== targetLaneKey)
      return [
        {
          kind: 'BUSINESS_FLOW_EDGE' as const,
          businessFlowId: canvas.businessFlowId,
          edgeId: data.edgeKey ?? edge.id,
          edgeKey: data.edgeKey ?? edge.id,
          laneInstanceId: isCrossLane ? null : laneIdByKey.get(sourceLaneKey ?? '') ?? null,
          edgeType: isCrossLane ? 'DEPENDENCY' : 'SEQUENCE',
          label: data.title ?? readEdgeLabel(edge),
          conditionText: null,
          dataContract: undefined,
          isCrossLane,
          sourceType: 'NODE' as const,
          sourceNodeKey,
          sourceLaneInstanceKey: null,
          sourcePort: terminalPort(source),
          targetType: 'NODE' as const,
          targetNodeKey,
          targetLaneInstanceKey: null,
          targetPort: terminalPort(target),
          originComponentEdgeKey: data.originComponentEdgeKey ?? null,
          isOverridden: true,
          styleJson: null,
          propertiesJson: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies BusinessFlowEdgeRecord,
      ]
    })
  return {
    businessFlowId: canvas.businessFlowId,
    name: canvas.name,
    code: canvas.code,
    description: canvas.description,
    laneInstances: lanes,
    nodes,
    edges,
  }
}

export function updateNodeText(cell: Cell, title: string) {
  cell.attr('label/text', title)
  cell.setData({ ...readCellData(cell), title })
}

export function updateEdgeText(edge: Edge, label: string) {
  edge.setLabels(edgeLabels(label))
  edge.setData({ ...readCellData(edge), title: label })
}

export function readCellData(cell: Cell): Partial<FlowCellData> {
  const data = cell.getData() as Partial<FlowCellData> | null
  return data ?? {}
}

function flowNodeChildren(lane: Node) {
  return (
    lane
      .getChildren()
      ?.filter((child): child is Node => child instanceof Node && readCellData(child).cellRole === 'FLOW_NODE') ?? []
  )
}

function minLaneSize(lane: Node) {
  const layout = BUSINESS_FLOW_LANE_LAYOUT
  let maxRight = layout.paddingLeft
  let maxBottom = layout.headerHeight
  flowNodeChildren(lane).forEach((child) => {
    const position = child.position({ relative: true })
    const size = child.size()
    maxRight = Math.max(maxRight, Math.max(layout.paddingLeft, position.x) + size.width)
    maxBottom = Math.max(maxBottom, Math.max(layout.headerHeight, position.y) + size.height)
  })
  return {
    width: Math.max(layout.minWidth, maxRight + layout.paddingRight),
    height: Math.max(layout.minHeight, maxBottom + layout.paddingBottom),
  }
}

function readLaneSizePolicy(lane: Node): { manualWidth?: number; manualHeight?: number } {
  const layoutJson = readCellData(lane).layoutJson
  const sizePolicy =
    layoutJson && typeof layoutJson === 'object' && 'sizePolicy' in layoutJson
      ? (layoutJson.sizePolicy as Record<string, unknown>)
      : null
  const manualWidth = Number(sizePolicy?.manualWidth)
  const manualHeight = Number(sizePolicy?.manualHeight)
  return {
    manualWidth: Number.isFinite(manualWidth) ? manualWidth : undefined,
    manualHeight: Number.isFinite(manualHeight) ? manualHeight : undefined,
  }
}

function setLaneSizePolicy(
  lane: Node,
  policy: { manualWidth?: number; manualHeight?: number },
) {
  const data = readCellData(lane)
  const previousLayoutJson = data.layoutJson ?? {}
  const previousSizePolicy =
    'sizePolicy' in previousLayoutJson
      ? (previousLayoutJson.sizePolicy as Record<string, unknown>)
      : {}
  const layoutJson = {
    ...previousLayoutJson,
    sizePolicy: {
      ...previousSizePolicy,
      ...policy,
    },
  }
  lane.setData({ ...data, layoutJson })
}

function edgeAttrs(crossLane: boolean) {
  return {
    line: {
      stroke: crossLane ? '#f97316' : '#9aa8bd',
      strokeWidth: crossLane ? 2 : 1.6,
      targetMarker: {
        name: 'block',
        width: 8,
        height: 6,
      },
      strokeDasharray: crossLane ? '6 4' : '',
    },
  }
}

function terminalCellId(terminal: TerminalData) {
  return 'cell' in terminal && terminal.cell ? String(terminal.cell) : null
}

function terminalPort(terminal: TerminalData) {
  return 'port' in terminal && terminal.port ? String(terminal.port) : null
}

function readEdgeLabel(edge: Edge) {
  const label = edge.getLabelAt(0)?.attrs?.label?.text
  return typeof label === 'string' ? label : null
}
