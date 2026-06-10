export type PlaceSwimlaneComponentCommand = {
  businessFlowId: string
  componentVersionId: string
  position: {
    x: number
    y: number
  }
}

export type BusinessFlowChangeOp = {
  opType: string
  targetType: 'LANE_INSTANCE' | 'NODE' | 'EDGE' | 'ER_REF' | 'CANVAS'
  targetKey: string
  patch: Record<string, unknown>
  inversePatch?: Record<string, unknown>
  summary?: string
}

export type ApplyBusinessFlowChangesCommand = {
  businessFlowId: string
  baseVersion: number
  ops: BusinessFlowChangeOp[]
}
