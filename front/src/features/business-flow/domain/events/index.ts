export type BusinessFlowDomainEvent =
  | {
      type: 'LANE_INSTANCE_PLACED'
      businessFlowId: string
      laneInstanceKey: string
    }
  | {
      type: 'BUSINESS_FLOW_VERSION_CHANGED'
      businessFlowId: string
      baseVersion: number
      newVersion: number
    }
