import { authHeaders } from '@/entities/auth'
import { API_BASE, DEFAULT_GRAPH_ID, DEFAULT_PRODUCT_ID } from '@/shared/api/config'
import {
  mergeBpmnIntoProperties,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
} from '@/entities/business-flow/model/bpmn'
import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BusinessFlowEdgeRecord,
  BusinessFlowErRefType,
  BusinessFlowJson,
  BusinessFlowNodeType,
  CanvasPosition,
  LocalBusinessFlowCanvas,
  SwimlaneComponent,
  SwimlaneComponentEdge,
  SwimlaneComponentNode,
  SwimlaneComponentVersion,
} from '@/entities/business-flow/model/types'

export type BusinessFlowBinding = {
  binding_key: string
  step_key: string
  table_key?: string | null
  column_key?: string | null
  relation_key?: string | null
  usage_type?: string
  description?: string | null
}

export type BusinessFlowRecord = {
  graph_id: string
  flow_key: string
  name: string
  description?: string | null
  nodes: unknown[]
  edges: unknown[]
  bindings: BusinessFlowBinding[]
  version: number
}

export type BusinessFlowMeta = {
  id: string
  product_id: string
  product_code?: string | null
  product_name?: string | null
  code: string
  name: string
  description?: string | null
  status: BusinessFlowMetaStatus
  current_version: number
  updated_at?: string | null
  lane_instance_count: number
  node_count: number
  edge_count: number
  current_user_role?: BusinessFlowRole | null
}

export type BusinessFlowMetaStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type BusinessFlowRole = 'owner' | 'editor' | 'viewer'

export type BusinessFlowMember = {
  user_id: string
  email: string
  display_name: string
  role: BusinessFlowRole
  created_at: string
  is_creator?: boolean
}

export type BusinessFlowMemberUpsertBody = {
  email: string
  role: BusinessFlowRole
}

export type CreateBusinessFlowBody = {
  code: string
  name: string
  description?: string | null
  product_id?: string | null
}

export type UpdateBusinessFlowBody = {
  name?: string | null
  description?: string | null
  status?: BusinessFlowMetaStatus
}

type ApiSwimlaneComponentNode = {
  id: string
  component_version_id: string
  node_key: string
  node_type: BusinessFlowNodeType
  bpmn_element_type?: BpmnNodeProfile['bpmnElementType'] | null
  bpmn_event_kind?: BpmnNodeProfile['bpmnEventKind'] | null
  bpmn_event_definition?: BpmnNodeProfile['bpmnEventDefinition'] | null
  bpmn_task_type?: BpmnNodeProfile['bpmnTaskType'] | null
  bpmn_gateway_type?: BpmnNodeProfile['bpmnGatewayType'] | null
  bpmn_subprocess_kind?: BpmnNodeProfile['bpmnSubProcessKind'] | null
  bpmn_call_activity_ref?: string | null
  title: string
  description?: string | null
  actor?: string | null
  business_rule?: string | null
  input_summary?: string | null
  output_summary?: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  er_refs?: Array<{
    id?: string
    er_diagram_id: string
    er_table_key: string
    er_column_key?: string | null
    ref_type: BusinessFlowErRefType
    description?: string | null
  }>
  style_json?: BusinessFlowJson | null
  properties_json?: BusinessFlowJson | null
}

type ApiSwimlaneComponentEdge = {
  id: string
  component_version_id: string
  edge_key: string
  source_node_key: string
  target_node_key: string
  source_port?: string | null
  target_port?: string | null
  edge_type: SwimlaneComponentEdge['edgeType']
  bpmn_flow_type?: BpmnEdgeProfile['bpmnFlowType'] | null
  bpmn_sequence_flow_kind?: BpmnEdgeProfile['bpmnSequenceFlowKind'] | null
  bpmn_message_name?: string | null
  bpmn_condition_expression?: string | null
  label?: string | null
  condition_text?: string | null
  data_contract_json?: BusinessFlowJson | null
  style_json?: BusinessFlowJson | null
  properties_json?: BusinessFlowJson | null
}

