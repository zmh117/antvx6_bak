export type SwimlaneComponentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type SwimlaneComponentVersionStatus = 'DRAFT' | 'PUBLISHED'
export type BusinessFlowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type BusinessFlowDomainRole = 'owner' | 'editor' | 'viewer'
export type LaneInstanceStatus = 'ACTIVE' | 'REMOVED'

export type BusinessFlowNodeType =
  | 'START'
  | 'END'
  | 'TASK'
  | 'DECISION'
  | 'SERVICE'
  | 'MANUAL'
  | 'EVENT'

export type BusinessFlowEdgeEndpointType = 'NODE' | 'LANE'

export type BusinessFlowEdgeType =
  | 'SEQUENCE'
  | 'TRIGGER'
  | 'DATA_FLOW'
  | 'CALL'
  | 'DEPENDENCY'
  | 'EXCEPTION'

export type BusinessFlowErRefType = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECK'

export type BusinessFlowJson = Record<string, unknown>

export type CanvasPosition = {
  x: number
  y: number
}

export type CanvasSize = {
  width: number
  height: number
}

export type SwimlaneComponentListItem = {
  componentId: string
  componentVersionId: string
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

export type BusinessFlowNodeErRef = {
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
  title: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  erRefs?: BusinessFlowNodeErRef[]
}

export type BusinessFlowEdgeData = {
  kind: 'BUSINESS_FLOW_EDGE'
  edgeId: string
  edgeKey: string
  edgeType: BusinessFlowEdgeType
  label?: string | null
  conditionText?: string | null
  dataContract?: {
    input?: string[]
    output?: string[]
  }
  isCrossLane: boolean
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
