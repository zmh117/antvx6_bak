import { HocuspocusProvider } from '@hocuspocus/provider'
import { Edge, Graph, Node, type Cell } from '@antv/x6'
import * as Y from 'yjs'

import type {
  BusinessFlowEdgeRecord,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  BusinessFlowNodeType,
  LocalBusinessFlowCanvas,
} from '@/entities/business-flow'
import {
  applyBusinessFlowCanvasToGraph,
  flowDraftFromGraph,
  readCellData,
} from '@/features/business-flow/infrastructure/x6/businessFlowX6'
import { COLLAB_WS_URL } from '@/shared/api/config'

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
  if (value instanceof Y.Map) return Object.fromEntries(value.entries())
  return typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
}

function clearMap(map: Y.Map<unknown>) {
  Array.from(map.keys()).forEach((key) => map.delete(key))
}

function setMapObject(root: Y.Map<unknown>, key: string, value: Record<string, unknown>) {
  const child = new Y.Map()
  Object.entries(value).forEach(([k, v]) => {
    if (v !== undefined) child.set(k, v)
  })
  root.set(key, child)
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value ? value : fallback
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
) {
  const laneInstanceKey = laneKeyById.get(node.laneInstanceId) ?? null
  setMapObject(nodes, node.nodeKey, {
    id: node.nodeId,
    lane_instance_id: node.laneInstanceId,
    lane_instance_key: laneInstanceKey,
    node_key: node.nodeKey,
    origin_component_node_key: node.originComponentNodeKey ?? null,
    node_type: node.nodeType,
    title: node.title,
    description: node.description ?? null,
    actor: node.actor ?? null,
    business_rule: node.businessRule ?? null,
    input_summary: node.inputSummary ?? null,
    output_summary: node.outputSummary ?? null,
    position_x: node.position.x,
    position_y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    is_overridden: node.isOverridden,
    style_json: node.styleJson ?? {},
    properties_json: node.propertiesJson ?? {},
  })
  Array.from(erRefs.keys()).forEach((key) => {
    const ref = mapObject(erRefs.get(key))
    if ((ref.node_key || ref.nodeKey) === node.nodeKey) erRefs.delete(key)
  })
  ;(node.erRefs ?? []).forEach((ref) => {
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

function writeEdgeToDoc(edges: Y.Map<unknown>, edge: BusinessFlowEdgeRecord) {
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
    label: edge.label ?? null,
    condition_text: edge.conditionText ?? null,
    data_contract_json: edge.dataContract ?? {},
    origin_component_edge_key: edge.originComponentEdgeKey ?? null,
    is_overridden: edge.isOverridden,
    style_json: edge.styleJson ?? {},
    properties_json: edge.propertiesJson ?? {},
  })
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
    meta.set('schemaVersion', 1)
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
      title: stringValue(raw.title, '任务'),
      description: raw.description ? String(raw.description) : null,
      actor: raw.actor ? String(raw.actor) : null,
      businessRule: raw.business_rule || raw.businessRule
        ? String(raw.business_rule || raw.businessRule)
        : null,
      erRefs: refsByNodeKey.get(nodeKey) ?? [],
      position: {
        x: numberValue(raw.position_x ?? raw.x),
        y: numberValue(raw.position_y ?? raw.y),
      },
      size: {
        width: numberValue(raw.width, 120),
        height: numberValue(raw.height, 60),
      },
      inputSummary: raw.input_summary || raw.inputSummary ? String(raw.input_summary || raw.inputSummary) : null,
      outputSummary: raw.output_summary || raw.outputSummary ? String(raw.output_summary || raw.outputSummary) : null,
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
    return {
      kind: 'BUSINESS_FLOW_EDGE' as const,
      businessFlowId: base.businessFlowId,
      edgeId: stringValue(raw.id, edgeKey),
      edgeKey,
      laneInstanceId: raw.lane_instance_id || raw.laneInstanceId
        ? String(raw.lane_instance_id || raw.laneInstanceId)
        : isCrossLane ? null : sourceLane ?? null,
      edgeType: stringValue(raw.edge_type || raw.edgeType, isCrossLane ? 'DEPENDENCY' : 'SEQUENCE') as BusinessFlowEdgeRecord['edgeType'],
      label: raw.label ? String(raw.label) : null,
      conditionText: raw.condition_text || raw.conditionText ? String(raw.condition_text || raw.conditionText) : null,
      dataContract: undefined,
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

function writePatchFromDraft(
  doc: Y.Doc,
  draft: LocalBusinessFlowCanvas,
  kind: 'lane' | 'node' | 'edge',
  key: string,
  origin = LOCAL_ORIGIN,
) {
  const lanes = doc.getMap('lanes')
  const nodes = doc.getMap('nodes')
  const edges = doc.getMap('edges')
  const erRefs = doc.getMap('erRefs')
  const laneKeyById = new Map(draft.laneInstances.map((lane) => [lane.laneInstanceId, lane.instanceKey]))
  doc.transact(() => {
    if (kind === 'lane') {
      const lane = draft.laneInstances.find((item) => item.instanceKey === key)
      if (lane) writeLaneToDoc(lanes, draft, lane)
    } else if (kind === 'node') {
      const node = draft.nodes.find((item) => item.nodeKey === key)
      if (node) writeNodeToDoc(nodes, erRefs, laneKeyById, node)
    } else {
      const edge = draft.edges.find((item) => item.edgeKey === key)
      if (edge) writeEdgeToDoc(edges, edge)
    }
    doc.getMap('meta').set('updatedAt', new Date().toISOString())
  }, origin)
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

  const applyDocToGraph = () => {
    const base = options.getCanvas()
    if (!base) return null
    const nextCanvas = canvasFromDoc(doc, base)
    options.setApplyingRemote(true)
    try {
      applyBusinessFlowCanvasToGraph(options.graph, nextCanvas)
      options.onRemoteApply(nextCanvas)
      return nextCanvas
    } finally {
      options.setApplyingRemote(false)
    }
  }

  const onRemoteChange = (transaction: Y.Transaction) => {
    if ((transaction.local && transaction.origin === LOCAL_ORIGIN) || applying) return
    applying = true
    try {
      applyDocToGraph()
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
      const draft = readDraft()
      if (!draft) return null
      writePatchFromDraft(doc, draft, 'lane', node.id, origin)
      return draft
    },
    patchNode(node, origin = LOCAL_ORIGIN) {
      const draft = readDraft()
      if (!draft) return null
      writePatchFromDraft(doc, draft, 'node', readCellData(node).nodeKey ?? node.id, origin)
      return draft
    },
    patchEdge(edge, origin = LOCAL_ORIGIN) {
      const draft = readDraft()
      if (!draft) return null
      writePatchFromDraft(doc, draft, 'edge', readCellData(edge).edgeKey ?? edge.id, origin)
      return draft
    },
    removeCells(cells, origin = LOCAL_ORIGIN) {
      const draft = readDraft()
      if (!draft) {
        deleteCellsFromDoc(doc, cells, origin)
        return null
      }
      writeCanvasToDoc(draft, doc, origin)
      return draft
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
