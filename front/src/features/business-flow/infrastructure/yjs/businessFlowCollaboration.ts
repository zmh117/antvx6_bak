import { HocuspocusProvider } from '@hocuspocus/provider'
import { Edge, Graph, Node, type Cell } from '@antv/x6'
import * as Y from 'yjs'

import type {
  BpmnEventKind,
  BpmnFlowType,
  BpmnGatewayType,
  BpmnSequenceFlowKind,
  BpmnSubProcessKind,
  BusinessFlowEdgeType,
  BusinessFlowEdgeRecord,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  BusinessFlowNodeType,
  LocalBusinessFlowCanvas,
} from '@/entities/business-flow'
import {
  bpmnSemanticDisplayName,
  edgeSemanticType,
  isDataBpmnElement,
  nodeSemanticType,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
  normalizeBpmnSemantic,
  normalizeTaskUiContext,
  taskUiTaskName,
} from '@/entities/business-flow'
import {
  applyBusinessFlowCanvasPatchToGraph,
  type BusinessFlowCanvasPatch,
  flowEdgeRecordFromCell,
  applyBusinessFlowCanvasToGraph,
  flowDraftFromGraph,
  flowLaneRecordFromCell,
  flowNodeRecordFromCell,
  readCellData,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'
import {
  compactBusinessFlowCollabPatchPlan,
  deriveBusinessFlowCollabPatchPlan,
  type BusinessFlowCollabPatchEntry,
  type BusinessFlowCollabPatchPlan,
} from '@/features/business-flow/infrastructure/yjs/businessFlowCollabPatch'
import { patchYMapObjectFields } from '@/features/business-flow/infrastructure/yjs/yMapFields'
import { BUSINESS_FLOW_INCREMENTAL_COLLAB, COLLAB_WS_URL } from '@/shared/api/config'

const LOCAL_ORIGIN = 'business-flow-x6-local'

type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type BusinessFlowPresenceTarget =
  | { kind: 'lane'; key: string }
  | { kind: 'node'; key: string }
  | { kind: 'edge'; key: string }

export type BusinessFlowPresenceActivity = 'selecting' | 'editing' | 'dragging' | 'connecting'

export type BusinessFlowRemoteAwareness = {
  clientId: number
  isLocal?: boolean
  user: {
    id?: string
    name?: string
    email?: string
    color?: string
  }
  target?: BusinessFlowPresenceTarget | null
  activity?: BusinessFlowPresenceActivity
  updatedAt?: number
}

export type BusinessFlowCollaborationController = {
  pushGraph: (origin?: string) => LocalBusinessFlowCanvas | null
  patchLane: (node: Node, origin?: string) => LocalBusinessFlowCanvas | null
  patchNode: (node: Node, origin?: string) => LocalBusinessFlowCanvas | null
  patchEdge: (edge: Edge, origin?: string) => LocalBusinessFlowCanvas | null
  removeCells: (cells: Cell[], origin?: string) => LocalBusinessFlowCanvas | null
  isRealtimeEnabled: () => boolean
  setLocalPresence: (
    target: BusinessFlowPresenceTarget | null,
    activity?: BusinessFlowPresenceActivity,
  ) => void
  destroy: () => void
  doc: Y.Doc
  provider: HocuspocusProvider
}

export type BusinessFlowCollaborationOptions = {
  graph: Graph
  businessFlowId: string
  collabRevision: number
  token: string
  getCanvas: () => LocalBusinessFlowCanvas | null
  onStatus: (status: CollabStatus) => void
  onRemoteApply: (canvas: LocalBusinessFlowCanvas) => void
  onAwareness: (states: BusinessFlowRemoteAwareness[]) => void
  onError: (message: string) => void
  setApplyingRemote: (value: boolean) => void
  currentUser?: { id: string; email: string; display_name: string } | null
}

function mapObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (value instanceof Y.Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, item]) => [key, materializeYValue(item)]),
    )
  }
  return typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
}

function materializeYValue(value: unknown): unknown {
  if (value instanceof Y.Map) return mapObject(value)
  if (value instanceof Y.Array) return value.toArray().map(materializeYValue)
  return value
}

function clearMap(map: Y.Map<unknown>) {
  Array.from(map.keys()).forEach((key) => map.delete(key))
}

function setMapObject(
  root: Y.Map<unknown>,
  key: string,
  value: Record<string, unknown>,
  skipKeys?: Set<string>,
) {
  const current = root.get(key)
  const child = current instanceof Y.Map ? current : new Y.Map<unknown>()
  if (!(current instanceof Y.Map)) root.set(key, child)
  setYMapFields(child, value, skipKeys)
}

function setYMapFields(
  target: Y.Map<unknown>,
  value: Record<string, unknown>,
  skipKeys?: Set<string>,
) {
  const nextKeys = new Set(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key]) => key),
  )
  Array.from(target.keys()).forEach((key) => {
    if (!nextKeys.has(key)) target.delete(key)
  })
  Object.entries(value).forEach(([key, item]) => {
    if (item === undefined || skipKeys?.has(key)) return
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const current = target.get(key)
      const nested = current instanceof Y.Map ? current : new Y.Map<unknown>()
      if (!(current instanceof Y.Map)) target.set(key, nested)
      setYMapFields(nested, item as Record<string, unknown>)
      return
    }
    target.set(key, item)
  })
}

function patchNestedObject(
  root: Y.Map<unknown>,
  recordKey: string,
  fieldKey: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const record = root.get(recordKey)
  if (!(record instanceof Y.Map)) return
  const current = record.get(fieldKey)
  const nested = current instanceof Y.Map ? current : new Y.Map<unknown>()
  if (!(current instanceof Y.Map)) record.set(fieldKey, nested)
  patchYMapObjectFields(nested, previous, next)
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value ? value : fallback
}

function typedString<T extends string>(
  value: unknown,
  fallback?: T | null,
): T | null | undefined {
  return typeof value === 'string' ? value as T : fallback
}

function refSignature(ref: BusinessFlowNodeErRef | Record<string, unknown>) {
  const raw = ref as Record<string, unknown> & BusinessFlowNodeErRef
  return [
    raw.erDiagramId ?? raw.er_diagram_id ?? '',
    raw.erTableKey ?? raw.er_table_key ?? '',
    raw.erColumnKey ?? raw.er_column_key ?? '',
  ].join(':')
}

function erRefKey(nodeKey: string, ref: BusinessFlowNodeErRef | Record<string, unknown>) {
  return String(ref.id || `${nodeKey}:${refSignature(ref)}`)
}

function taskUiForNode(node: Pick<BusinessFlowNodeRecord, 'bpmnElementType' | 'taskUiJson' | 'title'>) {
  return node.bpmnElementType === 'TASK'
    ? normalizeTaskUiContext(node.taskUiJson, { taskName: node.title })
    : node.taskUiJson ?? null
}

function titleForNode(node: Pick<BusinessFlowNodeRecord, 'bpmnElementType' | 'taskUiJson' | 'title' | 'bpmnSemanticJson'>) {
  const taskUiJson = taskUiForNode(node)
  return node.bpmnElementType === 'TASK'
    ? taskUiTaskName(taskUiJson, node.title || '任务')
    : bpmnSemanticDisplayName(node.bpmnSemanticJson, node.title)
}