type ApiSwimlaneComponentVersion = {
  id: string
  component_id: string
  version_no: number
  version_name?: string | null
  status: SwimlaneComponentVersion['status']
  canvas_json?: BusinessFlowJson | null
  semantic_json?: BusinessFlowJson | null
  thumbnail_url?: string | null
  checksum?: string | null
  created_at: string
  published_at?: string | null
  nodes: ApiSwimlaneComponentNode[]
  edges: ApiSwimlaneComponentEdge[]
}

type ApiSwimlaneComponent = {
  id: string
  product_id: string
  code: string
  name: string
  category?: string | null
  owner_role?: string | null
  description?: string | null
  status: SwimlaneComponent['status']
  current_version_no: number
  created_at: string
  updated_at: string
  versions: ApiSwimlaneComponentVersion[]
}

export type SaveSwimlaneComponentVersionBody = {
  name?: string | null
  category?: string | null
  ownerRole?: string | null
  description?: string | null
  canvasJson?: BusinessFlowJson | null
  semanticJson?: BusinessFlowJson | null
  thumbnailUrl?: string | null
	  nodes: Array<{
	    nodeKey: string
	    nodeType: BusinessFlowNodeType
	    bpmnElementType?: BpmnNodeProfile['bpmnElementType'] | null
	    bpmnEventKind?: BpmnNodeProfile['bpmnEventKind'] | null
	    bpmnEventDefinition?: BpmnNodeProfile['bpmnEventDefinition'] | null
	    bpmnTaskType?: BpmnNodeProfile['bpmnTaskType'] | null
	    bpmnGatewayType?: BpmnNodeProfile['bpmnGatewayType'] | null
	    bpmnSubProcessKind?: BpmnNodeProfile['bpmnSubProcessKind'] | null
	    bpmnCallActivityRef?: string | null
	    title: string
	    description?: string | null
	    actor?: string | null
	    businessRule?: string | null
	    inputSummary?: string | null
	    outputSummary?: string | null
	    position: CanvasPosition
    size: { width: number; height: number }
    erRefs?: Array<{
      id?: string
      erDiagramId: string
      erTableKey: string
      erColumnKey?: string | null
      refType: BusinessFlowErRefType
      description?: string | null
    }>
    styleJson?: BusinessFlowJson | null
    propertiesJson?: BusinessFlowJson | null
  }>
  edges: Array<{
    edgeKey: string
    sourceNodeKey: string
    targetNodeKey: string
	    sourcePort?: string | null
	    targetPort?: string | null
	    edgeType: SwimlaneComponentEdge['edgeType']
	    bpmnFlowType?: BpmnEdgeProfile['bpmnFlowType'] | null
	    bpmnSequenceFlowKind?: BpmnEdgeProfile['bpmnSequenceFlowKind'] | null
	    bpmnMessageName?: string | null
	    bpmnConditionExpression?: string | null
	    label?: string | null
	    conditionText?: string | null
	    dataContractJson?: BusinessFlowJson | null
	    styleJson?: BusinessFlowJson | null
    propertiesJson?: BusinessFlowJson | null
  }>
}

export type BusinessFlowChangeOpBody = {
  opType: string
  targetType: 'LANE_INSTANCE' | 'NODE' | 'EDGE' | 'ER_REF' | 'CANVAS'
  targetKey: string
  patch?: BusinessFlowJson
  inversePatch?: BusinessFlowJson
  summary?: string | null
}

export type BusinessFlowHistoryItem = {
  version: number
  baseVersion: number
  source: string
  summary?: string | null
  createdBy?: string | null
  createdAt: string
  ops: Array<{
    opType: string
    targetType: string
    targetKey: string
    summary?: string | null
  }>
}

