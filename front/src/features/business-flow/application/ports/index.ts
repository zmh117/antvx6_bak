import type {
  BusinessFlowEdgeData,
  BusinessFlowNodeData,
  LaneInstanceData,
  SwimlaneComponentListItem,
} from '@/entities/business-flow'

export type BusinessFlowEditorState = {
  businessFlowId: string
  currentVersion: number
  laneInstances: LaneInstanceData[]
  nodes: BusinessFlowNodeData[]
  edges: BusinessFlowEdgeData[]
}

export type SwimlaneComponentRepository = {
  listPublished(productId: string): Promise<SwimlaneComponentListItem[]>
}

export type BusinessFlowRepository = {
  getEditorState(businessFlowId: string): Promise<BusinessFlowEditorState>
}
