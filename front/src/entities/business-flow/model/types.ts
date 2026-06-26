export type SwimlaneComponentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type SwimlaneComponentVersionStatus = 'DRAFT' | 'PUBLISHED'
export type BusinessFlowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type BusinessFlowDomainRole = 'owner' | 'editor' | 'viewer'
export type LaneInstanceStatus = 'ACTIVE' | 'REMOVED'

export type BusinessFlowNodeType =
  | 'START'
  | 'END'
  | 'TASK'
  | 'EVENT'
  | 'GATEWAY'
  | 'SUB_PROCESS'
  | 'CALL_ACTIVITY'
  | 'DATA_OBJECT'
  | 'DATA_INPUT'
  | 'DATA_OUTPUT'
  | 'DATA_STORE'

export type BusinessFlowEdgeEndpointType = 'NODE' | 'LANE'

export type BusinessFlowEdgeType =
  | 'SEQUENCE'
  | 'MESSAGE'
  | 'ASSOCIATION'
  | 'TRIGGER'
  | 'DATA_FLOW'
  | 'CALL'
  | 'DEPENDENCY'
  | 'EXCEPTION'

export type BusinessFlowErRefType = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECK'

export type BusinessFlowJson = Record<string, unknown>

export type BpmnElementType =
  | 'EVENT'
  | 'TASK'
  | 'GATEWAY'
  | 'SUB_PROCESS'
  | 'CALL_ACTIVITY'
  | 'DATA_OBJECT'
  | 'DATA_INPUT'
  | 'DATA_OUTPUT'
  | 'DATA_STORE'

export type BpmnEventKind = 'START' | 'INTERMEDIATE' | 'END'
export type BpmnEventDefinition = 'NONE'
export type BpmnTaskType = 'NONE'
export type BpmnGatewayType =
  | 'EXCLUSIVE'
  | 'PARALLEL'
  | 'INCLUSIVE'
  | 'COMPLEX'
export type BpmnSubProcessKind = 'EMBEDDED' | 'TRANSACTION'
export type BpmnFlowType = 'SEQUENCE' | 'MESSAGE' | 'ASSOCIATION'
export type BpmnSequenceFlowKind = 'NORMAL' | 'CONDITIONAL' | 'DEFAULT' | 'EXCEPTION'

export type BpmnNodeProfile = {
  bpmnElementType: BpmnElementType
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  bpmnCallActivityRef?: string | null
}

export type BpmnEdgeProfile = {
  bpmnFlowType: BpmnFlowType
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
}

export type CanvasPosition = {
  x: number
  y: number
}

export type CanvasSize = {
  width: number
  height: number
}

export type SwimlaneComponentNode = {
  id: string
  componentVersionId: string
  nodeKey: string
  nodeType: BusinessFlowNodeType
  bpmnElementType?: BpmnElementType | null
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  bpmnCallActivityRef?: string | null
  title: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
  position: CanvasPosition
  size: CanvasSize
  erRefs?: BusinessFlowNodeErRef[]
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
}

export type SwimlaneComponentEdge = {
  id: string
  componentVersionId: string
  edgeKey: string
  sourceNodeKey: string
  targetNodeKey: string
  sourcePort?: string | null
  targetPort?: string | null
  edgeType: BusinessFlowEdgeType
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
  label?: string | null
  conditionText?: string | null
  dataContractJson?: BusinessFlowJson | null
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
}

export type SwimlaneComponentVersion = {
  id: string
  componentId: string
  versionNo: number
  versionName?: string | null
  status: SwimlaneComponentVersionStatus
  canvasJson?: BusinessFlowJson | null
  semanticJson?: BusinessFlowJson | null
  thumbnailUrl?: string | null
  checksum?: string | null
  createdAt: string
  publishedAt?: string | null
  nodes: SwimlaneComponentNode[]
  edges: SwimlaneComponentEdge[]
}

export type SwimlaneComponent = {
  id: string
  productId: string
  code: string
  name: string
  category?: string | null
  ownerRole?: string | null
  description?: string | null
  status: SwimlaneComponentStatus
  currentVersionNo: number
  createdAt: string
  updatedAt: string
  versions: SwimlaneComponentVersion[]
}

export type SwimlaneComponentListItem = {
  componentId: string
  componentVersionId: string
  productId: string
  name: string
  category?: string | null
  ownerRole?: string | null
  versionNo: number
  thumbnailUrl?: string | null
}

export type LaneInstanceData = {
  kind: 'LANE_INSTANCE'
  laneInstanceId: string
  instanceKey: string
  componentId: string
  componentVersionId: string
  componentName: string
  componentVersionNo: number
  displayName: string
  ownerRole?: string | null
  isOverridden: boolean
}

export type BusinessFlowLaneInstance = LaneInstanceData & {
  businessFlowId: string
  position: CanvasPosition
  size: CanvasSize
  zIndex: number
  layoutJson?: BusinessFlowJson | null
  overrideJson?: BusinessFlowJson | null
  status: LaneInstanceStatus
  createdAt: string
  updatedAt: string
}

export type BusinessFlowNodeErRef = {
  id?: string
  erDiagramId: string
  erTableKey: string
  erColumnKey?: string | null
  refType: BusinessFlowErRefType
  description?: string | null
}

export type BusinessFlowNodeData = {
  kind: 'BUSINESS_FLOW_NODE'
  nodeId: string
  nodeKey: string
  laneInstanceId: string
  originComponentNodeKey?: string | null
  nodeType: BusinessFlowNodeType
  bpmnElementType?: BpmnElementType | null
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  bpmnCallActivityRef?: string | null
  title: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  erRefs?: BusinessFlowNodeErRef[]
}

export type BusinessFlowNodeRecord = BusinessFlowNodeData & {
  businessFlowId: string
  position: CanvasPosition
  size: CanvasSize
  inputSummary?: string | null
  outputSummary?: string | null
  isOverridden: boolean
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
  createdAt: string
  updatedAt: string
}

export type BusinessFlowEdgeData = {
  kind: 'BUSINESS_FLOW_EDGE'
  edgeId: string
  edgeKey: string
  edgeType: BusinessFlowEdgeType
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
  label?: string | null
  conditionText?: string | null
  dataContract?: {
    input?: string[]
    output?: string[]
  }
  isCrossLane: boolean
}

export type BusinessFlowEdgeRecord = BusinessFlowEdgeData & {
  businessFlowId: string
  laneInstanceId?: string | null
  sourceType: BusinessFlowEdgeEndpointType
  sourceNodeKey?: string | null
  sourceLaneInstanceKey?: string | null
  sourcePort?: string | null
  targetType: BusinessFlowEdgeEndpointType
  targetNodeKey?: string | null
  targetLaneInstanceKey?: string | null
  targetPort?: string | null
  originComponentEdgeKey?: string | null
  isOverridden: boolean
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
  createdAt: string
  updatedAt: string
}

export type LocalBusinessFlowCanvas = {
  businessFlowId: string
  name: string
  code?: string | null
  description?: string | null
  version: number
  collabRevision: number
  createdAt: string
  updatedAt: string
  laneInstances: BusinessFlowLaneInstance[]
  nodes: BusinessFlowNodeRecord[]
  edges: BusinessFlowEdgeRecord[]
}

export type BusinessFlowCellData = LaneInstanceData | BusinessFlowNodeData | BusinessFlowEdgeData

export type BusinessFlowMemberModel = {
  userId: string
  email: string
  displayName: string
  role: BusinessFlowDomainRole
  createdAt: string
  isCreator?: boolean
}
