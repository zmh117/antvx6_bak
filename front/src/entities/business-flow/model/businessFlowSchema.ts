export const BUSINESS_FLOW_NODE_TYPES = [
  'lane',
  'start_event',
  'end_event',
  'activity',
  'subprocess',
  'exclusive_gateway',
  'parallel_gateway',
] as const

export type BusinessFlowNodeType = (typeof BUSINESS_FLOW_NODE_TYPES)[number]

export type BusinessFlowPoint = {
  x: number
  y: number
}

export type BusinessFlowSize = {
  width: number
  height: number
}

export type BusinessFlowNode = {
  id: string
  type: BusinessFlowNodeType
  label?: string
  position: BusinessFlowPoint
  size: BusinessFlowSize
  lane_id?: string | null
  details?: string | null
  expanded?: boolean
}

export type BusinessFlowEdge = {
  id: string
  source: string
  target: string
  label?: string | null
  vertices?: BusinessFlowPoint[]
  dashed?: boolean
}

export type BusinessFlowBindingUsage =
  | 'read'
  | 'write'
  | 'check'
  | 'derive'
  | 'notify'

export type BusinessFlowBinding = {
  binding_key: string
  step_key: string
  table_key?: string | null
  column_key?: string | null
  relation_key?: string | null
  usage_type?: BusinessFlowBindingUsage | string
  description?: string | null
}

export type BusinessFlowRecord = {
  graph_id: string
  flow_key: string
  name: string
  description?: string | null
  nodes: BusinessFlowNode[]
  edges: BusinessFlowEdge[]
  bindings: BusinessFlowBinding[]
  version: number
}

export type BusinessFlowSaveBody = Omit<
  BusinessFlowRecord,
  'graph_id' | 'flow_key' | 'version'
>

export const BUSINESS_FLOW_BINDING_USAGE_OPTIONS: Array<{
  value: BusinessFlowBindingUsage
  label: string
}> = [
  { value: 'read', label: '读取' },
  { value: 'write', label: '写入' },
  { value: 'check', label: '校验' },
  { value: 'derive', label: '派生' },
  { value: 'notify', label: '通知' },
]

export function isBusinessFlowNodeType(value: unknown): value is BusinessFlowNodeType {
  return (
    typeof value === 'string' &&
    BUSINESS_FLOW_NODE_TYPES.includes(value as BusinessFlowNodeType)
  )
}

export function nodeTypeLabel(type: BusinessFlowNodeType) {
  const labels: Record<BusinessFlowNodeType, string> = {
    lane: '泳道',
    start_event: '开始',
    end_event: '结束',
    activity: '任务',
    subprocess: '子流程',
    exclusive_gateway: '排他网关',
    parallel_gateway: '并行网关',
  }
  return labels[type]
}

export function canBindBusinessFlowNode(type?: BusinessFlowNodeType | null) {
  return type === 'activity' || type === 'subprocess'
}