function writeLaneToDoc(
  lanes: Y.Map<unknown>,
  canvas: LocalBusinessFlowCanvas,
  lane: LocalBusinessFlowCanvas['laneInstances'][number],
) {
  setMapObject(lanes, lane.instanceKey, {
    id: lane.laneInstanceId,
    instance_key: lane.instanceKey,
    component_id: lane.componentId,
    component_version_id: lane.componentVersionId,
    component_name: lane.componentName,
    component_version_no: lane.componentVersionNo,
    display_name: lane.displayName,
    owner_role: lane.ownerRole ?? null,
    position_x: lane.position.x,
    position_y: lane.position.y,
    width: lane.size.width,
    height: lane.size.height,
    z_index: lane.zIndex,
    layout_json: lane.layoutJson ?? {},
    override_json: lane.overrideJson ?? {},
    business_flow_id: canvas.businessFlowId,
  })
}

function writeNodeToDoc(
  nodes: Y.Map<unknown>,
  erRefs: Y.Map<unknown>,
  laneKeyById: Map<string, string>,
  node: BusinessFlowNodeRecord,
  previous?: BusinessFlowNodeRecord,
) {
  const laneInstanceKey = laneKeyById.get(node.laneInstanceId) ?? null
  const taskUiJson = taskUiForNode(node)
  const title = titleForNode(node)
  setMapObject(nodes, node.nodeKey, {
    id: node.nodeId,
    lane_instance_id: node.laneInstanceId,
    lane_instance_key: laneInstanceKey,
    node_key: node.nodeKey,
    origin_component_node_key: node.originComponentNodeKey ?? null,
    node_type: node.nodeType,
    bpmn_element_type: node.bpmnElementType ?? null,
    bpmn_event_kind: node.bpmnEventKind ?? null,
    bpmn_event_definition: node.bpmnEventDefinition ?? null,
    bpmn_task_type: node.bpmnTaskType ?? null,
    bpmn_gateway_type: node.bpmnGatewayType ?? null,
    bpmn_subprocess_kind: node.bpmnSubProcessKind ?? null,
    title,
    bpmn_semantic_json: node.bpmnSemanticJson ?? {},
    task_ui_json: taskUiJson ?? {},
    position_x: node.position.x,
    position_y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    is_overridden: node.isOverridden,
    style_json: node.styleJson ?? {},
    properties_json: node.propertiesJson ?? {},
  }, previous ? new Set(['bpmn_semantic_json']) : undefined)
  if (previous) {
    patchNestedObject(
      nodes,
      node.nodeKey,
      'bpmn_semantic_json',
      (previous.bpmnSemanticJson ?? {}) as unknown as Record<string, unknown>,
      (node.bpmnSemanticJson ?? {}) as unknown as Record<string, unknown>,
    )
  }
  Array.from(erRefs.keys()).forEach((key) => {
    const ref = mapObject(erRefs.get(key))
    if ((ref.node_key || ref.nodeKey) === node.nodeKey) erRefs.delete(key)
  })
  ;(isDataBpmnElement(node.bpmnElementType) ? node.erRefs ?? [] : []).forEach((ref) => {
    setMapObject(erRefs, erRefKey(node.nodeKey, ref), {
      id: ref.id,
      node_key: node.nodeKey,
      er_diagram_id: ref.erDiagramId,
      er_table_key: ref.erTableKey,
      er_column_key: ref.erColumnKey ?? null,
      ref_type: ref.refType,
      description: ref.description ?? null,
    })
  })
}

function writeEdgeToDoc(
  edges: Y.Map<unknown>,
  edge: BusinessFlowEdgeRecord,
  previous?: BusinessFlowEdgeRecord,
) {
  setMapObject(edges, edge.edgeKey, {
    id: edge.edgeId,
    lane_instance_id: edge.laneInstanceId ?? null,
    edge_key: edge.edgeKey,
    source_type: edge.sourceType,
    source_node_key: edge.sourceNodeKey ?? null,
    source_lane_instance_key: edge.sourceLaneInstanceKey ?? null,
    source_port: edge.sourcePort ?? null,
    target_type: edge.targetType,
    target_node_key: edge.targetNodeKey ?? null,
    target_lane_instance_key: edge.targetLaneInstanceKey ?? null,
    target_port: edge.targetPort ?? null,
    edge_type: edge.edgeType,
    bpmn_flow_type: edge.bpmnFlowType ?? null,
    bpmn_sequence_flow_kind: edge.bpmnSequenceFlowKind ?? null,
    label: edge.label ?? null,
    bpmn_semantic_json: edge.bpmnSemanticJson ?? {},
    origin_component_edge_key: edge.originComponentEdgeKey ?? null,
    is_overridden: edge.isOverridden,
    style_json: edge.styleJson ?? {},
    properties_json: edge.propertiesJson ?? {},
  }, previous ? new Set(['bpmn_semantic_json']) : undefined)
  if (previous) {
    patchNestedObject(
      edges,
      edge.edgeKey,
      'bpmn_semantic_json',
      (previous.bpmnSemanticJson ?? {}) as unknown as Record<string, unknown>,
      (edge.bpmnSemanticJson ?? {}) as unknown as Record<string, unknown>,
    )
  }
}