type ApiBusinessFlowLaneInstance = {
  id: string
  instance_key: string
  component_id: string
  component_version_id: string
  component_name?: string | null
  component_version_no?: number | null
  display_name: string
  owner_role?: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  z_index: number
  is_overridden?: boolean
  layout_json?: BusinessFlowJson | null
  override_json?: BusinessFlowJson | null
}

type ApiBusinessFlowNode = {
  id: string
  lane_instance_id?: string | null
  node_key: string
  origin_component_node_key?: string | null
  node_type: BusinessFlowNodeType
  bpmn_element_type?: BpmnNodeProfile['bpmnElementType'] | null
  bpmn_event_kind?: BpmnNodeProfile['bpmnEventKind'] | null
  bpmn_event_definition?: BpmnNodeProfile['bpmnEventDefinition'] | null
  bpmn_task_type?: BpmnNodeProfile['bpmnTaskType'] | null
  bpmn_gateway_type?: BpmnNodeProfile['bpmnGatewayType'] | null
  bpmn_subprocess_kind?: BpmnNodeProfile['bpmnSubProcessKind'] | null
  bpmn_call_activity_ref?: string | null
  title: string
  description?: string | null
  actor?: string | null
  business_rule?: string | null
  input_summary?: string | null
  output_summary?: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  is_overridden: boolean
  er_refs?: Array<{
    id: string
    er_diagram_id: string
    er_table_key: string
    er_column_key?: string | null
    ref_type: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECK'
    description?: string | null
  }>
  style_json?: BusinessFlowJson | null
  properties_json?: BusinessFlowJson | null
}

type ApiBusinessFlowEdge = {
  id: string
  lane_instance_id?: string | null
  edge_key: string
  source_type: 'NODE' | 'LANE'
  source_node_id?: string | null
  source_node_key?: string | null
  source_lane_instance_id?: string | null
  source_lane_instance_key?: string | null
  source_port?: string | null
  target_type: 'NODE' | 'LANE'
  target_node_id?: string | null
  target_node_key?: string | null
  target_lane_instance_id?: string | null
  target_lane_instance_key?: string | null
  target_port?: string | null
  edge_type: BusinessFlowEdgeRecord['edgeType']
  bpmn_flow_type?: BpmnEdgeProfile['bpmnFlowType'] | null
  bpmn_sequence_flow_kind?: BpmnEdgeProfile['bpmnSequenceFlowKind'] | null
  bpmn_message_name?: string | null
  bpmn_condition_expression?: string | null
  label?: string | null
  condition_text?: string | null
  data_contract_json?: BusinessFlowJson | null
  origin_component_edge_key?: string | null
  is_overridden: boolean
  style_json?: BusinessFlowJson | null
  properties_json?: BusinessFlowJson | null
}

type ApiBusinessFlowEditorState = {
  business_flow_id: string
  current_version: number
  collab_revision?: number
  lane_instances: ApiBusinessFlowLaneInstance[]
  nodes: ApiBusinessFlowNode[]
  edges: ApiBusinessFlowEdge[]
}

async function apiErrorMessage(res: Response) {
  const text = await res.text()
  try {
    const data = JSON.parse(text) as { detail?: unknown }
    if (typeof data.detail === 'string') return data.detail
  } catch {
    // keep raw text fallback
  }
  return text || `${res.status} ${res.statusText}`
}

