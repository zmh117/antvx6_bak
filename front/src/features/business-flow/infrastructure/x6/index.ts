import type { BusinessFlowCellData } from '@/entities/business-flow'

export type BusinessFlowX6CellData = {
  boundedContext: 'business-flow'
  cellRole: 'LANE_INSTANCE' | 'FLOW_NODE' | 'FLOW_EDGE'
  businessFlowId: string
  laneInstanceKey?: string
  nodeKey?: string
  edgeKey?: string
  payload: BusinessFlowCellData
}