function writeCanvasToDoc(
  canvas: LocalBusinessFlowCanvas,
  doc: Y.Doc,
  origin = LOCAL_ORIGIN,
) {
  const lanes = doc.getMap('lanes')
  const nodes = doc.getMap('nodes')
  const edges = doc.getMap('edges')
  const erRefs = doc.getMap('erRefs')
  const meta = doc.getMap('meta')
  const laneKeyById = new Map(canvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  doc.transact(() => {
    clearMap(lanes)
    clearMap(nodes)
    clearMap(edges)
    clearMap(erRefs)
    meta.set('schemaVersion', 3)
    meta.set('documentType', 'BUSINESS_FLOW')
    meta.set('businessFlowId', canvas.businessFlowId)
    meta.set('collabRevision', canvas.collabRevision)
    meta.set('updatedAt', new Date().toISOString())
    canvas.laneInstances.forEach((lane) => writeLaneToDoc(lanes, canvas, lane))
    canvas.nodes.forEach((node) => writeNodeToDoc(nodes, erRefs, laneKeyById, node))
    canvas.edges.forEach((edge) => writeEdgeToDoc(edges, edge))
  }, origin)
}

function draftCanvasFromGraph(
  graph: Graph,
  previous: LocalBusinessFlowCanvas,
): LocalBusinessFlowCanvas {
  const draft = flowDraftFromGraph(graph, previous)
  return {
    ...previous,
    ...draft,
    version: previous.version,
    collabRevision: previous.collabRevision,
    updatedAt: new Date().toISOString(),
  }
}

function refsByNodeKeyFromDoc(doc: Y.Doc) {
  const refs = new Map<string, BusinessFlowNodeErRef[]>()
  for (const value of doc.getMap('erRefs').values()) {
    const raw = mapObject(value)
    const nodeKey = String(raw.node_key || raw.nodeKey || '')
    if (!nodeKey) continue
    const next = refs.get(nodeKey) ?? []
    next.push({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      erDiagramId: String(raw.er_diagram_id || raw.erDiagramId || ''),
      erTableKey: String(raw.er_table_key || raw.erTableKey || ''),
      erColumnKey: raw.er_column_key || raw.erColumnKey ? String(raw.er_column_key || raw.erColumnKey) : null,
      refType: String(raw.ref_type || raw.refType || 'READ') as BusinessFlowNodeErRef['refType'],
      description: raw.description ? String(raw.description) : null,
    })
    refs.set(nodeKey, next)
  }
  return refs
}

function canvasFromDoc(doc: Y.Doc, base: LocalBusinessFlowCanvas): LocalBusinessFlowCanvas {
  const refsByNodeKey = refsByNodeKeyFromDoc(doc)
  const timestamp = new Date().toISOString()
  const lanes = Array.from(doc.getMap('lanes').values()).map((value, index) => {
    const raw = mapObject(value)
    const instanceKey = stringValue(raw.instance_key || raw.instanceKey, stringValue(raw.id, `lane_${index}`))
    return {
      kind: 'LANE_INSTANCE' as const,
      businessFlowId: base.businessFlowId,
      laneInstanceId: stringValue(raw.id || raw.lane_instance_id || raw.laneInstanceId, instanceKey),
      instanceKey,
      componentId: stringValue(raw.component_id || raw.componentId),
      componentVersionId: stringValue(raw.component_version_id || raw.componentVersionId),
      componentName: stringValue(raw.component_name || raw.componentName || raw.display_name || raw.displayName, '泳道实例'),
      componentVersionNo: numberValue(raw.component_version_no || raw.componentVersionNo, 1),
      displayName: stringValue(raw.display_name || raw.displayName, '泳道实例'),
      ownerRole: raw.owner_role || raw.ownerRole ? String(raw.owner_role || raw.ownerRole) : null,
      isOverridden: true,
      position: {
        x: numberValue(raw.position_x ?? raw.x),
        y: numberValue(raw.position_y ?? raw.y),
      },
      size: {
        width: numberValue(raw.width, 360),
        height: numberValue(raw.height, 360),
      },
      zIndex: numberValue(raw.z_index || raw.zIndex, index + 1),
      layoutJson: (raw.layout_json || raw.layoutJson || {}) as Record<string, unknown>,
      overrideJson: (raw.override_json || raw.overrideJson || {}) as Record<string, unknown>,
      status: 'ACTIVE' as const,
      createdAt: base.createdAt,
      updatedAt: timestamp,
    }
  }).sort((a, b) => a.zIndex - b.zIndex || a.instanceKey.localeCompare(b.instanceKey))

  const laneIdByKey = new Map(lanes.map((lane) => [lane.instanceKey, lane.laneInstanceId]))
  const nodes = Array.from(doc.getMap('nodes').values()).map((value) => {
    const raw = mapObject(value)
    const nodeKey = stringValue(raw.node_key || raw.nodeKey || raw.id, 'node')
    const laneInstanceKey = raw.lane_instance_key || raw.laneInstanceKey
      ? String(raw.lane_instance_key || raw.laneInstanceKey)
      : null
    const laneInstanceId =
      stringValue(raw.lane_instance_id || raw.laneInstanceId) ||
      (laneInstanceKey ? laneIdByKey.get(laneInstanceKey) : undefined) ||
      ''
    const bpmnElementType = raw.bpmn_element_type || raw.bpmnElementType
      ? String(raw.bpmn_element_type || raw.bpmnElementType) as BusinessFlowNodeRecord['bpmnElementType']
      : null
    const rawTitle = stringValue(raw.title, '任务')
    const bpmnProfile = normalizeBpmnNodeProfile({
      nodeType: typedString<BusinessFlowNodeType>(raw.node_type || raw.nodeType),
      bpmnElementType,
      bpmnEventKind: typedString<BpmnEventKind>(raw.bpmn_event_kind || raw.bpmnEventKind),
      bpmnGatewayType: typedString<BpmnGatewayType>(raw.bpmn_gateway_type || raw.bpmnGatewayType),
      bpmnSubProcessKind: typedString<BpmnSubProcessKind>(raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind),
    })
    const semanticType = nodeSemanticType(bpmnProfile)
    const bpmnSemanticJson = semanticType
      ? normalizeBpmnSemantic(raw.bpmn_semantic_json || raw.bpmnSemanticJson, semanticType, rawTitle)
      : null
    const taskUiJson = bpmnElementType === 'TASK'
      ? normalizeTaskUiContext(raw.task_ui_json || raw.taskUiJson || null, { taskName: rawTitle })
      : (raw.task_ui_json || raw.taskUiJson || null) as BusinessFlowNodeRecord['taskUiJson']
    const title = bpmnElementType === 'TASK'
      ? taskUiTaskName(taskUiJson, rawTitle)
      : bpmnSemanticDisplayName(bpmnSemanticJson, rawTitle)
    return {
      kind: 'BUSINESS_FLOW_NODE' as const,
      businessFlowId: base.businessFlowId,
      nodeId: stringValue(raw.id, nodeKey),
      nodeKey,
      laneInstanceId,
      originComponentNodeKey: raw.origin_component_node_key || raw.originComponentNodeKey
        ? String(raw.origin_component_node_key || raw.originComponentNodeKey)
        : null,
      nodeType: stringValue(raw.node_type || raw.nodeType, 'TASK') as BusinessFlowNodeType,
      bpmnElementType,
      bpmnEventKind: raw.bpmn_event_kind || raw.bpmnEventKind
        ? String(raw.bpmn_event_kind || raw.bpmnEventKind) as BusinessFlowNodeRecord['bpmnEventKind']
        : null,
      bpmnEventDefinition: raw.bpmn_event_definition || raw.bpmnEventDefinition
        ? String(raw.bpmn_event_definition || raw.bpmnEventDefinition) as BusinessFlowNodeRecord['bpmnEventDefinition']
        : null,
      bpmnTaskType: raw.bpmn_task_type || raw.bpmnTaskType
        ? String(raw.bpmn_task_type || raw.bpmnTaskType) as BusinessFlowNodeRecord['bpmnTaskType']
        : null,
      bpmnGatewayType: raw.bpmn_gateway_type || raw.bpmnGatewayType
        ? String(raw.bpmn_gateway_type || raw.bpmnGatewayType) as BusinessFlowNodeRecord['bpmnGatewayType']
        : null,
      bpmnSubProcessKind: raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind
        ? String(raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind) as BusinessFlowNodeRecord['bpmnSubProcessKind']
        : null,
      title,
      bpmnSemanticJson,
      taskUiJson,
      erRefs: isDataBpmnElement(bpmnElementType) ? refsByNodeKey.get(nodeKey) ?? [] : [],
      position: {
        x: numberValue(raw.position_x ?? raw.x),
        y: numberValue(raw.position_y ?? raw.y),
      },
      size: {
        width: numberValue(raw.width, 120),
        height: numberValue(raw.height, 60),
      },
      isOverridden: Boolean(raw.is_overridden ?? raw.isOverridden),
      styleJson: (raw.style_json || raw.styleJson || {}) as Record<string, unknown>,
      propertiesJson: (raw.properties_json || raw.propertiesJson || {}) as Record<string, unknown>,
      createdAt: base.createdAt,
      updatedAt: timestamp,
    }
  }).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey))

  const nodeLaneByKey = new Map(nodes.map((node) => [node.nodeKey, node.laneInstanceId]))
  const edges = Array.from(doc.getMap('edges').values()).map((value) => {
    const raw = mapObject(value)
    const edgeKey = stringValue(raw.edge_key || raw.edgeKey || raw.id, 'edge')
    const sourceNodeKey = raw.source_node_key || raw.sourceNodeKey
      ? String(raw.source_node_key || raw.sourceNodeKey)
      : null
    const targetNodeKey = raw.target_node_key || raw.targetNodeKey
      ? String(raw.target_node_key || raw.targetNodeKey)
      : null
    const sourceLane = sourceNodeKey ? nodeLaneByKey.get(sourceNodeKey) : null
    const targetLane = targetNodeKey ? nodeLaneByKey.get(targetNodeKey) : null
    const isCrossLane = Boolean(sourceLane && targetLane && sourceLane !== targetLane)
    const edgeProfile = normalizeBpmnEdgeProfile({
      edgeType: typedString<BusinessFlowEdgeType>(raw.edge_type || raw.edgeType),
      bpmnFlowType: typedString<BpmnFlowType>(raw.bpmn_flow_type || raw.bpmnFlowType),
      bpmnSequenceFlowKind: typedString<BpmnSequenceFlowKind>(raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind),
    })
    const bpmnSemanticJson = normalizeBpmnSemantic(
      raw.bpmn_semantic_json || raw.bpmnSemanticJson,
      edgeSemanticType(edgeProfile),
      raw.label ? String(raw.label) : '',
    )
    return {
      kind: 'BUSINESS_FLOW_EDGE' as const,
      businessFlowId: base.businessFlowId,
      edgeId: stringValue(raw.id, edgeKey),
      edgeKey,
      laneInstanceId: raw.lane_instance_id || raw.laneInstanceId
        ? String(raw.lane_instance_id || raw.laneInstanceId)
        : isCrossLane ? null : sourceLane ?? null,
      edgeType: stringValue(raw.edge_type || raw.edgeType, isCrossLane ? 'DEPENDENCY' : 'SEQUENCE') as BusinessFlowEdgeRecord['edgeType'],
      bpmnFlowType: raw.bpmn_flow_type || raw.bpmnFlowType
        ? String(raw.bpmn_flow_type || raw.bpmnFlowType) as BusinessFlowEdgeRecord['bpmnFlowType']
        : null,
      bpmnSequenceFlowKind: raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind
        ? String(raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind) as BusinessFlowEdgeRecord['bpmnSequenceFlowKind']
        : null,
      label: bpmnSemanticDisplayName(bpmnSemanticJson, raw.label ? String(raw.label) : '') || null,
      bpmnSemanticJson,
      isCrossLane,
      sourceType: stringValue(raw.source_type || raw.sourceType, 'NODE') as BusinessFlowEdgeRecord['sourceType'],
      sourceNodeKey,
      sourceLaneInstanceKey: raw.source_lane_instance_key || raw.sourceLaneInstanceKey
        ? String(raw.source_lane_instance_key || raw.sourceLaneInstanceKey)
        : null,
      sourcePort: raw.source_port || raw.sourcePort ? String(raw.source_port || raw.sourcePort) : null,
      targetType: stringValue(raw.target_type || raw.targetType, 'NODE') as BusinessFlowEdgeRecord['targetType'],
      targetNodeKey,
      targetLaneInstanceKey: raw.target_lane_instance_key || raw.targetLaneInstanceKey
        ? String(raw.target_lane_instance_key || raw.targetLaneInstanceKey)
        : null,
      targetPort: raw.target_port || raw.targetPort ? String(raw.target_port || raw.targetPort) : null,
      originComponentEdgeKey: raw.origin_component_edge_key || raw.originComponentEdgeKey
        ? String(raw.origin_component_edge_key || raw.originComponentEdgeKey)
        : null,
      isOverridden: Boolean(raw.is_overridden ?? raw.isOverridden),
      styleJson: (raw.style_json || raw.styleJson || {}) as Record<string, unknown>,
      propertiesJson: (raw.properties_json || raw.propertiesJson || {}) as Record<string, unknown>,
      createdAt: base.createdAt,
      updatedAt: timestamp,
    } satisfies BusinessFlowEdgeRecord
  }).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey))

  const revision = numberValue(doc.getMap('meta').get('collabRevision'), base.collabRevision)
  return {
    ...base,
    collabRevision: revision,
    laneInstances: lanes,
    nodes,
    edges,
    updatedAt: timestamp,
  }
}