function normalizeSwimlaneComponentNode(node: ApiSwimlaneComponentNode): SwimlaneComponentNode {
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType: node.node_type,
    bpmnElementType: node.bpmn_element_type,
    bpmnEventKind: node.bpmn_event_kind,
    bpmnEventDefinition: node.bpmn_event_definition,
    bpmnTaskType: node.bpmn_task_type,
    bpmnGatewayType: node.bpmn_gateway_type,
    bpmnSubProcessKind: node.bpmn_subprocess_kind,
    bpmnCallActivityRef: node.bpmn_call_activity_ref,
    propertiesJson: node.properties_json,
  })
  return {
    id: node.id,
    componentVersionId: node.component_version_id,
    nodeKey: node.node_key,
    nodeType: node.node_type,
    ...bpmnProfile,
    title: node.title,
    description: node.description ?? null,
    actor: node.actor ?? null,
    businessRule: node.business_rule ?? null,
    inputSummary: node.input_summary ?? null,
    outputSummary: node.output_summary ?? null,
    position: { x: Number(node.position_x), y: Number(node.position_y) },
    size: { width: Number(node.width), height: Number(node.height) },
    erRefs: (node.er_refs ?? []).map((ref) => ({
      id: ref.id,
      erDiagramId: ref.er_diagram_id,
      erTableKey: ref.er_table_key,
      erColumnKey: ref.er_column_key ?? null,
      refType: ref.ref_type,
      description: ref.description ?? null,
    })),
    styleJson: node.style_json ?? null,
    propertiesJson: mergeBpmnIntoProperties(node.properties_json, bpmnProfile),
  }
}

function normalizeSwimlaneComponentEdge(edge: ApiSwimlaneComponentEdge): SwimlaneComponentEdge {
  const bpmnProfile = normalizeBpmnEdgeProfile({
    edgeType: edge.edge_type,
    bpmnFlowType: edge.bpmn_flow_type,
    bpmnSequenceFlowKind: edge.bpmn_sequence_flow_kind,
    bpmnMessageName: edge.bpmn_message_name,
    bpmnConditionExpression: edge.bpmn_condition_expression,
    propertiesJson: edge.properties_json,
  })
  return {
    id: edge.id,
    componentVersionId: edge.component_version_id,
    edgeKey: edge.edge_key,
    sourceNodeKey: edge.source_node_key,
    targetNodeKey: edge.target_node_key,
    sourcePort: edge.source_port ?? null,
    targetPort: edge.target_port ?? null,
    edgeType: edge.edge_type,
    ...bpmnProfile,
    label: edge.label ?? null,
    conditionText: edge.condition_text ?? null,
    dataContractJson: edge.data_contract_json ?? null,
    styleJson: edge.style_json ?? null,
    propertiesJson: mergeBpmnIntoProperties(edge.properties_json, bpmnProfile),
  }
}

function normalizeSwimlaneComponent(component: ApiSwimlaneComponent): SwimlaneComponent {
  return {
    id: component.id,
    productId: component.product_id,
    code: component.code,
    name: component.name,
    category: component.category ?? null,
    ownerRole: component.owner_role ?? null,
    description: component.description ?? null,
    status: component.status,
    currentVersionNo: component.current_version_no,
    createdAt: component.created_at,
    updatedAt: component.updated_at,
    versions: (component.versions ?? []).map((version) => ({
      id: version.id,
      componentId: version.component_id,
      versionNo: version.version_no,
      versionName: version.version_name ?? null,
      status: version.status,
      canvasJson: version.canvas_json ?? null,
      semanticJson: version.semantic_json ?? null,
      thumbnailUrl: version.thumbnail_url ?? null,
      checksum: version.checksum ?? null,
      createdAt: version.created_at,
      publishedAt: version.published_at ?? null,
      nodes: (version.nodes ?? []).map(normalizeSwimlaneComponentNode),
      edges: (version.edges ?? []).map(normalizeSwimlaneComponentEdge),
    })),
  }
}

