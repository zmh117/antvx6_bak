import { Edge, Graph, Node, Shape, Transform, type Cell, type ValidateConnectionArgs } from '@antv/x6'
import type { CellAttrs } from '@antv/x6/lib/registry/attr'
import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BusinessFlowEdgeRecord,
  BusinessFlowJson,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  BusinessFlowNodeType,
  LocalBusinessFlowCanvas,
  ProcessContainerConfig,
  SwimlaneComponentVersion,
  TaskUiContext,
} from '@/entities/business-flow'
import {
  BPMN_NODE_OPTIONS,
  bpmnNodeTitle,
  isDataBpmnElement,
  isProcessContainerConfig,
  legacyEdgeTypeForBpmn,
  legacyNodeTypeForBpmn,
  mergeBpmnIntoProperties,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
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
  edgeType?: BusinessFlowEdgeRecord['edgeType'] | null
  bpmnElementType?: BpmnNodeProfile['bpmnElementType'] | null
  bpmnEventKind?: BpmnNodeProfile['bpmnEventKind'] | null
  bpmnEventDefinition?: BpmnNodeProfile['bpmnEventDefinition'] | null
  bpmnTaskType?: BpmnNodeProfile['bpmnTaskType'] | null
  bpmnGatewayType?: BpmnNodeProfile['bpmnGatewayType'] | null
  bpmnSubProcessKind?: BpmnNodeProfile['bpmnSubProcessKind'] | null
  bpmnCallActivityRef?: string | null
  bpmnFlowType?: BpmnEdgeProfile['bpmnFlowType'] | null
  bpmnSequenceFlowKind?: BpmnEdgeProfile['bpmnSequenceFlowKind'] | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
  semanticProfileKey?: string | null
  semanticProfileVersion?: number | null
  semanticPayloadJson?: BusinessFlowJson | null
  taskUiJson?: TaskUiContext | null
  processContainerJson?: ProcessContainerConfig | null
  containerNodeKey?: string | null
  title?: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
  erRefs?: BusinessFlowNodeErRef[]
  layoutJson?: BusinessFlowJson | null
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
}

type Point = { x: number; y: number }
type Bounds = { x: number; y: number; width: number; height: number }
type TerminalData = ReturnType<Edge['getSource']>

export const BUSINESS_FLOW_LANE_LAYOUT = {
  paddingLeft: 24,
  paddingRight: 32,
  headerHeight: 46,
  paddingBottom: 32,
  minWidth: 360,
  minHeight: 360,
}

const PROCESS_CONTAINER_LAYOUT = {
  headerHeight: 38,
  paddingLeft: 24,
  paddingRight: 32,
  paddingTop: 44,
  paddingBottom: 32,
  minWidth: 260,
  minHeight: 170,
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

function nodeProfileFromData(data: Partial<FlowCellData>) {
  return normalizeBpmnNodeProfile({
    nodeType: data.nodeType,
    bpmnElementType: data.bpmnElementType,
    bpmnEventKind: data.bpmnEventKind,
    bpmnEventDefinition: data.bpmnEventDefinition,
    bpmnTaskType: data.bpmnTaskType,
    bpmnGatewayType: data.bpmnGatewayType,
    bpmnSubProcessKind: data.bpmnSubProcessKind,
    bpmnCallActivityRef: data.bpmnCallActivityRef,
    propertiesJson: data.propertiesJson,
  })
}

function edgeProfileFromData(data: Partial<FlowCellData>, fallback?: Partial<BpmnEdgeProfile>) {
  return normalizeBpmnEdgeProfile({
    ...fallback,
    edgeType: data.edgeType ?? null,
    bpmnFlowType: data.bpmnFlowType ?? fallback?.bpmnFlowType,
    bpmnSequenceFlowKind: data.bpmnSequenceFlowKind ?? fallback?.bpmnSequenceFlowKind,
    bpmnMessageName: data.bpmnMessageName ?? fallback?.bpmnMessageName,
    bpmnConditionExpression:
      data.bpmnConditionExpression ?? fallback?.bpmnConditionExpression,
    propertiesJson: data.propertiesJson,
  })
}

function nodeProfileKey(profile: BpmnNodeProfile) {
  if (profile.bpmnElementType === 'EVENT') {
    return `event-${profile.bpmnEventKind ?? 'INTERMEDIATE'}-${profile.bpmnEventDefinition ?? 'NONE'}`
  }
  if (profile.bpmnElementType === 'TASK') return `task-${profile.bpmnTaskType ?? 'NONE'}`
  if (profile.bpmnElementType === 'GATEWAY') return `gateway-${profile.bpmnGatewayType ?? 'EXCLUSIVE'}`
  if (profile.bpmnElementType === 'SUB_PROCESS') {
    return `sub-process-${profile.bpmnSubProcessKind ?? 'EMBEDDED'}`
  }
  return profile.bpmnElementType
}

function isProcessContainerProfile(profile: BpmnNodeProfile) {
  return profile.bpmnElementType === 'SUB_PROCESS' && profile.bpmnSubProcessKind === 'EMBEDDED'
}

function isProcessContainerCell(cell?: Cell | null) {
  if (!(cell instanceof Node) || !isFlowNodeCell(cell)) return false
  const data = readCellData(cell)
  return Boolean(
    isProcessContainerProfile(nodeProfileFromData(data)) &&
      isProcessContainerConfig(data.processContainerJson),
  )
}

function shapeNameForProfile(profile: BpmnNodeProfile) {
  return `bf-bpmn-${nodeProfileKey(profile).toLocaleLowerCase().replaceAll('_', '-')}`
}

function nodeBodyAttrs(profile: BpmnNodeProfile) {
  const common = {
    stroke: '#5f95ff',
    strokeWidth: 1.6,
    fill: '#f7faff',
  }
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return { ...common, stroke: '#22c55e', fill: '#f6fff8' }
    if (profile.bpmnEventKind === 'END') return { ...common, stroke: '#ef4444', strokeWidth: 3, fill: '#fff7f7' }
    return { ...common, stroke: '#8b5cf6', fill: '#faf5ff' }
  }
  if (profile.bpmnElementType === 'GATEWAY') return { ...common, stroke: '#f59e0b', fill: '#fffbeb' }
  if (profile.bpmnElementType === 'SUB_PROCESS') return { ...common, stroke: '#2563eb', fill: '#eff6ff' }
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return { ...common, stroke: '#1d4ed8', strokeWidth: 3, fill: '#eff6ff' }
  if (isDataBpmnElement(profile.bpmnElementType)) {
    return { ...common, stroke: '#64748b', fill: '#f8fafc' }
  }
  return common
}

function asProfile(profileOrType: BpmnNodeProfile | BusinessFlowNodeType) {
  return typeof profileOrType === 'string'
    ? normalizeBpmnNodeProfile({ nodeType: profileOrType })
    : profileOrType
}