function deleteCellsFromDoc(doc: Y.Doc, cells: Cell[], origin = LOCAL_ORIGIN) {
  const nodes = doc.getMap('nodes')
  const edges = doc.getMap('edges')
  const erRefs = doc.getMap('erRefs')
  doc.transact(() => {
    cells.forEach((cell) => {
      const data = readCellData(cell)
      if (data.cellRole === 'FLOW_EDGE') {
        edges.delete(data.edgeKey ?? cell.id)
        return
      }
      if (data.cellRole === 'FLOW_NODE') {
        const nodeKey = data.nodeKey ?? cell.id
        nodes.delete(nodeKey)
        Array.from(erRefs.keys()).forEach((key) => {
          const ref = mapObject(erRefs.get(key))
          if ((ref.node_key || ref.nodeKey) === nodeKey) erRefs.delete(key)
        })
        Array.from(edges.keys()).forEach((key) => {
          const edge = mapObject(edges.get(key))
          if ((edge.source_node_key || edge.sourceNodeKey) === nodeKey) edges.delete(key)
          if ((edge.target_node_key || edge.targetNodeKey) === nodeKey) edges.delete(key)
        })
      }
    })
    doc.getMap('meta').set('updatedAt', new Date().toISOString())
  }, origin)
}

function replaceByKey<T>(
  items: T[],
  keyOf: (item: T) => string,
  key: string,
  nextItem: T,
) {
  const index = items.findIndex((item) => keyOf(item) === key)
  if (index < 0) return [...items, nextItem]
  const nextItems = [...items]
  nextItems[index] = nextItem
  return nextItems
}

function withoutKeys<T>(items: T[], keyOf: (item: T) => string, keys: Set<string>) {
  if (keys.size === 0) return items
  return items.filter((item) => !keys.has(keyOf(item)))
}