function denormalizeSwimlaneVersionBody(body: SaveSwimlaneComponentVersionBody) {
  return {
    name: body.name,
    category: body.category,
    owner_role: body.ownerRole,
    description: body.description,
    canvas_json: body.canvasJson ?? {},
    semantic_json: body.semanticJson ?? {},
    thumbnail_url: body.thumbnailUrl,
    nodes: body.nodes.map((node) => {
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
      return {
        node_key: node.nodeKey,
        node_type: node.nodeType,
        bpmn_element_type: bpmnProfile.bpmnElementType,
        bpmn_event_kind: bpmnProfile.bpmnEventKind,
        bpmn_event_definition: bpmnProfile.bpmnEventDefinition,
        bpmn_task_type: bpmnProfile.bpmnTaskType,
        bpmn_gateway_type: bpmnProfile.bpmnGatewayType,
        bpmn_subprocess_kind: bpmnProfile.bpmnSubProcessKind,
        bpmn_call_activity_ref: bpmnProfile.bpmnCallActivityRef,
        title: node.title,
        description: node.description,
        actor: node.actor,
        business_rule: node.businessRule,
        input_summary: node.inputSummary,
        output_summary: node.outputSummary,
        position_x: node.position.x,
        position_y: node.position.y,
        width: node.size.width,
        height: node.size.height,
        er_refs: (node.erRefs ?? []).map((ref) => ({
          id: ref.id,
          er_diagram_id: ref.erDiagramId,
          er_table_key: ref.erTableKey,
          er_column_key: ref.erColumnKey ?? null,
          ref_type: ref.refType,
          description: ref.description ?? null,
        })),
        style_json: node.styleJson ?? {},
        properties_json: mergeBpmnIntoProperties(node.propertiesJson, bpmnProfile),
      }
    }),
    edges: body.edges.map((edge) => {
      const bpmnProfile = normalizeBpmnEdgeProfile({
        edgeType: edge.edgeType,
        bpmnFlowType: edge.bpmnFlowType,
        bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
        bpmnMessageName: edge.bpmnMessageName,
        bpmnConditionExpression: edge.bpmnConditionExpression,
        propertiesJson: edge.propertiesJson,
      })
      return {
        edge_key: edge.edgeKey,
        source_node_key: edge.sourceNodeKey,
        target_node_key: edge.targetNodeKey,
        source_port: edge.sourcePort,
        target_port: edge.targetPort,
        edge_type: edge.edgeType,
        bpmn_flow_type: bpmnProfile.bpmnFlowType,
        bpmn_sequence_flow_kind: bpmnProfile.bpmnSequenceFlowKind,
        bpmn_message_name: bpmnProfile.bpmnMessageName,
        bpmn_condition_expression: bpmnProfile.bpmnConditionExpression,
        label: edge.label,
        condition_text: edge.conditionText,
        data_contract_json: edge.dataContractJson ?? {},
        style_json: edge.styleJson ?? {},
        properties_json: mergeBpmnIntoProperties(edge.propertiesJson, bpmnProfile),
      }
    }),
  }
}