function nodeMarkup(profileOrType: BpmnNodeProfile | BusinessFlowNodeType) {
  const profile = asProfile(profileOrType)
  if (profile.bpmnElementType === 'GATEWAY') {
    return [
      { tagName: 'polygon', selector: 'body' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  if (profile.bpmnElementType === 'EVENT') {
    return [
      { tagName: 'circle', selector: 'body' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  if (
    profile.bpmnElementType === 'DATA_OBJECT' ||
    profile.bpmnElementType === 'DATA_INPUT' ||
    profile.bpmnElementType === 'DATA_OUTPUT'
  ) {
    return [
      { tagName: 'polygon', selector: 'body' },
      { tagName: 'path', selector: 'fold' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  if (profile.bpmnElementType === 'DATA_STORE') {
    return [
      { tagName: 'path', selector: 'body' },
      { tagName: 'path', selector: 'topArc' },
      { tagName: 'path', selector: 'bottomArc' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  if (
    profile.bpmnElementType === 'SUB_PROCESS' &&
    profile.bpmnSubProcessKind === 'TRANSACTION'
  ) {
    return [
      { tagName: 'rect', selector: 'body' },
      { tagName: 'rect', selector: 'inner' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  if (
    profile.bpmnElementType === 'SUB_PROCESS' &&
    profile.bpmnSubProcessKind === 'EMBEDDED'
  ) {
    return [
      { tagName: 'rect', selector: 'body' },
      { tagName: 'rect', selector: 'header' },
      { tagName: 'rect', selector: 'content' },
      { tagName: 'text', selector: 'label' },
      { tagName: 'text', selector: 'badge' },
    ]
  }
  return [
    { tagName: 'rect', selector: 'body' },
    { tagName: 'text', selector: 'label' },
    { tagName: 'text', selector: 'badge' },
  ]
}

function nodeAttrs(
  profileOrType: BpmnNodeProfile | BusinessFlowNodeType,
  title: string,
): CellAttrs {
  const profile = asProfile(profileOrType)
  const body = nodeBodyAttrs(profile)
  if (profile.bpmnElementType === 'GATEWAY') {
    return {
      body: {
        refPoints: '0,10 10,0 20,10 10,20',
        ...body,
      },
      label: labelAttrs(title),
      badge: badgeAttrs(typeText(profile), '50%', '50%', 'middle'),
    }
  }
  if (profile.bpmnElementType === 'EVENT') {
    return {
      body: {
        refCx: '50%',
        refCy: '50%',
        refR: '48%',
        ...body,
      },
      label: labelAttrs(title, 11),
      badge: badgeAttrs(typeText(profile), '50%', 15, 'middle'),
    }
  }
  if (
    profile.bpmnElementType === 'DATA_OBJECT' ||
    profile.bpmnElementType === 'DATA_INPUT' ||
    profile.bpmnElementType === 'DATA_OUTPUT'
  ) {
    return {
      body: {
        refPoints: '0,0 78,0 100,22 100,100 0,100',
        ...body,
      },
      fold: {
        d: 'M 74 0 L 74 18 L 96 18',
        fill: 'none',
        stroke: body.stroke,
        strokeWidth: 1.2,
      },
      label: labelAttrs(title, 11),
      badge: badgeAttrs(typeText(profile), 8, 14, 'start'),
    }
  }
  if (profile.bpmnElementType === 'DATA_STORE') {
    return {
      body: {
        refD: 'M 0 12 A 50 12 0 0 1 100 12 L 100 88 A 50 12 0 0 1 0 88 Z',
        ...body,
      },
      topArc: {
        refD: 'M 0 12 A 50 12 0 0 1 100 12 A 50 12 0 0 1 0 12',
        fill: 'none',
        stroke: body.stroke,
        strokeWidth: body.strokeWidth,
      },
      bottomArc: {
        refD: 'M 0 88 A 50 12 0 0 0 100 88',
        fill: 'none',
        stroke: body.stroke,
        strokeWidth: body.strokeWidth,
      },
      label: labelAttrs(title, 11),
      badge: badgeAttrs(typeText(profile), 8, 18, 'start'),
    }
  }
  if (
    profile.bpmnElementType === 'SUB_PROCESS' &&
    profile.bpmnSubProcessKind === 'TRANSACTION'
  ) {
    return {
      body: { rx: 8, ry: 8, ...body },
      inner: {
        x: 4,
        y: 4,
        width: 'calc(w - 8)',
        height: 'calc(h - 8)',
        rx: 6,
        ry: 6,
        fill: 'none',
        stroke: body.stroke,
        strokeWidth: 1,
      },
      label: labelAttrs(title),
      badge: badgeAttrs(typeText(profile), 8, 14, 'start'),
    }
  }
  if (
    profile.bpmnElementType === 'SUB_PROCESS' &&
    profile.bpmnSubProcessKind === 'EMBEDDED'
  ) {
    return {
      body: {
        rx: 8,
        ry: 8,
        ...body,
        strokeWidth: 1.8,
      },
      header: {
        refWidth: '100%',
        height: PROCESS_CONTAINER_LAYOUT.headerHeight,
        rx: 8,
        ry: 8,
        fill: '#dbeafe',
        stroke: body.stroke,
        strokeWidth: 1.8,
      },
      content: {
        x: 12,
        y: PROCESS_CONTAINER_LAYOUT.headerHeight + 8,
        width: 'calc(w - 24)',
        height: `calc(h - ${PROCESS_CONTAINER_LAYOUT.headerHeight + 20})`,
        rx: 6,
        ry: 6,
        fill: '#ffffff',
        stroke: '#bfdbfe',
        strokeDasharray: '6 4',
        strokeWidth: 1.2,
        pointerEvents: 'none',
      },
      label: {
        text: title,
        refX: 14,
        refY: 19,
        fill: '#1e3a8a',
        fontSize: 12,
        fontWeight: 700,
        textAnchor: 'start',
        textVerticalAnchor: 'middle',
        textWrap: {
          width: -62,
          height: PROCESS_CONTAINER_LAYOUT.headerHeight - 8,
          ellipsis: true,
        },
      },
      badge: badgeAttrs(typeText(profile), '100%', 19, 'end'),
    }
  }
  return {
    body: {
      rx: 8,
      ry: 8,
      ...body,
    },
    label: labelAttrs(title),
    badge: badgeAttrs(typeText(profile), 8, 14, 'start'),
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

function badgeAttrs(text: string, refX: number | string, refY: number | string, anchor: 'start' | 'middle' | 'end') {
  return {
    text,
    refX,
    refY,
    fontSize: 9,
    fontWeight: 700,
    fill: '#475569',
    textAnchor: anchor,
    textVerticalAnchor: 'middle',
  }
}

function typeText(profile: BpmnNodeProfile) {
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return 'START'
    if (profile.bpmnEventKind === 'END') return 'END'
    return 'EVT'
  }
  if (profile.bpmnElementType === 'GATEWAY') {
    if (profile.bpmnGatewayType === 'PARALLEL') return '+'
    if (profile.bpmnGatewayType === 'INCLUSIVE') return 'O'
    if (profile.bpmnGatewayType === 'COMPLEX') return '*'
    return 'X'
  }
  if (profile.bpmnElementType === 'SUB_PROCESS') {
    return profile.bpmnSubProcessKind === 'TRANSACTION' ? 'TX' : '+'
  }
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return 'CALL'
  if (profile.bpmnElementType === 'DATA_OBJECT') return 'DATA'
  if (profile.bpmnElementType === 'DATA_INPUT') return 'IN'
  if (profile.bpmnElementType === 'DATA_OUTPUT') return 'OUT'
  if (profile.bpmnElementType === 'DATA_STORE') return 'STORE'
  return 'TASK'
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

  const profiles = BPMN_NODE_OPTIONS.map((option) => option.profile)
  profiles.forEach((profile) => {
    Graph.registerNode(
      shapeNameForProfile(profile),
      {
        inherit: 'rect',
        markup: nodeMarkup(profile),
        attrs: nodeAttrs(profile, typeText(profile)),
        ports: NODE_PORTS,
      },
      true,
    )
  })
}

export function createBusinessFlowGraph(container: HTMLElement) {
  registerBusinessFlowShapes()
  let activeProcessContainerTarget: Node | null = null
  const updateProcessContainerTarget = (node: Node | null) => {
    if (activeProcessContainerTarget?.id === node?.id) return
    if (activeProcessContainerTarget) setProcessContainerDropTarget(activeProcessContainerTarget, false)
    activeProcessContainerTarget = node
    if (activeProcessContainerTarget) setProcessContainerDropTarget(activeProcessContainerTarget, true)
  }
  const graph = new Graph({
    container,
    autoResize: true,
    background: { color: '#f7f8fb' },
    grid: { visible: true, type: 'dot', args: { color: '#e1e7f0' } },
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'rightMouseDown'] },
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
        const lane = laneAncestor(cell as Node)
        if (!(parent instanceof Node) || !lane) return null
        const parentPosition = lane.position()
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
        const bpmnProfile = normalizeBpmnEdgeProfile({ edgeType: 'SEQUENCE' })
        return new Shape.Edge({
          attrs: edgeAttrs(false, bpmnProfile),
          zIndex: EDGE_Z_INDEX,
          data: {
            boundedContext: 'business-flow',
            cellRole: 'FLOW_EDGE',
            edgeType: 'SEQUENCE',
            ...bpmnProfile,
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
          return readCellData(node).cellRole === 'LANE_INSTANCE' || isProcessContainerCell(node)
        },
        minWidth(node) {
          if (isProcessContainerCell(node)) return minProcessContainerSize(node).width
          return minLaneSize(node).width
        },
        minHeight(node) {
          if (isProcessContainerCell(node)) return minProcessContainerSize(node).height
          return minLaneSize(node).height
        },
        orthogonal: true,
        allowReverse: false,
      },
      rotating: false,
    }),
  )
  graph.on('node:moved', ({ node }) => {
    const role = readCellData(node).cellRole
    if (!(node instanceof Node) || (role !== 'FLOW_NODE' && role !== 'COMPONENT_NODE')) return
    settleProcessContainerEmbedding(graph, node)
    updateProcessContainerTarget(null)
    normalizeBusinessFlowLanes(graph, { preserveManualSize: true, shrinkToFit: false })
  })
  graph.on('node:change:position', ({ node, options }) => {
    const role = readCellData(node).cellRole
    if (!(node instanceof Node) || (role !== 'FLOW_NODE' && role !== 'COMPONENT_NODE')) return
    if (options?.translateBy && options.translateBy !== node.id) return
    updateProcessContainerTarget(processContainerDropTargetForNode(graph, node))
  })
  graph.on('node:resized', ({ node }) => {
    if (!(node instanceof Node) || !isProcessContainerCell(node)) return
    graph.batchUpdate(() => {
      fitProcessContainerToChildren(node, { shrinkToFit: false })
      const lane = laneAncestor(node)
      if (lane) fitLaneToChildren(lane, { preserveManualSize: true, shrinkToFit: false })
    })
  })
  return graph
}

export function isDeletableBusinessFlowCell(cell: Cell) {
  const role = readCellData(cell).cellRole
  if (cell instanceof Node && isProcessContainerCell(cell) && flowNodeChildren(cell).length > 0) {
    return false
  }
  return (
    role === 'FLOW_NODE' ||
    role === 'FLOW_EDGE' ||
    role === 'COMPONENT_NODE' ||
    role === 'COMPONENT_EDGE'
  )
}

export function removeBusinessFlowCells(
  graph: Graph,
  cells: Cell[],
  canDelete: (cell: Cell) => boolean = isDeletableBusinessFlowCell,
) {
  const removed: Cell[] = []
  const seen = new Set<string>()
  const candidates = cells.filter((cell) => {
    if (seen.has(cell.id)) return false
    seen.add(cell.id)
    return canDelete(cell)
  })
  if (!candidates.length) return removed

  graph.batchUpdate(() => {
    candidates.forEach((cell) => {
      const liveCell = graph.getCellById(cell.id)
      if (!liveCell) return
      liveCell.remove()
      removed.push(liveCell)
    })
  })
  return removed
}

export function removeSelectedBusinessFlowCells(
  graph: Graph,
  options: {
    getFallbackCell?: () => Cell | null | undefined
    canDelete?: (cell: Cell) => boolean
  } = {},
) {
  const selectedCells = graph.getSelectedCells()
  const fallbackCell = options.getFallbackCell?.()
  if (!selectedCells.length && fallbackCell) selectedCells.push(fallbackCell)
  return removeBusinessFlowCells(graph, selectedCells, options.canDelete)
}

export function bindBusinessFlowDeleteKeys(
  graph: Graph,
  options: {
    getFallbackCell?: () => Cell | null | undefined
    canDelete?: (cell: Cell) => boolean
    onDeleted?: (cells: Cell[]) => void
  } = {},
) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditingTarget(event.target)) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return

    const removed = removeSelectedBusinessFlowCells(graph, {
      getFallbackCell: options.getFallbackCell,
      canDelete: options.canDelete,
    })
    if (!removed.length) return

    event.preventDefault()
    options.onDeleted?.(removed)
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}

function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  )
}

function allowMultiplePortEdges() {
  return true
}

function validatePortConnection({ sourceCell, targetCell, sourceMagnet, targetMagnet }: ValidateConnectionArgs) {
  if (!sourceCell || !targetCell || sourceCell === targetCell) return false
  if (!isFlowNodeCell(sourceCell) || !isFlowNodeCell(targetCell)) return false
  return isReusablePort(sourceMagnet) && isReusablePort(targetMagnet)
}

function isDataNodeCell(cell?: Cell | null) {
  return Boolean(
    cell &&
      isFlowNodeCell(cell) &&
      isDataBpmnElement(nodeProfileFromData(readCellData(cell)).bpmnElementType),
  )
}

function laneAncestor(node: Node): Node | null {
  let parent = node.getParent()
  while (parent instanceof Node) {
    if (readCellData(parent).cellRole === 'LANE_INSTANCE') return parent
    parent = parent.getParent()
  }
  return null
}

function processContainerParent(node: Node): Node | null {
  const parent = node.getParent()
  return isProcessContainerCell(parent) ? parent as Node : null
}

function processContainerContentBounds(container: Node): Bounds {
  const bbox = container.getBBox()
  const x = bbox.x + 12
  const y = bbox.y + PROCESS_CONTAINER_LAYOUT.headerHeight + 8
  const width = Math.max(0, bbox.width - 24)
  const height = Math.max(0, bbox.height - PROCESS_CONTAINER_LAYOUT.headerHeight - 20)
  return { x, y, width, height }
}

function processContainerContentContainsBounds(container: Node, bounds: Bounds) {
  const content = processContainerContentBounds(container)
  return (
    bounds.x >= content.x &&
    bounds.y >= content.y &&
    bounds.x + bounds.width <= content.x + content.width &&
    bounds.y + bounds.height <= content.y + content.height
  )
}

function setProcessContainerDropTarget(container: Node, active: boolean) {
  container.attr({
    body: {
      stroke: active ? '#0f766e' : '#2563eb',
      strokeWidth: active ? 2.4 : 1.8,
      fill: active ? '#ecfdf5' : '#eff6ff',
    },
    header: {
      fill: active ? '#99f6e4' : '#dbeafe',
      stroke: active ? '#0f766e' : '#2563eb',
      strokeWidth: active ? 2.4 : 1.8,
    },
    content: {
      stroke: active ? '#0f766e' : '#bfdbfe',
      strokeWidth: active ? 1.8 : 1.2,
      fill: active ? '#f0fdfa' : '#ffffff',
    },
  })
}

function processContainerDropTargetForNode(graph: Graph, node: Node) {
  if (isProcessContainerCell(node)) return null
  if (!isFlowNodeCell(node)) return null
  const lane = laneAncestor(node)
  const bbox = node.getBBox()
  const candidates = graph
    .getNodes()
    .filter((candidate) => (
      candidate.id !== node.id &&
      isProcessContainerCell(candidate) &&
      (!lane || laneAncestor(candidate)?.id === lane.id) &&
      processContainerContentContainsBounds(candidate, bbox)
    ))
    .sort((left, right) => {
      const leftSize = left.size()
      const rightSize = right.size()
      return leftSize.width * leftSize.height - rightSize.width * rightSize.height
    })
  return candidates[0] ?? null
}

function refreshConnectedEdges(graph: Graph, node: Node) {
  graph.getConnectedEdges(node).forEach((edge) => {
    const view = graph.findViewByCell(edge) as { update?: () => void } | null
    view?.update?.()
  })
}

function laneKeyForNodeCell(node: Node) {
  const data = readCellData(node)
  const lane = laneAncestor(node)
  return data.laneInstanceKey ?? lane?.id
}

function nodePositionForStorage(node: Node) {
  const parent = node.getParent()
  if (parent instanceof Node && (isProcessContainerCell(parent) || readCellData(parent).cellRole === 'LANE_INSTANCE')) {
    return node.position({ relative: true })
  }
  return node.position()
}

export function settleProcessContainerEmbedding(graph: Graph, node: Node) {
  if (isProcessContainerCell(node)) return
  const lane = laneAncestor(node)
  const currentContainer = processContainerParent(node)
  const nextContainer = processContainerDropTargetForNode(graph, node)
  if (nextContainer && currentContainer?.id !== nextContainer.id) {
    const absolute = node.position()
    graph.batchUpdate(() => {
      nextContainer.addChild(node)
      const parentPosition = nextContainer.position()
      node.position(absolute.x - parentPosition.x, absolute.y - parentPosition.y, { relative: true })
      node.setData(
        {
          ...readCellData(node),
          laneInstanceKey: lane?.id ?? readCellData(node).laneInstanceKey,
          containerNodeKey: nextContainer.id,
        },
        { silent: true },
      )
      fitProcessContainerToChildren(nextContainer, { shrinkToFit: false })
      if (lane) fitLaneToChildren(lane, { preserveManualSize: true, shrinkToFit: false })
      refreshConnectedEdges(graph, node)
    })
    return
  }
  if (!nextContainer && currentContainer) {
    const absolute = node.position()
    graph.batchUpdate(() => {
      if (lane) {
        lane.addChild(node)
        const lanePosition = lane.position()
        node.position(absolute.x - lanePosition.x, absolute.y - lanePosition.y, { relative: true })
      } else {
        node.setParent(null, { silent: true })
        node.position(absolute.x, absolute.y)
      }
      node.setData(
        {
          ...readCellData(node),
          laneInstanceKey: lane?.id ?? readCellData(node).laneInstanceKey,
          containerNodeKey: null,
        },
        { silent: true },
      )
      fitProcessContainerToChildren(currentContainer, { shrinkToFit: true })
      if (lane) fitLaneToChildren(lane, { preserveManualSize: true, shrinkToFit: false })
      refreshConnectedEdges(graph, node)
    })
  }
}

export function defaultBpmnEdgeProfileForEdge(edge: Edge) {
  const bpmnFlowType =
    isDataNodeCell(edge.getSourceCell()) || isDataNodeCell(edge.getTargetCell())
      ? 'ASSOCIATION'
      : 'SEQUENCE'
  return normalizeBpmnEdgeProfile({ bpmnFlowType })
}

function isFlowNodeCell(cell: Cell) {
  const role = readCellData(cell).cellRole
  return role === 'FLOW_NODE' || role === 'COMPONENT_NODE'
}

function isReusablePort(magnet?: Element | null) {
  return magnet?.getAttribute('magnet') === 'true'
}

export function shapeName(type: BusinessFlowNodeType, profile?: BpmnNodeProfile | null) {
  return shapeNameForProfile(profile ?? normalizeBpmnNodeProfile({ nodeType: type }))
}

export function graphPointFromEvent(graph: Graph, event: DragEvent): Point {
  const client = graph.clientToLocal({ x: event.clientX, y: event.clientY })
  return { x: client.x, y: client.y }
}

export function addComponentNode(graph: Graph, draft: ComponentEditorNodeDraft) {
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType: draft.nodeType,
    bpmnElementType: draft.bpmnElementType,
    bpmnEventKind: draft.bpmnEventKind,
    bpmnEventDefinition: draft.bpmnEventDefinition,
    bpmnTaskType: draft.bpmnTaskType,
    bpmnGatewayType: draft.bpmnGatewayType,
    bpmnSubProcessKind: draft.bpmnSubProcessKind,
    bpmnCallActivityRef: draft.bpmnCallActivityRef,
    propertiesJson: draft.propertiesJson,
  })
  const nodeType = legacyNodeTypeForBpmn(bpmnProfile)
  return graph.addNode({
    id: draft.nodeKey,
    shape: shapeName(nodeType, bpmnProfile),
    x: draft.position.x,
    y: draft.position.y,
    width: draft.size.width,
    height: draft.size.height,
    attrs: nodeAttrs(bpmnProfile, draft.title),
    ports: NODE_PORTS,
    data: {
      boundedContext: 'business-flow',
      cellRole: 'COMPONENT_NODE',
      nodeKey: draft.nodeKey,
      nodeType,
      ...bpmnProfile,
      title: draft.title,
      description: draft.description ?? null,
      actor: draft.actor ?? null,
      businessRule: draft.businessRule ?? null,
      inputSummary: draft.inputSummary ?? null,
      outputSummary: draft.outputSummary ?? null,
      semanticProfileKey: draft.semanticProfileKey ?? null,
      semanticProfileVersion: draft.semanticProfileVersion ?? null,
      semanticPayloadJson: draft.semanticPayloadJson ?? {},
      taskUiJson: draft.taskUiJson ?? null,
      processContainerJson: draft.processContainerJson ?? null,
      containerNodeKey: draft.containerNodeKey ?? null,
      erRefs: draft.erRefs ?? [],
      styleJson: draft.styleJson ?? null,
      propertiesJson: mergeBpmnIntoProperties(draft.propertiesJson, bpmnProfile),
    } satisfies FlowCellData,
    zIndex: FLOW_NODE_Z_INDEX,
  })
}

export function addFlowNode(graph: Graph, record: BusinessFlowNodeRecord) {
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType: record.nodeType,
    bpmnElementType: record.bpmnElementType,
    bpmnEventKind: record.bpmnEventKind,
    bpmnEventDefinition: record.bpmnEventDefinition,
    bpmnTaskType: record.bpmnTaskType,
    bpmnGatewayType: record.bpmnGatewayType,
    bpmnSubProcessKind: record.bpmnSubProcessKind,
    bpmnCallActivityRef: record.bpmnCallActivityRef,
    propertiesJson: record.propertiesJson,
  })
  const nodeType = legacyNodeTypeForBpmn(bpmnProfile)
  return graph.addNode({
    id: record.nodeKey,
    shape: shapeName(nodeType, bpmnProfile),
    x: record.position.x,
    y: record.position.y,
    width: record.size.width,
    height: record.size.height,
    attrs: nodeAttrs(bpmnProfile, record.title),
    ports: NODE_PORTS,
    data: {
      boundedContext: 'business-flow',
      cellRole: 'FLOW_NODE',
      businessFlowId: record.businessFlowId,
      laneInstanceId: record.laneInstanceId,
      laneInstanceKey: undefined,
      nodeKey: record.nodeKey,
      originComponentNodeKey: record.originComponentNodeKey,
      nodeType,
      ...bpmnProfile,
      title: record.title,
      description: record.description ?? null,
      actor: record.actor ?? null,
      businessRule: record.businessRule ?? null,
      inputSummary: record.inputSummary ?? null,
      outputSummary: record.outputSummary ?? null,
      semanticProfileKey: record.semanticProfileKey ?? null,
      semanticProfileVersion: record.semanticProfileVersion ?? null,
      semanticPayloadJson: record.semanticPayloadJson ?? {},
      taskUiJson: record.taskUiJson ?? null,
      processContainerJson: record.processContainerJson ?? null,
      containerNodeKey: record.containerNodeKey ?? null,
      erRefs: record.erRefs ?? [],
      styleJson: record.styleJson ?? null,
      propertiesJson: mergeBpmnIntoProperties(record.propertiesJson, bpmnProfile),
    } satisfies FlowCellData,
    zIndex: FLOW_NODE_Z_INDEX,
  })
}

export function renderComponentVersion(graph: Graph, version: SwimlaneComponentVersion) {
  graph.clearCells()
  const nodeByKey = new Map(version.nodes.map((node) => [node.nodeKey, node]))
  version.nodes
    .slice()
    .sort((left, right) => Number(Boolean(left.containerNodeKey)) - Number(Boolean(right.containerNodeKey)))
    .forEach((node) => {
      const container = node.containerNodeKey ? nodeByKey.get(node.containerNodeKey) : null
      const x6Node = addComponentNode(graph, {
        ...node,
        position: container
          ? {
              x: container.position.x + node.position.x,
              y: container.position.y + node.position.y,
            }
          : node.position,
      })
      const parent = node.containerNodeKey ? graph.getCellById(node.containerNodeKey) : null
      if (parent instanceof Node && isProcessContainerCell(parent)) {
        parent.addChild(x6Node)
        x6Node.position(node.position.x, node.position.y, { relative: true })
        x6Node.setData(
          { ...readCellData(x6Node), containerNodeKey: node.containerNodeKey },
          { silent: true },
        )
      }
    })
  version.edges.forEach((edge) => {
    const bpmnProfile = normalizeBpmnEdgeProfile({
      edgeType: edge.edgeType,
      bpmnFlowType: edge.bpmnFlowType,
      bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
      bpmnMessageName: edge.bpmnMessageName,
      bpmnConditionExpression: edge.bpmnConditionExpression,
      propertiesJson: edge.propertiesJson,
    })
    graph.addEdge({
      id: edge.edgeKey,
      source: { cell: edge.sourceNodeKey, port: edge.sourcePort ?? undefined },
      target: { cell: edge.targetNodeKey, port: edge.targetPort ?? undefined },
      attrs: edgeAttrs(false, bpmnProfile),
      labels: edgeLabels(edge.label),
      data: {
        boundedContext: 'business-flow',
        cellRole: 'COMPONENT_EDGE',
        edgeKey: edge.edgeKey,
        edgeType: legacyEdgeTypeForBpmn(bpmnProfile),
        ...bpmnProfile,
        semanticProfileKey: edge.semanticProfileKey ?? null,
        semanticProfileVersion: edge.semanticProfileVersion ?? null,
        semanticPayloadJson: edge.semanticPayloadJson ?? {},
        propertiesJson: mergeBpmnIntoProperties(edge.propertiesJson, bpmnProfile),
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
  nodeByKey: Map<string, BusinessFlowNodeRecord> = new Map(),
) {
  const laneKey = laneKeyById.get(node.laneInstanceId)
  const laneRecord = laneById.get(node.laneInstanceId)
  const containerRecord = node.containerNodeKey ? nodeByKey.get(node.containerNodeKey) : null
  const absolutePosition =
    laneRecord && containerRecord
      ? {
          x: laneRecord.position.x + containerRecord.position.x + node.position.x,
          y: laneRecord.position.y + containerRecord.position.y + node.position.y,
        }
      : laneRecord
        ? {
            x: laneRecord.position.x + node.position.x,
            y: laneRecord.position.y + node.position.y,
          }
        : node.position
  const x6Node = addFlowNode(graph, {
    ...node,
    position: absolutePosition,
  })
  const lane = laneKey ? graph.getCellById(laneKey) : null
  const container = node.containerNodeKey ? graph.getCellById(node.containerNodeKey) : null
  if (container instanceof Node && isProcessContainerCell(container)) {
    container.addChild(x6Node)
    x6Node.position(node.position.x, node.position.y, { relative: true })
    x6Node.setData(
      {
        ...readCellData(x6Node),
        laneInstanceKey: laneKey,
        containerNodeKey: node.containerNodeKey,
      },
      { silent: true },
    )
  } else if (lane instanceof Node) {
    lane.addChild(x6Node)
    x6Node.position(node.position.x, node.position.y, { relative: true })
    x6Node.setData(
      {
        ...readCellData(x6Node),
        laneInstanceKey: laneKey,
        containerNodeKey: null,
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
  const bpmnProfile = normalizeBpmnEdgeProfile({
    edgeType: edge.edgeType,
    bpmnFlowType: edge.bpmnFlowType,
    bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
    bpmnMessageName: edge.bpmnMessageName,
    bpmnConditionExpression: edge.bpmnConditionExpression,
    propertiesJson: edge.propertiesJson,
    isCrossLane: edge.isCrossLane,
  })
  graph.addEdge({
    id: edge.edgeKey,
    source: { cell: edge.sourceNodeKey, port: edge.sourcePort ?? undefined },
    target: { cell: edge.targetNodeKey, port: edge.targetPort ?? undefined },
    attrs: edgeAttrs(edge.isCrossLane, bpmnProfile),
    labels: edgeLabels(edge.label),
    data: {
      boundedContext: 'business-flow',
      cellRole: 'FLOW_EDGE',
      businessFlowId: canvas.businessFlowId,
      laneInstanceId: edge.laneInstanceId ?? undefined,
      edgeKey: edge.edgeKey,
      edgeType: legacyEdgeTypeForBpmn(bpmnProfile, edge.isCrossLane),
      ...bpmnProfile,
      originComponentEdgeKey: edge.originComponentEdgeKey,
      semanticProfileKey: edge.semanticProfileKey ?? null,
      semanticProfileVersion: edge.semanticProfileVersion ?? null,
      semanticPayloadJson: edge.semanticPayloadJson ?? {},
      propertiesJson: mergeBpmnIntoProperties(edge.propertiesJson, bpmnProfile),
      title: edge.label ?? '',
    } satisfies FlowCellData,
    zIndex: EDGE_Z_INDEX,
  })
}

export function renderBusinessFlowCanvas(graph: Graph, canvas: LocalBusinessFlowCanvas) {
  graph.clearCells()
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  const laneById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane]))
  const nodeByKey = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
  canvas.laneInstances.forEach((lane) => addLaneInstanceCell(graph, canvas, lane))
  canvas.nodes
    .slice()
    .sort((left, right) => Number(Boolean(left.containerNodeKey)) - Number(Boolean(right.containerNodeKey)))
    .forEach((node) => addFlowNodeCell(graph, node, laneById, laneKeyById, nodeByKey))
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
  const nodeByKey = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
  let added = false
  canvas.laneInstances.forEach((lane) => {
    if (graph.getCellById(lane.instanceKey)) return
    addLaneInstanceCell(graph, canvas, lane)
    added = true
  })
  canvas.nodes.forEach((node) => {
    if (graph.getCellById(node.nodeKey)) return
    addFlowNodeCell(graph, node, laneById, laneKeyById, nodeByKey)
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

export type BusinessFlowCanvasPatch = {
  laneUpserts?: string[]
  laneDeletes?: string[]
  nodeUpserts?: string[]
  nodeDeletes?: string[]
  edgeUpserts?: string[]
  edgeDeletes?: string[]
  erRefNodeKeys?: string[]
}

export type BusinessFlowCanvasPatchResult =
  | { applied: true }
  | { applied: false; reason: string }

function upsertLaneCell(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  lane: LocalBusinessFlowCanvas['laneInstances'][number],
) {
  const existing = graph.getCellById(lane.instanceKey)
  if (!(existing instanceof Node) || readCellData(existing).cellRole !== 'LANE_INSTANCE') {
    if (existing) graph.removeCell(existing)
    addLaneInstanceCell(graph, canvas, lane)
    return
  }
  existing.position(lane.position.x, lane.position.y)
  existing.resize(lane.size.width, lane.size.height)
  existing.attr('label/text', lane.displayName)
  existing.attr('owner/text', lane.ownerRole ?? '')
  existing.setZIndex(LANE_Z_INDEX_BASE + lane.zIndex)
  existing.setData(
    {
      ...readCellData(existing),
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
    { silent: true },
  )
}

function upsertFlowNodeCell(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  node: BusinessFlowNodeRecord,
  laneById: Map<string, LocalBusinessFlowCanvas['laneInstances'][number]>,
  laneKeyById: Map<string, string>,
  nodeByKey: Map<string, BusinessFlowNodeRecord> = new Map(),
) {
  const laneKey = laneKeyById.get(node.laneInstanceId)
  const laneRecord = laneById.get(node.laneInstanceId)
  const lane = laneKey ? graph.getCellById(laneKey) : null
  if (laneKey && !(lane instanceof Node)) {
    return { applied: false, reason: `missing-lane:${laneKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType: node.nodeType,
    bpmnElementType: node.bpmnElementType,
    bpmnEventKind: node.bpmnEventKind,
    bpmnEventDefinition: node.bpmnEventDefinition,
    bpmnTaskType: node.bpmnTaskType,
    bpmnGatewayType: node.bpmnGatewayType,
    bpmnSubProcessKind: node.bpmnSubProcessKind,
    bpmnCallActivityRef: node.bpmnCallActivityRef,
    propertiesJson: node.propertiesJson,
  })
  const nodeType = legacyNodeTypeForBpmn(bpmnProfile)
  const expectedShape = shapeName(nodeType, bpmnProfile)
  const existing = graph.getCellById(node.nodeKey)
  if (
    !(existing instanceof Node) ||
    readCellData(existing).cellRole !== 'FLOW_NODE' ||
    existing.shape !== expectedShape
  ) {
    if (existing) graph.removeCell(existing)
    addFlowNodeCell(graph, node, laneById, laneKeyById, nodeByKey)
    return { applied: true } satisfies BusinessFlowCanvasPatchResult
  }
  const container = node.containerNodeKey ? graph.getCellById(node.containerNodeKey) : null
  if (container instanceof Node && isProcessContainerCell(container)) {
    container.addChild(existing)
    existing.position(node.position.x, node.position.y, { relative: true })
  } else if (lane instanceof Node) {
    lane.addChild(existing)
    existing.position(node.position.x, node.position.y, { relative: true })
  } else {
    existing.position(
      laneRecord ? laneRecord.position.x + node.position.x : node.position.x,
      laneRecord ? laneRecord.position.y + node.position.y : node.position.y,
    )
  }
  existing.resize(node.size.width, node.size.height)
  existing.attr(nodeAttrs(bpmnProfile, node.title))
  existing.setData(
    {
      ...readCellData(existing),
      boundedContext: 'business-flow',
      cellRole: 'FLOW_NODE',
      businessFlowId: canvas.businessFlowId,
      laneInstanceId: node.laneInstanceId,
      laneInstanceKey: laneKey,
      containerNodeKey: node.containerNodeKey ?? null,
      nodeKey: node.nodeKey,
      originComponentNodeKey: node.originComponentNodeKey,
      nodeType,
      ...bpmnProfile,
      title: node.title,
      description: node.description ?? null,
      actor: node.actor ?? null,
      businessRule: node.businessRule ?? null,
      inputSummary: node.inputSummary ?? null,
      outputSummary: node.outputSummary ?? null,
      semanticProfileKey: node.semanticProfileKey ?? null,
      semanticProfileVersion: node.semanticProfileVersion ?? null,
      semanticPayloadJson: node.semanticPayloadJson ?? {},
      taskUiJson: node.taskUiJson ?? null,
      processContainerJson: node.processContainerJson ?? null,
      erRefs: node.erRefs ?? [],
      styleJson: node.styleJson ?? null,
      propertiesJson: mergeBpmnIntoProperties(node.propertiesJson, bpmnProfile),
    } satisfies FlowCellData,
    { silent: true },
  )
  return { applied: true } satisfies BusinessFlowCanvasPatchResult
}

function upsertFlowEdgeCell(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  edge: BusinessFlowEdgeRecord,
) {
  if (!edge.sourceNodeKey || !edge.targetNodeKey) {
    return { applied: false, reason: `missing-edge-terminal:${edge.edgeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  if (!graph.getCellById(edge.sourceNodeKey)) {
    return { applied: false, reason: `missing-source:${edge.sourceNodeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  if (!graph.getCellById(edge.targetNodeKey)) {
    return { applied: false, reason: `missing-target:${edge.targetNodeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  const bpmnProfile = normalizeBpmnEdgeProfile({
    edgeType: edge.edgeType,
    bpmnFlowType: edge.bpmnFlowType,
    bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
    bpmnMessageName: edge.bpmnMessageName,
    bpmnConditionExpression: edge.bpmnConditionExpression,
    propertiesJson: edge.propertiesJson,
    isCrossLane: edge.isCrossLane,
  })
  const existing = graph.getCellById(edge.edgeKey)
  if (!(existing instanceof Edge) || readCellData(existing).cellRole !== 'FLOW_EDGE') {
    if (existing) graph.removeCell(existing)
    addFlowEdgeCell(graph, canvas, edge)
    return { applied: true } satisfies BusinessFlowCanvasPatchResult
  }
  existing.setSource({ cell: edge.sourceNodeKey, port: edge.sourcePort ?? undefined })
  existing.setTarget({ cell: edge.targetNodeKey, port: edge.targetPort ?? undefined })
  existing.attr(edgeAttrs(edge.isCrossLane, bpmnProfile))
  existing.setLabels(edgeLabels(edge.label))
  existing.setData(
    {
      ...readCellData(existing),
      boundedContext: 'business-flow',
      cellRole: 'FLOW_EDGE',
      businessFlowId: canvas.businessFlowId,
      laneInstanceId: edge.laneInstanceId ?? undefined,
      edgeKey: edge.edgeKey,
      edgeType: legacyEdgeTypeForBpmn(bpmnProfile, edge.isCrossLane),
      ...bpmnProfile,
      originComponentEdgeKey: edge.originComponentEdgeKey,
      propertiesJson: mergeBpmnIntoProperties(edge.propertiesJson, bpmnProfile),
      title: edge.label ?? '',
    } satisfies FlowCellData,
    { silent: true },
  )
  existing.setZIndex(EDGE_Z_INDEX)
  return { applied: true } satisfies BusinessFlowCanvasPatchResult
}

function removePatchedLane(graph: Graph, laneKey: string, nodeDeletes: Set<string>) {
  const cell = graph.getCellById(laneKey)
  if (!cell) return { applied: true } satisfies BusinessFlowCanvasPatchResult
  if (!(cell instanceof Node) || readCellData(cell).cellRole !== 'LANE_INSTANCE') {
    return { applied: false, reason: `unexpected-lane-cell:${laneKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  const childNodes = flowNodeChildren(cell)
  const hasUndeletedChild = childNodes.some((child) => !nodeDeletes.has(child.id))
  if (hasUndeletedChild) {
    return { applied: false, reason: `lane-delete-has-children:${laneKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  graph.removeCell(cell)
  return { applied: true } satisfies BusinessFlowCanvasPatchResult
}

function removePatchedNode(graph: Graph, nodeKey: string, edgeDeletes: Set<string>) {
  const cell = graph.getCellById(nodeKey)
  if (!cell) return { applied: true } satisfies BusinessFlowCanvasPatchResult
  if (!(cell instanceof Node) || readCellData(cell).cellRole !== 'FLOW_NODE') {
    return { applied: false, reason: `unexpected-node-cell:${nodeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  const connectedEdges = graph.getConnectedEdges(cell)
  const hasUndeletedEdge = connectedEdges.some((edge) => !edgeDeletes.has(edge.id))
  if (hasUndeletedEdge) {
    return { applied: false, reason: `node-delete-has-edges:${nodeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  if (isProcessContainerCell(cell)) {
    if (flowNodeChildren(cell).length > 0) {
      return { applied: false, reason: `node-delete-has-children:${nodeKey}` } satisfies BusinessFlowCanvasPatchResult
    }
  }
  graph.removeCell(cell)
  return { applied: true } satisfies BusinessFlowCanvasPatchResult
}

function removePatchedEdge(graph: Graph, edgeKey: string) {
  const cell = graph.getCellById(edgeKey)
  if (!cell) return { applied: true } satisfies BusinessFlowCanvasPatchResult
  if (!(cell instanceof Edge) || readCellData(cell).cellRole !== 'FLOW_EDGE') {
    return { applied: false, reason: `unexpected-edge-cell:${edgeKey}` } satisfies BusinessFlowCanvasPatchResult
  }
  graph.removeCell(cell)
  return { applied: true } satisfies BusinessFlowCanvasPatchResult
}

export function applyBusinessFlowCanvasPatchToGraph(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
  patch: BusinessFlowCanvasPatch,
): BusinessFlowCanvasPatchResult {
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  const laneById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane]))
  const lanesByKey = new Map(canvas.laneInstances.map((lane) => [lane.instanceKey, lane]))
  const nodesByKey = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
  const edgesByKey = new Map(canvas.edges.map((edge) => [edge.edgeKey, edge]))
  const nodeDeletes = new Set(patch.nodeDeletes ?? [])
  const edgeDeletes = new Set(patch.edgeDeletes ?? [])
  let result: BusinessFlowCanvasPatchResult = { applied: true }

  graph.batchUpdate(() => {
    for (const edgeKey of edgeDeletes) {
      result = removePatchedEdge(graph, edgeKey)
      if (!result.applied) return
    }
    for (const nodeKey of nodeDeletes) {
      result = removePatchedNode(graph, nodeKey, edgeDeletes)
      if (!result.applied) return
    }
    for (const laneKey of patch.laneDeletes ?? []) {
      result = removePatchedLane(graph, laneKey, nodeDeletes)
      if (!result.applied) return
    }
    for (const laneKey of patch.laneUpserts ?? []) {
      const lane = lanesByKey.get(laneKey)
      if (!lane) {
        result = { applied: false, reason: `missing-lane-record:${laneKey}` }
        return
      }
      upsertLaneCell(graph, canvas, lane)
    }
    for (const nodeKey of patch.nodeUpserts ?? []) {
      const node = nodesByKey.get(nodeKey)
      if (!node) {
        result = { applied: false, reason: `missing-node-record:${nodeKey}` }
        return
      }
      result = upsertFlowNodeCell(graph, canvas, node, laneById, laneKeyById, nodesByKey)
      if (!result.applied) return
    }
    normalizeBusinessFlowLanes(graph, { preserveManualSize: true })
    const edgeUpserts = new Set(patch.edgeUpserts ?? [])
    for (const nodeKey of patch.erRefNodeKeys ?? []) {
      const node = nodesByKey.get(nodeKey)
      const existing = graph.getCellById(nodeKey)
      if (!node || !(existing instanceof Node) || readCellData(existing).cellRole !== 'FLOW_NODE') {
        result = { applied: false, reason: `missing-er-ref-node:${nodeKey}` }
        return
      }
      result = upsertFlowNodeCell(graph, canvas, node, laneById, laneKeyById, nodesByKey)
      if (!result.applied) return
    }
    for (const edgeKey of edgeUpserts) {
      const edge = edgesByKey.get(edgeKey)
      if (!edge) {
        result = { applied: false, reason: `missing-edge-record:${edgeKey}` }
        return
      }
      result = upsertFlowEdgeCell(graph, canvas, edge)
      if (!result.applied) return
    }
  })
  return result
}

export function applyBusinessFlowCanvasToGraph(
  graph: Graph,
  canvas: LocalBusinessFlowCanvas,
) {
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  const laneById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane]))
  const nodeByKey = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
  const incomingLaneKeys = new Set(canvas.laneInstances.map((lane) => lane.instanceKey))
  const incomingNodeKeys = new Set(canvas.nodes.map((node) => node.nodeKey))
  const incomingEdgeKeys = new Set(canvas.edges.map((edge) => edge.edgeKey))

  graph.batchUpdate(() => {
    graph.getEdges().forEach((edge) => {
      if (readCellData(edge).cellRole !== 'FLOW_EDGE') return
      if (!incomingEdgeKeys.has(edge.id)) graph.removeCell(edge)
    })
    graph.getNodes().forEach((node) => {
      const role = readCellData(node).cellRole
      if (role === 'FLOW_NODE' && !incomingNodeKeys.has(node.id)) graph.removeCell(node)
      if (role === 'LANE_INSTANCE' && !incomingLaneKeys.has(node.id)) graph.removeCell(node)
    })

    canvas.laneInstances.forEach((lane) => upsertLaneCell(graph, canvas, lane))

    canvas.nodes.forEach((node) => {
      upsertFlowNodeCell(graph, canvas, node, laneById, laneKeyById, nodeByKey)
    })

    normalizeBusinessFlowLanes(graph, { preserveManualSize: true })

    canvas.edges.forEach((edge) => {
      upsertFlowEdgeCell(graph, canvas, edge)
    })
  })
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
    if (!isProcessContainerCell(node)) return
    changed = fitProcessContainerToChildren(node, options) || changed
  })
  graph.getNodes().forEach((node) => {
    if (readCellData(node).cellRole !== 'LANE_INSTANCE') return
    changed = fitLaneToChildren(node, options) || changed
  })
  return changed
}

function fitProcessContainerToChildren(
  container: Node,
  options: {
    clampChildren?: boolean
    shrinkToFit?: boolean
  } = {},
) {
  const children = flowNodeChildren(container)
  if (!children.length) return false
  let changed = false
  let maxRight = PROCESS_CONTAINER_LAYOUT.paddingLeft
  let maxBottom = PROCESS_CONTAINER_LAYOUT.paddingTop
  children.forEach((child) => {
    const relativePosition = child.position({ relative: true })
    const size = child.size()
    const nextX = options.clampChildren ?? true
      ? Math.max(PROCESS_CONTAINER_LAYOUT.paddingLeft, relativePosition.x)
      : relativePosition.x
    const nextY = options.clampChildren ?? true
      ? Math.max(PROCESS_CONTAINER_LAYOUT.paddingTop, relativePosition.y)
      : relativePosition.y
    if (nextX !== relativePosition.x || nextY !== relativePosition.y) {
      child.position(nextX, nextY, { relative: true })
      changed = true
    }
    maxRight = Math.max(maxRight, nextX + size.width)
    maxBottom = Math.max(maxBottom, nextY + size.height)
  })
  const requiredWidth = Math.max(
    PROCESS_CONTAINER_LAYOUT.minWidth,
    maxRight + PROCESS_CONTAINER_LAYOUT.paddingRight,
  )
  const requiredHeight = Math.max(
    PROCESS_CONTAINER_LAYOUT.minHeight,
    maxBottom + PROCESS_CONTAINER_LAYOUT.paddingBottom,
  )
  const currentSize = container.size()
  const canShrink = options.shrinkToFit ?? true
  const width = canShrink ? requiredWidth : Math.max(currentSize.width, requiredWidth)
  const height = canShrink ? requiredHeight : Math.max(currentSize.height, requiredHeight)
  if (currentSize.width !== width || currentSize.height !== height) {
    container.resize(width, height)
    changed = true
  }
  return changed
}

function minProcessContainerSize(container: Node) {
  const children = flowNodeChildren(container)
  if (!children.length) {
    return {
      width: PROCESS_CONTAINER_LAYOUT.minWidth,
      height: PROCESS_CONTAINER_LAYOUT.minHeight,
    }
  }
  let maxRight = PROCESS_CONTAINER_LAYOUT.paddingLeft
  let maxBottom = PROCESS_CONTAINER_LAYOUT.paddingTop
  children.forEach((child) => {
    const position = child.position({ relative: true })
    const size = child.size()
    maxRight = Math.max(maxRight, position.x + size.width)
    maxBottom = Math.max(maxBottom, position.y + size.height)
  })
  return {
    width: Math.max(
      PROCESS_CONTAINER_LAYOUT.minWidth,
      maxRight + PROCESS_CONTAINER_LAYOUT.paddingRight,
    ),
    height: Math.max(
      PROCESS_CONTAINER_LAYOUT.minHeight,
      maxBottom + PROCESS_CONTAINER_LAYOUT.paddingBottom,
    ),
  }
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
      const bpmnProfile = nodeProfileFromData(data)
      const containerParent = processContainerParent(node)
      const position = nodePositionForStorage(node)
      const size = node.size()
      return {
        nodeKey: data.nodeKey ?? node.id,
        nodeType: legacyNodeTypeForBpmn(bpmnProfile),
        ...bpmnProfile,
        title: data.title ?? String(node.attr('label/text') ?? '任务'),
        description: data.description ?? null,
        actor: data.actor ?? null,
        businessRule: data.businessRule ?? null,
        inputSummary: data.inputSummary ?? null,
        outputSummary: data.outputSummary ?? null,
        semanticProfileKey: data.semanticProfileKey ?? null,
        semanticProfileVersion: data.semanticProfileVersion ?? null,
        semanticPayloadJson: data.semanticPayloadJson ?? {},
        taskUiJson: data.taskUiJson ?? null,
        processContainerJson: data.processContainerJson ?? null,
        containerNodeKey: containerParent?.id ?? null,
        erRefs: data.erRefs ?? [],
        position,
        size,
        styleJson: data.styleJson ?? null,
        propertiesJson: mergeBpmnIntoProperties(data.propertiesJson, bpmnProfile),
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
      const defaultProfile = defaultBpmnEdgeProfileForEdge(edge)
      const requestedProfile = edgeProfileFromData(data, defaultProfile)
      const bpmnProfile =
        defaultProfile.bpmnFlowType === 'ASSOCIATION'
          ? defaultProfile
          : requestedProfile
      return [
        {
          edgeKey: data.edgeKey ?? edge.id,
          sourceNodeKey: sourceCell,
          targetNodeKey: targetCell,
          sourcePort: terminalPort(source),
          targetPort: terminalPort(target),
          edgeType: legacyEdgeTypeForBpmn(bpmnProfile),
          ...bpmnProfile,
          label: data.title ?? readEdgeLabel(edge),
          conditionText: data.bpmnConditionExpression ?? null,
          semanticProfileKey: data.semanticProfileKey ?? null,
          semanticProfileVersion: data.semanticProfileVersion ?? null,
          semanticPayloadJson: data.semanticPayloadJson ?? {},
          styleJson: data.styleJson ?? null,
          propertiesJson: mergeBpmnIntoProperties(data.propertiesJson, bpmnProfile),
        },
      ]
    })
  return { nodes, edges }
}

export function flowDraftFromGraph(
  graph: Graph,
  canvas: Pick<LocalBusinessFlowCanvas, 'businessFlowId' | 'name' | 'code' | 'description' | 'collabRevision' | 'nodes' | 'edges'>,
) {
  const timestamp = new Date().toISOString()
  const previousNodes = new Map(canvas.nodes.map((node) => [node.nodeKey, node]))
  const previousEdges = new Map(canvas.edges.map((edge) => [edge.edgeKey, edge]))
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
      const bpmnProfile = nodeProfileFromData(data)
      const nodeKey = data.nodeKey ?? node.id
      const previousNode = previousNodes.get(nodeKey)
      const containerParent = processContainerParent(node)
      const position = nodePositionForStorage(node)
      const size = node.size()
      const laneKey = data.laneInstanceKey ?? laneKeyForNodeCell(node)
      nodeLaneKey.set(node.id, laneKey)
      return {
        kind: 'BUSINESS_FLOW_NODE' as const,
        businessFlowId: canvas.businessFlowId,
        nodeId: previousNode?.nodeId ?? nodeKey,
        nodeKey,
        laneInstanceId: data.laneInstanceId ?? laneIdByKey.get(laneKey ?? '') ?? '',
        originComponentNodeKey: data.originComponentNodeKey ?? previousNode?.originComponentNodeKey ?? null,
        nodeType: legacyNodeTypeForBpmn(bpmnProfile),
        ...bpmnProfile,
        title: data.title ?? String(node.attr('label/text') ?? '任务'),
        description: data.description ?? null,
        actor: data.actor ?? null,
        businessRule: data.businessRule ?? null,
        erRefs: data.erRefs ?? [],
        position,
        size,
        inputSummary: data.inputSummary ?? previousNode?.inputSummary ?? null,
        outputSummary: data.outputSummary ?? previousNode?.outputSummary ?? null,
        semanticProfileKey: data.semanticProfileKey ?? previousNode?.semanticProfileKey ?? null,
        semanticProfileVersion: data.semanticProfileVersion ?? previousNode?.semanticProfileVersion ?? null,
        semanticPayloadJson: data.semanticPayloadJson ?? previousNode?.semanticPayloadJson ?? {},
        taskUiJson: data.taskUiJson ?? previousNode?.taskUiJson ?? null,
        processContainerJson: data.processContainerJson ?? previousNode?.processContainerJson ?? null,
        containerNodeKey: containerParent?.id ?? null,
        isOverridden: true,
        styleJson: data.styleJson ?? previousNode?.styleJson ?? null,
        propertiesJson: mergeBpmnIntoProperties(
          data.propertiesJson ?? previousNode?.propertiesJson,
          bpmnProfile,
        ),
        createdAt: previousNode?.createdAt ?? timestamp,
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
      const edgeKey = data.edgeKey ?? edge.id
      const previousEdge = previousEdges.get(edgeKey)
      const sourceNodeKey = sourceCell
      const targetNodeKey = targetCell
      const sourceLaneKey = nodeLaneKey.get(sourceNodeKey)
      const targetLaneKey = nodeLaneKey.get(targetNodeKey)
      const isCrossLane = Boolean(sourceLaneKey && targetLaneKey && sourceLaneKey !== targetLaneKey)
      const bpmnProfile = edgeProfileFromData(data, {
        bpmnFlowType: previousEdge?.bpmnFlowType ?? 'SEQUENCE',
        bpmnSequenceFlowKind: previousEdge?.bpmnSequenceFlowKind ?? 'NORMAL',
        bpmnMessageName: previousEdge?.bpmnMessageName ?? null,
        bpmnConditionExpression: previousEdge?.bpmnConditionExpression ?? null,
      })
      const enforcedProfile = defaultBpmnEdgeProfileForEdge(edge)
      const finalProfile =
        enforcedProfile.bpmnFlowType === 'ASSOCIATION'
          ? enforcedProfile
          : bpmnProfile
      return [
        {
          kind: 'BUSINESS_FLOW_EDGE' as const,
          businessFlowId: canvas.businessFlowId,
          edgeId: previousEdge?.edgeId ?? edgeKey,
          edgeKey,
          laneInstanceId: isCrossLane ? null : laneIdByKey.get(sourceLaneKey ?? '') ?? null,
          edgeType: legacyEdgeTypeForBpmn(finalProfile, isCrossLane),
          ...finalProfile,
          label: data.title ?? readEdgeLabel(edge),
          conditionText: data.bpmnConditionExpression ?? previousEdge?.conditionText ?? null,
          dataContract: previousEdge?.dataContract,
          semanticProfileKey: data.semanticProfileKey ?? previousEdge?.semanticProfileKey ?? null,
          semanticProfileVersion: data.semanticProfileVersion ?? previousEdge?.semanticProfileVersion ?? null,
          semanticPayloadJson: data.semanticPayloadJson ?? previousEdge?.semanticPayloadJson ?? {},
          isCrossLane,
          sourceType: 'NODE' as const,
          sourceNodeKey,
          sourceLaneInstanceKey: null,
          sourcePort: terminalPort(source),
          targetType: 'NODE' as const,
          targetNodeKey,
          targetLaneInstanceKey: null,
          targetPort: terminalPort(target),
          originComponentEdgeKey: data.originComponentEdgeKey ?? previousEdge?.originComponentEdgeKey ?? null,
          isOverridden: true,
          styleJson: data.styleJson ?? previousEdge?.styleJson ?? null,
          propertiesJson: mergeBpmnIntoProperties(
            data.propertiesJson ?? previousEdge?.propertiesJson,
            finalProfile,
          ),
          createdAt: previousEdge?.createdAt ?? timestamp,
          updatedAt: timestamp,
        } satisfies BusinessFlowEdgeRecord,
      ]
    })
  return {
    businessFlowId: canvas.businessFlowId,
    name: canvas.name,
    code: canvas.code,
    description: canvas.description,
    collabRevision: canvas.collabRevision,
    laneInstances: lanes,
    nodes,
    edges,
  }
}

export function flowLaneRecordFromCell(
  lane: Node,
  canvas: Pick<LocalBusinessFlowCanvas, 'businessFlowId'> & Partial<Pick<LocalBusinessFlowCanvas, 'laneInstances'>>,
): LocalBusinessFlowCanvas['laneInstances'][number] | null {
  const data = readCellData(lane)
  if (data.cellRole !== 'LANE_INSTANCE') return null
  const timestamp = new Date().toISOString()
  const laneKey = data.laneInstanceKey ?? lane.id
  const previousLane = canvas.laneInstances?.find((item) => item.instanceKey === laneKey)
  const position = lane.position()
  const size = lane.size()
  return {
    kind: 'LANE_INSTANCE',
    businessFlowId: canvas.businessFlowId,
    laneInstanceId: data.laneInstanceId ?? previousLane?.laneInstanceId ?? laneKey,
    instanceKey: laneKey,
    componentId: data.componentId ?? previousLane?.componentId ?? '',
    componentVersionId: data.componentVersionId ?? previousLane?.componentVersionId ?? '',
    componentName: previousLane?.componentName ?? data.title ?? String(lane.attr('label/text') ?? '泳道实例'),
    componentVersionNo: previousLane?.componentVersionNo ?? 1,
    displayName: String(lane.attr('label/text') ?? data.title ?? '泳道实例'),
    ownerRole: String(lane.attr('owner/text') ?? previousLane?.ownerRole ?? ''),
    isOverridden: true,
    position,
    size,
    zIndex: previousLane?.zIndex ?? lane.getZIndex() ?? 1,
    layoutJson: (data.layoutJson as BusinessFlowJson | null | undefined) ?? previousLane?.layoutJson ?? null,
    overrideJson: previousLane?.overrideJson ?? null,
    status: previousLane?.status ?? 'ACTIVE',
    createdAt: previousLane?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

export function flowNodeRecordFromCell(
  node: Node,
  canvas: Pick<LocalBusinessFlowCanvas, 'businessFlowId' | 'nodes' | 'laneInstances'>,
): BusinessFlowNodeRecord | null {
  const data = readCellData(node)
  if (data.cellRole !== 'FLOW_NODE') return null
  const timestamp = new Date().toISOString()
  const bpmnProfile = nodeProfileFromData(data)
  const nodeKey = data.nodeKey ?? node.id
  const previousNode = canvas.nodes.find((item) => item.nodeKey === nodeKey)
  const laneIdByKey = new Map(canvas.laneInstances.map((lane) => [lane.instanceKey, lane.laneInstanceId]))
  const containerParent = processContainerParent(node)
  const laneKey = data.laneInstanceKey ?? laneKeyForNodeCell(node)
  const position = nodePositionForStorage(node)
  const size = node.size()
  return {
    kind: 'BUSINESS_FLOW_NODE',
    businessFlowId: canvas.businessFlowId,
    nodeId: previousNode?.nodeId ?? nodeKey,
    nodeKey,
    laneInstanceId: data.laneInstanceId ?? laneIdByKey.get(laneKey ?? '') ?? previousNode?.laneInstanceId ?? '',
    originComponentNodeKey: data.originComponentNodeKey ?? previousNode?.originComponentNodeKey ?? null,
    nodeType: legacyNodeTypeForBpmn(bpmnProfile),
    ...bpmnProfile,
    title: data.title ?? String(node.attr('label/text') ?? '任务'),
    description: data.description ?? null,
    actor: data.actor ?? null,
    businessRule: data.businessRule ?? null,
    erRefs: data.erRefs ?? previousNode?.erRefs ?? [],
    position,
    size,
    inputSummary: data.inputSummary ?? previousNode?.inputSummary ?? null,
    outputSummary: data.outputSummary ?? previousNode?.outputSummary ?? null,
    semanticProfileKey: data.semanticProfileKey ?? previousNode?.semanticProfileKey ?? null,
    semanticProfileVersion: data.semanticProfileVersion ?? previousNode?.semanticProfileVersion ?? null,
    semanticPayloadJson: data.semanticPayloadJson ?? previousNode?.semanticPayloadJson ?? {},
    taskUiJson: data.taskUiJson ?? previousNode?.taskUiJson ?? null,
    processContainerJson: data.processContainerJson ?? previousNode?.processContainerJson ?? null,
    containerNodeKey: containerParent?.id ?? null,
    isOverridden: true,
    styleJson: data.styleJson ?? previousNode?.styleJson ?? null,
    propertiesJson: mergeBpmnIntoProperties(data.propertiesJson ?? previousNode?.propertiesJson, bpmnProfile),
    createdAt: previousNode?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

export function flowEdgeRecordFromCell(
  edge: Edge,
  canvas: Pick<LocalBusinessFlowCanvas, 'businessFlowId' | 'edges' | 'laneInstances'>,
): BusinessFlowEdgeRecord | null {
  const data = readCellData(edge)
  if (data.cellRole !== 'FLOW_EDGE') return null
  const source = edge.getSource()
  const target = edge.getTarget()
  const sourceCell = terminalCellId(source)
  const targetCell = terminalCellId(target)
  if (!sourceCell || !targetCell) return null
  const timestamp = new Date().toISOString()
  const edgeKey = data.edgeKey ?? edge.id
  const previousEdge = canvas.edges.find((item) => item.edgeKey === edgeKey)
  const sourceNode = edge.getSourceCell()
  const targetNode = edge.getTargetCell()
  const sourceLaneKey = sourceNode instanceof Node ? laneKeyForNodeCell(sourceNode) : undefined
  const targetLaneKey = targetNode instanceof Node ? laneKeyForNodeCell(targetNode) : undefined
  const laneIdByKey = new Map(canvas.laneInstances.map((lane) => [lane.instanceKey, lane.laneInstanceId]))
  const isCrossLane = Boolean(sourceLaneKey && targetLaneKey && sourceLaneKey !== targetLaneKey)
  const bpmnProfile = edgeProfileFromData(data, {
    bpmnFlowType: previousEdge?.bpmnFlowType ?? 'SEQUENCE',
    bpmnSequenceFlowKind: previousEdge?.bpmnSequenceFlowKind ?? 'NORMAL',
    bpmnMessageName: previousEdge?.bpmnMessageName ?? null,
    bpmnConditionExpression: previousEdge?.bpmnConditionExpression ?? null,
  })
  const enforcedProfile = defaultBpmnEdgeProfileForEdge(edge)
  const finalProfile =
    enforcedProfile.bpmnFlowType === 'ASSOCIATION'
      ? enforcedProfile
      : bpmnProfile
  return {
    kind: 'BUSINESS_FLOW_EDGE',
    businessFlowId: canvas.businessFlowId,
    edgeId: previousEdge?.edgeId ?? edgeKey,
    edgeKey,
    laneInstanceId: isCrossLane ? null : laneIdByKey.get(sourceLaneKey ?? '') ?? null,
    edgeType: legacyEdgeTypeForBpmn(finalProfile, isCrossLane),
    ...finalProfile,
    label: data.title ?? readEdgeLabel(edge),
    conditionText: data.bpmnConditionExpression ?? previousEdge?.conditionText ?? null,
    dataContract: previousEdge?.dataContract,
    semanticProfileKey: data.semanticProfileKey ?? previousEdge?.semanticProfileKey ?? null,
    semanticProfileVersion: data.semanticProfileVersion ?? previousEdge?.semanticProfileVersion ?? null,
    semanticPayloadJson: data.semanticPayloadJson ?? previousEdge?.semanticPayloadJson ?? {},
    isCrossLane,
    sourceType: 'NODE',
    sourceNodeKey: sourceCell,
    sourceLaneInstanceKey: null,
    sourcePort: terminalPort(source),
    targetType: 'NODE',
    targetNodeKey: targetCell,
    targetLaneInstanceKey: null,
    targetPort: terminalPort(target),
    originComponentEdgeKey: data.originComponentEdgeKey ?? previousEdge?.originComponentEdgeKey ?? null,
    isOverridden: true,
    styleJson: data.styleJson ?? previousEdge?.styleJson ?? null,
    propertiesJson: mergeBpmnIntoProperties(data.propertiesJson ?? previousEdge?.propertiesJson, finalProfile),
    createdAt: previousEdge?.createdAt ?? timestamp,
    updatedAt: timestamp,
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

export function updateNodeBpmnProfile(cell: Cell, profile: BpmnNodeProfile) {
  const data = readCellData(cell)
  const bpmnProfile = normalizeBpmnNodeProfile({
    ...profile,
    propertiesJson: data.propertiesJson,
  })
  const nodeType = legacyNodeTypeForBpmn(bpmnProfile)
  const title =
    data.title ?? String(cell.attr('label/text') ?? bpmnNodeTitle(bpmnProfile))

  if (cell instanceof Node) {
    cell.setProp('shape', shapeName(nodeType, bpmnProfile))
    cell.setMarkup(nodeMarkup(bpmnProfile))
    cell.setAttrs(nodeAttrs(bpmnProfile, title))
    cell.setProp('ports', NODE_PORTS)
    if (isDataBpmnElement(bpmnProfile.bpmnElementType)) {
      const connectedEdges = cell.model?.getConnectedEdges(cell) ?? []
      connectedEdges.forEach((edge) => {
        updateEdgeBpmnProfile(
          edge,
          normalizeBpmnEdgeProfile({ bpmnFlowType: 'ASSOCIATION' }),
        )
      })
    }
  }
  cell.setData({
    ...data,
    boundedContext: 'business-flow',
    cellRole: data.cellRole ?? 'FLOW_NODE',
    nodeType,
    ...bpmnProfile,
    propertiesJson: mergeBpmnIntoProperties(data.propertiesJson, bpmnProfile),
  } satisfies FlowCellData)
  return bpmnProfile
}

export function updateEdgeBpmnProfile(
  edge: Edge,
  profile: BpmnEdgeProfile,
  isCrossLane = readCellData(edge).edgeType === 'DEPENDENCY',
) {
  const data = readCellData(edge)
  const requestedProfile = normalizeBpmnEdgeProfile({
    ...profile,
    propertiesJson: data.propertiesJson,
  })
  const bpmnProfile =
    isDataNodeCell(edge.getSourceCell()) || isDataNodeCell(edge.getTargetCell())
      ? normalizeBpmnEdgeProfile({ bpmnFlowType: 'ASSOCIATION' })
      : requestedProfile
  edge.attr(edgeAttrs(isCrossLane, bpmnProfile))
  edge.setData({
    ...data,
    boundedContext: 'business-flow',
    cellRole: data.cellRole ?? 'FLOW_EDGE',
    edgeType: legacyEdgeTypeForBpmn(bpmnProfile, isCrossLane),
    ...bpmnProfile,
    propertiesJson: mergeBpmnIntoProperties(data.propertiesJson, bpmnProfile),
  } satisfies FlowCellData)
  return bpmnProfile
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

function edgeAttrs(crossLane: boolean, profile?: BpmnEdgeProfile | null) {
  const flowType = profile?.bpmnFlowType ?? 'SEQUENCE'
  const isAssociation = flowType === 'ASSOCIATION'
  const isMessage = flowType === 'MESSAGE'
  return {
    line: {
      stroke: isMessage ? '#2563eb' : isAssociation ? '#64748b' : crossLane ? '#f97316' : '#9aa8bd',
      strokeWidth: crossLane || isMessage ? 2 : 1.6,
      targetMarker: isAssociation
        ? {
            name: 'classic',
            width: 7,
            height: 5,
            fill: 'none',
          }
        : {
            name: 'block',
            width: 8,
            height: 6,
          },
      sourceMarker: isMessage
        ? {
            name: 'circle',
            r: 4,
            fill: '#fff',
            stroke: '#2563eb',
          }
        : null,
      strokeDasharray: isAssociation ? '2 4' : isMessage || crossLane ? '6 4' : '',
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