function laneFromDocEntry(
  doc: Y.Doc,
  base: LocalBusinessFlowCanvas,
  laneKey: string,
): LocalBusinessFlowCanvas['laneInstances'][number] | null {
  const rawValue = doc.getMap('lanes').get(laneKey)
  if (!rawValue) return null
  const raw = mapObject(rawValue)
  const timestamp = new Date().toISOString()
  const previous = base.laneInstances.find((lane) => lane.instanceKey === laneKey)
  const instanceKey = stringValue(raw.instance_key || raw.instanceKey, laneKey)
  return {
    kind: 'LANE_INSTANCE',
    businessFlowId: base.businessFlowId,
    laneInstanceId: stringValue(raw.id || raw.lane_instance_id || raw.laneInstanceId, previous?.laneInstanceId ?? instanceKey),
    instanceKey,
    componentId: stringValue(raw.component_id || raw.componentId, previous?.componentId ?? ''),
    componentVersionId: stringValue(raw.component_version_id || raw.componentVersionId, previous?.componentVersionId ?? ''),
    componentName: stringValue(raw.component_name || raw.componentName || raw.display_name || raw.displayName, previous?.componentName ?? '泳道实例'),
    componentVersionNo: numberValue(raw.component_version_no || raw.componentVersionNo, previous?.componentVersionNo ?? 1),
    displayName: stringValue(raw.display_name || raw.displayName, previous?.displayName ?? '泳道实例'),
    ownerRole: raw.owner_role || raw.ownerRole ? String(raw.owner_role || raw.ownerRole) : previous?.ownerRole ?? null,
    isOverridden: true,
    position: {
      x: numberValue(raw.position_x ?? raw.x, previous?.position.x ?? 0),
      y: numberValue(raw.position_y ?? raw.y, previous?.position.y ?? 0),
    },
    size: {
      width: numberValue(raw.width, previous?.size.width ?? 360),
      height: numberValue(raw.height, previous?.size.height ?? 360),
    },
    zIndex: numberValue(raw.z_index || raw.zIndex, previous?.zIndex ?? 1),
    layoutJson: (raw.layout_json || raw.layoutJson || previous?.layoutJson || {}) as Record<string, unknown>,
    overrideJson: (raw.override_json || raw.overrideJson || previous?.overrideJson || {}) as Record<string, unknown>,
    status: previous?.status ?? 'ACTIVE',
    createdAt: previous?.createdAt ?? base.createdAt,
    updatedAt: timestamp,
  }
}

function nodeFromDocEntry(
  doc: Y.Doc,
  base: LocalBusinessFlowCanvas,
  lanes: LocalBusinessFlowCanvas['laneInstances'],
  nodeKey: string,
): BusinessFlowNodeRecord | null {
  const rawValue = doc.getMap('nodes').get(nodeKey)
  if (!rawValue) return null
  const raw = mapObject(rawValue)
  const timestamp = new Date().toISOString()
  const previous = base.nodes.find((node) => node.nodeKey === nodeKey)
  const laneIdByKey = new Map(lanes.map((lane) => [lane.instanceKey, lane.laneInstanceId]))
  const refsByNodeKey = refsByNodeKeyFromDoc(doc)
  const laneInstanceKey = raw.lane_instance_key || raw.laneInstanceKey
    ? String(raw.lane_instance_key || raw.laneInstanceKey)
    : null
  const laneInstanceId =
    stringValue(raw.lane_instance_id || raw.laneInstanceId) ||
    (laneInstanceKey ? laneIdByKey.get(laneInstanceKey) : undefined) ||
    previous?.laneInstanceId ||
    ''
  const bpmnElementType = raw.bpmn_element_type || raw.bpmnElementType
    ? String(raw.bpmn_element_type || raw.bpmnElementType) as BusinessFlowNodeRecord['bpmnElementType']
    : previous?.bpmnElementType ?? null
  const rawTitle = stringValue(raw.title, previous?.title ?? '任务')
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType: typedString<BusinessFlowNodeType>(raw.node_type || raw.nodeType, previous?.nodeType),
    bpmnElementType,
    bpmnEventKind: typedString<BpmnEventKind>(raw.bpmn_event_kind || raw.bpmnEventKind, previous?.bpmnEventKind),
    bpmnGatewayType: typedString<BpmnGatewayType>(raw.bpmn_gateway_type || raw.bpmnGatewayType, previous?.bpmnGatewayType),
    bpmnSubProcessKind: typedString<BpmnSubProcessKind>(raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind, previous?.bpmnSubProcessKind),
  })
  const semanticType = nodeSemanticType(bpmnProfile)
  const bpmnSemanticJson = semanticType
    ? normalizeBpmnSemantic(
        raw.bpmn_semantic_json || raw.bpmnSemanticJson || previous?.bpmnSemanticJson,
        semanticType,
        rawTitle,
      )
    : null
  const taskUiJson = bpmnElementType === 'TASK'
    ? normalizeTaskUiContext(raw.task_ui_json || raw.taskUiJson || previous?.taskUiJson || null, { taskName: rawTitle })
    : (raw.task_ui_json || raw.taskUiJson || previous?.taskUiJson || null) as BusinessFlowNodeRecord['taskUiJson']
  const title = bpmnElementType === 'TASK'
    ? taskUiTaskName(taskUiJson, rawTitle)
    : bpmnSemanticDisplayName(bpmnSemanticJson, rawTitle)
  return {
    kind: 'BUSINESS_FLOW_NODE',
    businessFlowId: base.businessFlowId,
    nodeId: stringValue(raw.id, previous?.nodeId ?? nodeKey),
    nodeKey,
    laneInstanceId,
    originComponentNodeKey: raw.origin_component_node_key || raw.originComponentNodeKey
      ? String(raw.origin_component_node_key || raw.originComponentNodeKey)
      : previous?.originComponentNodeKey ?? null,
    nodeType: stringValue(raw.node_type || raw.nodeType, previous?.nodeType ?? 'TASK') as BusinessFlowNodeType,
    bpmnElementType,
    bpmnEventKind: raw.bpmn_event_kind || raw.bpmnEventKind
      ? String(raw.bpmn_event_kind || raw.bpmnEventKind) as BusinessFlowNodeRecord['bpmnEventKind']
      : previous?.bpmnEventKind ?? null,
    bpmnEventDefinition: raw.bpmn_event_definition || raw.bpmnEventDefinition
      ? String(raw.bpmn_event_definition || raw.bpmnEventDefinition) as BusinessFlowNodeRecord['bpmnEventDefinition']
      : previous?.bpmnEventDefinition ?? null,
    bpmnTaskType: raw.bpmn_task_type || raw.bpmnTaskType
      ? String(raw.bpmn_task_type || raw.bpmnTaskType) as BusinessFlowNodeRecord['bpmnTaskType']
      : previous?.bpmnTaskType ?? null,
    bpmnGatewayType: raw.bpmn_gateway_type || raw.bpmnGatewayType
      ? String(raw.bpmn_gateway_type || raw.bpmnGatewayType) as BusinessFlowNodeRecord['bpmnGatewayType']
      : previous?.bpmnGatewayType ?? null,
    bpmnSubProcessKind: raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind
      ? String(raw.bpmn_subprocess_kind || raw.bpmnSubProcessKind) as BusinessFlowNodeRecord['bpmnSubProcessKind']
      : previous?.bpmnSubProcessKind ?? null,
    title,
    bpmnSemanticJson,
    taskUiJson,
    erRefs: isDataBpmnElement(bpmnElementType) ? refsByNodeKey.get(nodeKey) ?? [] : [],
    position: {
      x: numberValue(raw.position_x ?? raw.x, previous?.position.x ?? 0),
      y: numberValue(raw.position_y ?? raw.y, previous?.position.y ?? 0),
    },
    size: {
      width: numberValue(raw.width, previous?.size.width ?? 120),
      height: numberValue(raw.height, previous?.size.height ?? 60),
    },
    isOverridden: Boolean(raw.is_overridden ?? raw.isOverridden ?? previous?.isOverridden),
    styleJson: (raw.style_json || raw.styleJson || previous?.styleJson || {}) as Record<string, unknown>,
    propertiesJson: (raw.properties_json || raw.propertiesJson || previous?.propertiesJson || {}) as Record<string, unknown>,
    createdAt: previous?.createdAt ?? base.createdAt,
    updatedAt: timestamp,
  }
}