function normalizeBusinessFlowEditorState(
  state: ApiBusinessFlowEditorState,
  meta?: Pick<BusinessFlowMeta, 'name' | 'code' | 'description'> | null,
): LocalBusinessFlowCanvas {
  const laneKeyById = new Map(state.lane_instances.map((lane) => [lane.id, lane.instance_key]))
  return {
    businessFlowId: state.business_flow_id,
    name: meta?.name ?? state.business_flow_id,
    code: meta?.code ?? null,
    description: meta?.description ?? null,
    version: state.current_version,
    collabRevision: state.collab_revision ?? 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    laneInstances: state.lane_instances.map((lane) => ({
      kind: 'LANE_INSTANCE',
      businessFlowId: state.business_flow_id,
      laneInstanceId: lane.id,
      instanceKey: lane.instance_key,
      componentId: lane.component_id,
      componentVersionId: lane.component_version_id,
      componentName: lane.component_name ?? lane.display_name,
      componentVersionNo: lane.component_version_no ?? 1,
      displayName: lane.display_name,
      ownerRole: lane.owner_role ?? null,
      isOverridden: Boolean(lane.is_overridden),
      position: { x: Number(lane.position_x), y: Number(lane.position_y) },
      size: { width: Number(lane.width), height: Number(lane.height) },
      zIndex: Number(lane.z_index),
      layoutJson: lane.layout_json ?? null,
      overrideJson: lane.override_json ?? null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    nodes: state.nodes.map((node) => {
      const bpmnProfile = normalizeBpmnNodeProfile({
        nodeType: node.node_type,
        bpmnElementType: node.bpmn_element_type,
        bpmnEventKind: node.bpmn_event_kind,
        bpmnEventDefinition: node.bpmn_event_definition,
        bpmnTaskType: node.bpmn_task_type,
        bpmnGatewayType: node.bpmn_gateway_type,
        bpmnSubProcessKind: node.bpmn_subprocess_kind,
        bpmnCallActivityRef: node.bpmn_call_activity_ref,
        propertiesJson: node.properties_json,
      })
      return {
        kind: 'BUSINESS_FLOW_NODE',
        businessFlowId: state.business_flow_id,
        nodeId: node.id,
        nodeKey: node.node_key,
        laneInstanceId: node.lane_instance_id ?? '',
        originComponentNodeKey: node.origin_component_node_key ?? null,
        nodeType: node.node_type,
        ...bpmnProfile,
        title: node.title,
        description: node.description ?? null,
        actor: node.actor ?? null,
        businessRule: node.business_rule ?? null,
        erRefs: (node.er_refs ?? []).map((ref) => ({
          id: ref.id,
          erDiagramId: ref.er_diagram_id,
          erTableKey: ref.er_table_key,
          erColumnKey: ref.er_column_key ?? null,
          refType: ref.ref_type,
          description: ref.description ?? null,
        })),
        position: { x: Number(node.position_x), y: Number(node.position_y) },
        size: { width: Number(node.width), height: Number(node.height) },
        inputSummary: node.input_summary ?? null,
        outputSummary: node.output_summary ?? null,
        isOverridden: Boolean(node.is_overridden),
        styleJson: node.style_json ?? null,
        propertiesJson: mergeBpmnIntoProperties(node.properties_json, bpmnProfile),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }),
    edges: state.edges.map((edge) => {
      const sourceLaneId =
        edge.source_lane_instance_id ??
        (edge.source_node_key
          ? state.nodes.find((node) => node.node_key === edge.source_node_key)?.lane_instance_id
          : null)
      const targetLaneId =
        edge.target_lane_instance_id ??
        (edge.target_node_key
          ? state.nodes.find((node) => node.node_key === edge.target_node_key)?.lane_instance_id
          : null)
      const sourceLaneKey = sourceLaneId ? laneKeyById.get(sourceLaneId) ?? null : null
      const targetLaneKey = targetLaneId ? laneKeyById.get(targetLaneId) ?? null : null
      const isCrossLane = Boolean(sourceLaneKey && targetLaneKey && sourceLaneKey !== targetLaneKey)
      const bpmnProfile = normalizeBpmnEdgeProfile({
        edgeType: edge.edge_type,
        bpmnFlowType: edge.bpmn_flow_type,
        bpmnSequenceFlowKind: edge.bpmn_sequence_flow_kind,
        bpmnMessageName: edge.bpmn_message_name,
        bpmnConditionExpression: edge.bpmn_condition_expression,
        propertiesJson: edge.properties_json,
        isCrossLane,
      })
      return {
        kind: 'BUSINESS_FLOW_EDGE',
        businessFlowId: state.business_flow_id,
        edgeId: edge.id,
        edgeKey: edge.edge_key,
        laneInstanceId: edge.lane_instance_id ?? null,
        edgeType: edge.edge_type,
        ...bpmnProfile,
        label: edge.label ?? null,
        conditionText: edge.condition_text ?? null,
        dataContract: edge.data_contract_json as BusinessFlowEdgeRecord['dataContract'],
        isCrossLane,
        sourceType: edge.source_type,
        sourceNodeKey: edge.source_node_key ?? null,
        sourceLaneInstanceKey:
          edge.source_lane_instance_key ??
          (edge.source_lane_instance_id ? laneKeyById.get(edge.source_lane_instance_id) ?? null : sourceLaneKey),
        sourcePort: edge.source_port ?? null,
        targetType: edge.target_type,
        targetNodeKey: edge.target_node_key ?? null,
        targetLaneInstanceKey:
          edge.target_lane_instance_key ??
          (edge.target_lane_instance_id ? laneKeyById.get(edge.target_lane_instance_id) ?? null : targetLaneKey),
        targetPort: edge.target_port ?? null,
        originComponentEdgeKey: edge.origin_component_edge_key ?? null,
        isOverridden: Boolean(edge.is_overridden),
        styleJson: edge.style_json ?? null,
        propertiesJson: mergeBpmnIntoProperties(edge.properties_json, bpmnProfile),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }),
  }
}

export async function listBusinessFlows(graphId = DEFAULT_GRAPH_ID): Promise<BusinessFlowRecord[]> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { flows: BusinessFlowRecord[] }
  return data.flows
}

export async function saveBusinessFlow(
  graphId: string,
  flowKey: string,
  body: Omit<BusinessFlowRecord, 'graph_id' | 'flow_key' | 'version'>,
): Promise<BusinessFlowRecord> {
  const res = await fetch(`${API_BASE}/api/graphs/${graphId}/business-flows/${flowKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ flow_key: flowKey, ...body }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<BusinessFlowRecord>
}

export async function listBusinessFlowMetas(
  productId?: string | null,
  signal?: AbortSignal,
): Promise<BusinessFlowMeta[]> {
  const params = new URLSearchParams()
  if (productId && productId !== 'all') params.set('product_id', productId)
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/api/business-flows${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeaders() },
    signal,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta[]>
}

export async function createBusinessFlow(
  body: CreateBusinessFlowBody,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ product_id: body.product_id ?? DEFAULT_PRODUCT_ID, ...body }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function updateBusinessFlow(
  businessFlowId: string,
  body: UpdateBusinessFlowBody,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function archiveBusinessFlow(
  businessFlowId: string,
): Promise<BusinessFlowMeta> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMeta>
}

export async function fetchBusinessFlowMembers(
  businessFlowId: string,
): Promise<BusinessFlowMember[]> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const message = await apiErrorMessage(res)
    if (res.status === 404) {
      throw new Error(`业务图成员接口不可用或业务图不存在：${message}`)
    }
    throw new Error(message)
  }
  return res.json() as Promise<BusinessFlowMember[]>
}

export async function upsertBusinessFlowMember(
  businessFlowId: string,
  body: BusinessFlowMemberUpsertBody,
): Promise<BusinessFlowMember> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMember>
}

export async function removeBusinessFlowMember(
  businessFlowId: string,
  userId: string,
): Promise<BusinessFlowMember> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/members/${userId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() as Promise<BusinessFlowMember>
}

export async function listSwimlaneComponentsApi(
  productId?: string | null,
  status?: SwimlaneComponent['status'] | null,
  signal?: AbortSignal,
): Promise<SwimlaneComponent[]> {
  if (productId === 'none') return []
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const qs = params.toString()
  const path =
    productId && productId !== 'all'
      ? `/api/products/${productId}/swimlane-components`
      : '/api/swimlane-components'
  const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeaders() },
    signal,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return ((await res.json()) as ApiSwimlaneComponent[]).map(normalizeSwimlaneComponent)
}

export async function createSwimlaneComponentApi(body: {
  productId: string
  code: string
  name: string
  category?: string | null
  ownerRole?: string | null
  description?: string | null
}): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/products/${body.productId}/swimlane-components`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      product_id: body.productId,
      code: body.code,
      name: body.name,
      category: body.category,
      owner_role: body.ownerRole,
      description: body.description,
    }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function fetchSwimlaneComponentApi(
  componentId: string,
  signal?: AbortSignal,
): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/swimlane-components/${componentId}`, {
    headers: { ...authHeaders() },
    signal,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function updateSwimlaneComponentApi(
  componentId: string,
  body: {
    code?: string | null
    name?: string | null
    category?: string | null
    ownerRole?: string | null
    description?: string | null
    status?: SwimlaneComponent['status']
  },
): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/swimlane-components/${componentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      code: body.code,
      name: body.name,
      category: body.category,
      owner_role: body.ownerRole,
      description: body.description,
      status: body.status,
    }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function archiveSwimlaneComponentApi(
  componentId: string,
): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/swimlane-components/${componentId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function saveSwimlaneComponentDraftVersionApi(
  componentId: string,
  body: SaveSwimlaneComponentVersionBody,
): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/swimlane-components/${componentId}/draft-version`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(denormalizeSwimlaneVersionBody(body)),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function publishSwimlaneComponentVersionApi(
  componentId: string,
  body?: SaveSwimlaneComponentVersionBody,
): Promise<SwimlaneComponent> {
  const res = await fetch(`${API_BASE}/api/swimlane-components/${componentId}/versions/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(denormalizeSwimlaneVersionBody(body)) : undefined,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeSwimlaneComponent((await res.json()) as ApiSwimlaneComponent)
}

export async function fetchBusinessFlowEditorState(
  businessFlowId: string,
  meta?: Pick<BusinessFlowMeta, 'name' | 'code' | 'description'> | null,
  signal?: AbortSignal,
): Promise<LocalBusinessFlowCanvas> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/editor-state`, {
    headers: { ...authHeaders() },
    signal,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return normalizeBusinessFlowEditorState((await res.json()) as ApiBusinessFlowEditorState, meta)
}

export async function placeSwimlaneComponentApi(
  businessFlowId: string,
  componentVersionId: string,
  position: CanvasPosition,
): Promise<LocalBusinessFlowCanvas> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/lane-instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      component_version_id: componentVersionId,
      position,
    }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return fetchBusinessFlowEditorState(businessFlowId)
}

export async function applyBusinessFlowChanges(
  businessFlowId: string,
  baseVersion: number,
  ops: BusinessFlowChangeOpBody[],
): Promise<{ newVersion: number; summary: string }> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/changes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      base_version: baseVersion,
      ops: ops.map((op) => ({
        op_type: op.opType,
        target_type: op.targetType,
        target_key: op.targetKey,
        patch: op.patch ?? {},
        inverse_patch: op.inversePatch ?? {},
        summary: op.summary,
      })),
    }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  const data = (await res.json()) as { new_version: number; summary: string }
  return { newVersion: data.new_version, summary: data.summary }
}

export async function fetchBusinessFlowHistory(
  businessFlowId: string,
): Promise<BusinessFlowHistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/history`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return ((await res.json()) as Array<{
    version: number
    base_version: number
    source: string
    summary?: string | null
    created_by?: string | null
    created_at: string
    ops: Array<{ op_type: string; target_type: string; target_key: string; summary?: string | null }>
  }>).map((item) => ({
    version: item.version,
    baseVersion: item.base_version,
    source: item.source,
    summary: item.summary,
    createdBy: item.created_by,
    createdAt: item.created_at,
    ops: item.ops.map((op) => ({
      opType: op.op_type,
      targetType: op.target_type,
      targetKey: op.target_key,
      summary: op.summary,
    })),
  }))
}

export async function restoreBusinessFlowVersion(
  businessFlowId: string,
  targetVersion: number,
): Promise<LocalBusinessFlowCanvas> {
  const res = await fetch(`${API_BASE}/api/business-flows/${businessFlowId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ target_version: targetVersion }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return fetchBusinessFlowEditorState(businessFlowId)
}