function edgeFromDocEntry(
  doc: Y.Doc,
  base: LocalBusinessFlowCanvas,
  nodes: BusinessFlowNodeRecord[],
  edgeKey: string,
): BusinessFlowEdgeRecord | null {
  const rawValue = doc.getMap('edges').get(edgeKey)
  if (!rawValue) return null
  const raw = mapObject(rawValue)
  const timestamp = new Date().toISOString()
  const previous = base.edges.find((edge) => edge.edgeKey === edgeKey)
  const sourceNodeKey = raw.source_node_key || raw.sourceNodeKey
    ? String(raw.source_node_key || raw.sourceNodeKey)
    : null
  const targetNodeKey = raw.target_node_key || raw.targetNodeKey
    ? String(raw.target_node_key || raw.targetNodeKey)
    : null
  const nodeLaneByKey = new Map(nodes.map((node) => [node.nodeKey, node.laneInstanceId]))
  const sourceLane = sourceNodeKey ? nodeLaneByKey.get(sourceNodeKey) : null
  const targetLane = targetNodeKey ? nodeLaneByKey.get(targetNodeKey) : null
  const isCrossLane = Boolean(sourceLane && targetLane && sourceLane !== targetLane)
  const edgeProfile = normalizeBpmnEdgeProfile({
    edgeType: typedString<BusinessFlowEdgeType>(raw.edge_type || raw.edgeType, previous?.edgeType),
    bpmnFlowType: typedString<BpmnFlowType>(raw.bpmn_flow_type || raw.bpmnFlowType, previous?.bpmnFlowType),
    bpmnSequenceFlowKind: typedString<BpmnSequenceFlowKind>(raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind, previous?.bpmnSequenceFlowKind),
  })
  const bpmnSemanticJson = normalizeBpmnSemantic(
    raw.bpmn_semantic_json || raw.bpmnSemanticJson || previous?.bpmnSemanticJson,
    edgeSemanticType(edgeProfile),
    raw.label ? String(raw.label) : previous?.label ?? '',
  )
  return {
    kind: 'BUSINESS_FLOW_EDGE',
    businessFlowId: base.businessFlowId,
    edgeId: stringValue(raw.id, previous?.edgeId ?? edgeKey),
    edgeKey,
    laneInstanceId: raw.lane_instance_id || raw.laneInstanceId
      ? String(raw.lane_instance_id || raw.laneInstanceId)
      : isCrossLane ? null : sourceLane ?? previous?.laneInstanceId ?? null,
    edgeType: stringValue(raw.edge_type || raw.edgeType, previous?.edgeType ?? (isCrossLane ? 'DEPENDENCY' : 'SEQUENCE')) as BusinessFlowEdgeRecord['edgeType'],
    bpmnFlowType: raw.bpmn_flow_type || raw.bpmnFlowType
      ? String(raw.bpmn_flow_type || raw.bpmnFlowType) as BusinessFlowEdgeRecord['bpmnFlowType']
      : previous?.bpmnFlowType ?? null,
    bpmnSequenceFlowKind: raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind
      ? String(raw.bpmn_sequence_flow_kind || raw.bpmnSequenceFlowKind) as BusinessFlowEdgeRecord['bpmnSequenceFlowKind']
      : previous?.bpmnSequenceFlowKind ?? null,
    label: bpmnSemanticDisplayName(
      bpmnSemanticJson,
      raw.label ? String(raw.label) : previous?.label ?? '',
    ) || null,
    bpmnSemanticJson,
    isCrossLane,
    sourceType: stringValue(raw.source_type || raw.sourceType, previous?.sourceType ?? 'NODE') as BusinessFlowEdgeRecord['sourceType'],
    sourceNodeKey,
    sourceLaneInstanceKey: raw.source_lane_instance_key || raw.sourceLaneInstanceKey
      ? String(raw.source_lane_instance_key || raw.sourceLaneInstanceKey)
      : previous?.sourceLaneInstanceKey ?? null,
    sourcePort: raw.source_port || raw.sourcePort ? String(raw.source_port || raw.sourcePort) : previous?.sourcePort ?? null,
    targetType: stringValue(raw.target_type || raw.targetType, previous?.targetType ?? 'NODE') as BusinessFlowEdgeRecord['targetType'],
    targetNodeKey,
    targetLaneInstanceKey: raw.target_lane_instance_key || raw.targetLaneInstanceKey
      ? String(raw.target_lane_instance_key || raw.targetLaneInstanceKey)
      : previous?.targetLaneInstanceKey ?? null,
    targetPort: raw.target_port || raw.targetPort ? String(raw.target_port || raw.targetPort) : previous?.targetPort ?? null,
    originComponentEdgeKey: raw.origin_component_edge_key || raw.originComponentEdgeKey
      ? String(raw.origin_component_edge_key || raw.originComponentEdgeKey)
      : previous?.originComponentEdgeKey ?? null,
    isOverridden: Boolean(raw.is_overridden ?? raw.isOverridden ?? previous?.isOverridden),
    styleJson: (raw.style_json || raw.styleJson || previous?.styleJson || {}) as Record<string, unknown>,
    propertiesJson: (raw.properties_json || raw.propertiesJson || previous?.propertiesJson || {}) as Record<string, unknown>,
    createdAt: previous?.createdAt ?? base.createdAt,
    updatedAt: timestamp,
  }
}

function patchToCanvasAndGraphPatch(
  doc: Y.Doc,
  base: LocalBusinessFlowCanvas,
  plan: BusinessFlowCollabPatchPlan,
): { canvas: LocalBusinessFlowCanvas; patch: BusinessFlowCanvasPatch } | { fallbackReason: string } {
  const laneDeletes = new Set<string>()
  const nodeDeletes = new Set<string>()
  const edgeDeletes = new Set<string>()
  const laneUpserts = new Set<string>()
  const nodeUpserts = new Set<string>()
  const edgeUpserts = new Set<string>()
  const erRefNodeKeys = new Set<string>()
  const materialEntries = plan.entries.filter((entry) => entry.kind !== 'meta')
  if (materialEntries.length === 0) {
    return {
      canvas: { ...base, updatedAt: new Date().toISOString() },
      patch: {},
    }
  }

  let nextCanvas: LocalBusinessFlowCanvas = {
    ...base,
    laneInstances: [...base.laneInstances],
    nodes: [...base.nodes],
    edges: [...base.edges],
    updatedAt: new Date().toISOString(),
  }

  const applyEntry = (entry: BusinessFlowCollabPatchEntry): string | null => {
    if (entry.kind === 'lane') {
      if (entry.action === 'delete') {
        laneDeletes.add(entry.key)
        nextCanvas = {
          ...nextCanvas,
          laneInstances: withoutKeys(nextCanvas.laneInstances, (lane) => lane.instanceKey, new Set([entry.key])),
        }
        return null
      }
      const lane = laneFromDocEntry(doc, nextCanvas, entry.key)
      if (!lane) return `missing-lane-record:${entry.key}`
      laneUpserts.add(entry.key)
      nextCanvas = {
        ...nextCanvas,
        laneInstances: replaceByKey(nextCanvas.laneInstances, (item) => item.instanceKey, entry.key, lane),
      }
      return null
    }
    if (entry.kind === 'node') {
      if (entry.action === 'delete') {
        nodeDeletes.add(entry.key)
        nextCanvas = {
          ...nextCanvas,
          nodes: withoutKeys(nextCanvas.nodes, (node) => node.nodeKey, new Set([entry.key])),
        }
        return null
      }
      const node = nodeFromDocEntry(doc, nextCanvas, nextCanvas.laneInstances, entry.key)
      if (!node) return `missing-node-record:${entry.key}`
      nodeUpserts.add(entry.key)
      nextCanvas = {
        ...nextCanvas,
        nodes: replaceByKey(nextCanvas.nodes, (item) => item.nodeKey, entry.key, node),
      }
      return null
    }
    if (entry.kind === 'edge') {
      if (entry.action === 'delete') {
        edgeDeletes.add(entry.key)
        nextCanvas = {
          ...nextCanvas,
          edges: withoutKeys(nextCanvas.edges, (edge) => edge.edgeKey, new Set([entry.key])),
        }
        return null
      }
      const edge = edgeFromDocEntry(doc, nextCanvas, nextCanvas.nodes, entry.key)
      if (!edge) return `missing-edge-record:${entry.key}`
      edgeUpserts.add(entry.key)
      nextCanvas = {
        ...nextCanvas,
        edges: replaceByKey(nextCanvas.edges, (item) => item.edgeKey, entry.key, edge),
      }
      return null
    }
    if (entry.kind === 'erRef' && entry.affectedNodeKey) {
      const node = nodeFromDocEntry(doc, nextCanvas, nextCanvas.laneInstances, entry.affectedNodeKey)
      if (!node) return entry.action === 'delete' ? null : `missing-er-ref-node:${entry.affectedNodeKey}`
      erRefNodeKeys.add(entry.affectedNodeKey)
      nextCanvas = {
        ...nextCanvas,
        nodes: replaceByKey(nextCanvas.nodes, (item) => item.nodeKey, entry.affectedNodeKey ?? '', node),
      }
    }
    return null
  }

  for (const entry of materialEntries) {
    const fallbackReason = applyEntry(entry)
    if (fallbackReason) return { fallbackReason }
  }

  const nodeKeys = new Set(nextCanvas.nodes.map((node) => node.nodeKey))
  const edgeKeys = new Set(nextCanvas.edges.map((edge) => edge.edgeKey))
  return {
    canvas: nextCanvas,
    patch: {
      laneUpserts: Array.from(laneUpserts),
      laneDeletes: Array.from(laneDeletes),
      nodeUpserts: Array.from(nodeUpserts).filter((key) => nodeKeys.has(key)),
      nodeDeletes: Array.from(nodeDeletes),
      edgeUpserts: Array.from(edgeUpserts).filter((key) => edgeKeys.has(key)),
      edgeDeletes: Array.from(edgeDeletes),
      erRefNodeKeys: Array.from(erRefNodeKeys).filter((key) => nodeKeys.has(key)),
    },
  }
}

function nextCanvasWithLane(base: LocalBusinessFlowCanvas, lane: LocalBusinessFlowCanvas['laneInstances'][number]) {
  return {
    ...base,
    laneInstances: replaceByKey(base.laneInstances, (item) => item.instanceKey, lane.instanceKey, lane),
    updatedAt: new Date().toISOString(),
  }
}

function nextCanvasWithNode(base: LocalBusinessFlowCanvas, node: BusinessFlowNodeRecord) {
  return {
    ...base,
    nodes: replaceByKey(base.nodes, (item) => item.nodeKey, node.nodeKey, node),
    updatedAt: new Date().toISOString(),
  }
}

function nextCanvasWithEdge(base: LocalBusinessFlowCanvas, edge: BusinessFlowEdgeRecord) {
  return {
    ...base,
    edges: replaceByKey(base.edges, (item) => item.edgeKey, edge.edgeKey, edge),
    updatedAt: new Date().toISOString(),
  }
}

function nextCanvasWithoutCells(base: LocalBusinessFlowCanvas, cells: Cell[]) {
  const nodeKeys = new Set<string>()
  const edgeKeys = new Set<string>()
  cells.forEach((cell) => {
    const data = readCellData(cell)
    if (data.cellRole === 'FLOW_EDGE') edgeKeys.add(data.edgeKey ?? cell.id)
    if (data.cellRole === 'FLOW_NODE') nodeKeys.add(data.nodeKey ?? cell.id)
  })
  return {
    ...base,
    nodes: withoutKeys(base.nodes, (node) => node.nodeKey, nodeKeys),
    edges: base.edges.filter((edge) => {
      if (edgeKeys.has(edge.edgeKey)) return false
      if (edge.sourceNodeKey && nodeKeys.has(edge.sourceNodeKey)) return false
      if (edge.targetNodeKey && nodeKeys.has(edge.targetNodeKey)) return false
      return true
    }),
    updatedAt: new Date().toISOString(),
  }
}

export function createBusinessFlowCollaboration(
  options: BusinessFlowCollaborationOptions,
): BusinessFlowCollaborationController {
  const doc = new Y.Doc()
  let connected = false
  let applying = false
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined
  const provider = new HocuspocusProvider({
    url: COLLAB_WS_URL,
    name: `business-flow:${options.businessFlowId}:r${options.collabRevision}`,
    document: doc,
    token: options.token,
  })

  const clearDisconnectTimer = () => {
    if (!disconnectTimer) return
    clearTimeout(disconnectTimer)
    disconnectTimer = undefined
  }

  const applyDocToGraph = (reason = 'full-apply') => {
    const base = options.getCanvas()
    if (!base) return null
    const nextCanvas = canvasFromDoc(doc, base)
    options.setApplyingRemote(true)
    try {
      if (import.meta.env.DEV) {
        console.debug('[business-flow-collab] full apply', { reason })
      }
      applyBusinessFlowCanvasToGraph(options.graph, nextCanvas)
      options.onRemoteApply(nextCanvas)
      return nextCanvas
    } finally {
      options.setApplyingRemote(false)
    }
  }

  const applyDocPatchToGraph = (transaction: Y.Transaction) => {
    const base = options.getCanvas()
    if (!base) return null
    if (!BUSINESS_FLOW_INCREMENTAL_COLLAB) {
      return applyDocToGraph('incremental-disabled')
    }
    const plan = compactBusinessFlowCollabPatchPlan(
      deriveBusinessFlowCollabPatchPlan(doc, transaction),
    )
    if (plan.fallbackReason) {
      return applyDocToGraph(plan.fallbackReason)
    }
    const materialized = patchToCanvasAndGraphPatch(doc, base, plan)
    if ('fallbackReason' in materialized) {
      return applyDocToGraph(materialized.fallbackReason)
    }
    options.setApplyingRemote(true)
    try {
      const result = applyBusinessFlowCanvasPatchToGraph(
        options.graph,
        materialized.canvas,
        materialized.patch,
      )
      if (!result.applied) {
        options.setApplyingRemote(false)
        return applyDocToGraph(result.reason)
      }
      options.onRemoteApply(materialized.canvas)
      return materialized.canvas
    } catch (error) {
      options.setApplyingRemote(false)
      return applyDocToGraph(error instanceof Error ? error.message : 'patch-apply-error')
    } finally {
      options.setApplyingRemote(false)
    }
  }

  const onRemoteChange = (transaction: Y.Transaction) => {
    if ((transaction.local && transaction.origin === LOCAL_ORIGIN) || applying) return
    applying = true
    try {
      applyDocPatchToGraph(transaction)
    } finally {
      applying = false
    }
  }

  doc.on('afterTransaction', onRemoteChange)

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'connected') {
      clearDisconnectTimer()
      connected = true
      options.onStatus('connected')
      return
    }
    if (disconnectTimer) return
    disconnectTimer = setTimeout(() => {
      disconnectTimer = undefined
      connected = false
      options.onStatus('disconnected')
    }, 1500)
  })

  provider.on('synced', ({ state }: { state: boolean }) => {
    if (!state) return
    clearDisconnectTimer()
    connected = true
    options.onStatus('connected')
    if (doc.getMap('lanes').size === 0 && options.getCanvas()?.laneInstances.length) {
      const canvas = options.getCanvas()
      if (canvas) writeCanvasToDoc(canvas, doc, LOCAL_ORIGIN)
      return
    }
    applyDocToGraph()
  })

  provider.on('connection-error', (payload: unknown) => {
    clearDisconnectTimer()
    connected = false
    options.onStatus('error')
    options.onError(`业务图协同连接失败：${JSON.stringify(payload)}`)
  })

  const updateAwareness = () => {
    if (!provider.awareness) return
    const states = Array.from(provider.awareness.getStates().entries())
    options.onAwareness(
      states
        .map(([clientId, state]) => {
          const raw = state as Record<string, unknown>
          return {
            clientId,
            isLocal: clientId === doc.clientID,
            user: mapObject(raw.user),
            target: raw.target as BusinessFlowPresenceTarget | null | undefined,
            activity: raw.activity as BusinessFlowPresenceActivity | undefined,
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
          }
        })
        .filter((state) => state.user.id || state.user.email || state.user.name) as BusinessFlowRemoteAwareness[],
    )
  }

  if (provider.awareness) {
    const userId = options.currentUser?.id || 'local'
    const hue = Math.abs(userId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % 360
    provider.awareness.setLocalStateField('user', {
      id: options.currentUser?.id,
      email: options.currentUser?.email,
      name: options.currentUser?.display_name || options.currentUser?.email,
      color: `hsl(${hue} 70% 45%)`,
    })
    provider.awareness.setLocalStateField('activity', 'connecting')
    provider.awareness.setLocalStateField('updatedAt', Date.now())
    provider.awareness.on('change', updateAwareness)
    updateAwareness()
  }

  const readDraft = () => {
    const previous = options.getCanvas()
    if (!previous) return null
    return draftCanvasFromGraph(options.graph, previous)
  }

  const pushDraft = (origin = LOCAL_ORIGIN) => {
    const draft = readDraft()
    if (!draft) return null
    writeCanvasToDoc(draft, doc, origin)
    return draft
  }

  options.onStatus('connecting')

  return {
    doc,
    provider,
    pushGraph(origin = LOCAL_ORIGIN) {
      return pushDraft(origin)
    },
    patchLane(node, origin = LOCAL_ORIGIN) {
      const previous = options.getCanvas()
      if (!previous) return null
      const lane = flowLaneRecordFromCell(node, previous)
      if (!lane) return pushDraft(origin)
      const nextCanvas = nextCanvasWithLane(previous, lane)
      doc.transact(() => {
        writeLaneToDoc(doc.getMap('lanes'), nextCanvas, lane)
        doc.getMap('meta').set('updatedAt', new Date().toISOString())
      }, origin)
      return nextCanvas
    },
    patchNode(node, origin = LOCAL_ORIGIN) {
      const previous = options.getCanvas()
      if (!previous) return null
      const flowNode = flowNodeRecordFromCell(node, previous)
      if (!flowNode) return pushDraft(origin)
      const nextCanvas = nextCanvasWithNode(previous, flowNode)
      const laneKeyById = new Map(nextCanvas.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
      doc.transact(() => {
        writeNodeToDoc(
          doc.getMap('nodes'),
          doc.getMap('erRefs'),
          laneKeyById,
          flowNode,
          previous.nodes.find((item) => item.nodeKey === flowNode.nodeKey),
        )
        doc.getMap('meta').set('updatedAt', new Date().toISOString())
      }, origin)
      return nextCanvas
    },
    patchEdge(edge, origin = LOCAL_ORIGIN) {
      const previous = options.getCanvas()
      if (!previous) return null
      const flowEdge = flowEdgeRecordFromCell(edge, previous)
      if (!flowEdge) return pushDraft(origin)
      const nextCanvas = nextCanvasWithEdge(previous, flowEdge)
      doc.transact(() => {
        writeEdgeToDoc(
          doc.getMap('edges'),
          flowEdge,
          previous.edges.find((item) => item.edgeKey === flowEdge.edgeKey),
        )
        doc.getMap('meta').set('updatedAt', new Date().toISOString())
      }, origin)
      return nextCanvas
    },
    removeCells(cells, origin = LOCAL_ORIGIN) {
      const previous = options.getCanvas()
      deleteCellsFromDoc(doc, cells, origin)
      return previous ? nextCanvasWithoutCells(previous, cells) : null
    },
    isRealtimeEnabled() {
      return connected
    },
    setLocalPresence(target, activity = target ? 'editing' : 'selecting') {
      if (!provider.awareness) return
      provider.awareness.setLocalStateField('target', target)
      provider.awareness.setLocalStateField('activity', target ? activity : undefined)
      provider.awareness.setLocalStateField('updatedAt', Date.now())
    },
    destroy() {
      clearDisconnectTimer()
      provider.awareness?.setLocalState(null)
      doc.off('afterTransaction', onRemoteChange)
      provider.awareness?.off('change', updateAwareness)
      provider.destroy()
      doc.destroy()
      connected = false
    },
  }
}
