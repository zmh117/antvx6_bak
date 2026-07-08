import type {
  BpmnEdgeProfile,
  BpmnElementType,
  BpmnEventDefinition,
  BpmnEventKind,
  BpmnFlowType,
  BpmnGatewayType,
  BpmnNodeProfile,
  BpmnSequenceFlowKind,
  BpmnSubProcessKind,
  BpmnTaskType,
  BusinessFlowEdgeType,
  BusinessFlowJson,
  BusinessFlowNodeType,
  CanvasSize,
} from './types'

type JsonLike = Record<string, unknown> | null | undefined

type NullableBpmnNodeProfile = {
  bpmnElementType?: BpmnElementType | null
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  bpmnCallActivityRef?: string | null
}

type NullableBpmnEdgeProfile = {
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
}

const EVENT_DEFINITIONS = new Set<BpmnEventDefinition>(['NONE'])
const EVENT_KINDS = new Set<BpmnEventKind>(['START', 'INTERMEDIATE', 'END'])
const TASK_TYPES = new Set<BpmnTaskType>(['NONE'])
const GATEWAY_TYPES = new Set<BpmnGatewayType>([
  'EXCLUSIVE',
  'PARALLEL',
  'INCLUSIVE',
  'COMPLEX',
])
const SUB_PROCESS_KINDS = new Set<BpmnSubProcessKind>(['EMBEDDED', 'TRANSACTION'])
const ELEMENT_TYPES = new Set<BpmnElementType>([
  'EVENT',
  'TASK',
  'GATEWAY',
  'SUB_PROCESS',
  'CALL_ACTIVITY',
  'DATA_OBJECT',
  'DATA_INPUT',
  'DATA_OUTPUT',
  'DATA_STORE',
])
const FLOW_TYPES = new Set<BpmnFlowType>(['SEQUENCE', 'MESSAGE', 'ASSOCIATION'])
const SEQUENCE_FLOW_KINDS = new Set<BpmnSequenceFlowKind>([
  'NORMAL',
  'CONDITIONAL',
  'DEFAULT',
  'EXCEPTION',
])

export const BPMN_NODE_OPTIONS: ReadonlyArray<{
  key: string
  label: string
  group: '事件' | '活动' | '网关' | '数据'
  profile: BpmnNodeProfile
}> = [
  {
    key: 'event-start',
    label: '开始事件',
    group: '事件',
    profile: { bpmnElementType: 'EVENT', bpmnEventKind: 'START', bpmnEventDefinition: 'NONE' },
  },
  {
    key: 'event-intermediate',
    label: '中间事件',
    group: '事件',
    profile: { bpmnElementType: 'EVENT', bpmnEventKind: 'INTERMEDIATE', bpmnEventDefinition: 'NONE' },
  },
  {
    key: 'event-end',
    label: '结束事件',
    group: '事件',
    profile: { bpmnElementType: 'EVENT', bpmnEventKind: 'END', bpmnEventDefinition: 'NONE' },
  },
  {
    key: 'activity-task',
    label: '任务',
    group: '活动',
    profile: { bpmnElementType: 'TASK', bpmnTaskType: 'NONE' },
  },
  {
    key: 'activity-process-container',
    label: '流程容器',
    group: '活动',
    profile: { bpmnElementType: 'SUB_PROCESS', bpmnSubProcessKind: 'EMBEDDED' },
  },
  {
    key: 'activity-transaction',
    label: '事务',
    group: '活动',
    profile: { bpmnElementType: 'SUB_PROCESS', bpmnSubProcessKind: 'TRANSACTION' },
  },
  {
    key: 'gateway-exclusive',
    label: '排他网关',
    group: '网关',
    profile: { bpmnElementType: 'GATEWAY', bpmnGatewayType: 'EXCLUSIVE' },
  },
  {
    key: 'gateway-inclusive',
    label: '包容网关',
    group: '网关',
    profile: { bpmnElementType: 'GATEWAY', bpmnGatewayType: 'INCLUSIVE' },
  },
  {
    key: 'gateway-parallel',
    label: '并行网关',
    group: '网关',
    profile: { bpmnElementType: 'GATEWAY', bpmnGatewayType: 'PARALLEL' },
  },
  {
    key: 'gateway-complex',
    label: '复杂网关',
    group: '网关',
    profile: { bpmnElementType: 'GATEWAY', bpmnGatewayType: 'COMPLEX' },
  },
  {
    key: 'data-object',
    label: '数据对象',
    group: '数据',
    profile: { bpmnElementType: 'DATA_OBJECT' },
  },
  {
    key: 'data-input',
    label: '数据输入',
    group: '数据',
    profile: { bpmnElementType: 'DATA_INPUT' },
  },
  {
    key: 'data-output',
    label: '数据输出',
    group: '数据',
    profile: { bpmnElementType: 'DATA_OUTPUT' },
  },
  {
    key: 'data-store',
    label: '数据存储',
    group: '数据',
    profile: { bpmnElementType: 'DATA_STORE' },
  },
]

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const text = stringValue(value).toUpperCase()
  return allowed.has(text as T) ? (text as T) : fallback
}

function objectValue(value: unknown): BusinessFlowJson {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as BusinessFlowJson)
    : {}
}

function profileSource(propertiesJson?: JsonLike) {
  const props = objectValue(propertiesJson)
  return objectValue(props.bpmn)
}

export function normalizeBpmnNodeProfile(
  source: NullableBpmnNodeProfile & {
    nodeType?: BusinessFlowNodeType | string | null
    propertiesJson?: JsonLike
  },
): BpmnNodeProfile {
  const bpmn = profileSource(source.propertiesJson)
  const nodeType = source.nodeType
  const rawElementType = source.bpmnElementType ?? bpmn.elementType ?? bpmn.bpmnElementType
  let bpmnElementType = oneOf(rawElementType, ELEMENT_TYPES, 'TASK')
  if (!rawElementType) {
    if (nodeType === 'START' || nodeType === 'END' || nodeType === 'EVENT') bpmnElementType = 'EVENT'
    if (nodeType === 'DECISION' || nodeType === 'GATEWAY') bpmnElementType = 'GATEWAY'
    if (nodeType === 'SUB_PROCESS') bpmnElementType = 'SUB_PROCESS'
    if (nodeType === 'CALL_ACTIVITY') bpmnElementType = 'CALL_ACTIVITY'
    if (nodeType === 'DATA_OBJECT') bpmnElementType = 'DATA_OBJECT'
    if (nodeType === 'DATA_INPUT') bpmnElementType = 'DATA_INPUT'
    if (nodeType === 'DATA_OUTPUT') bpmnElementType = 'DATA_OUTPUT'
    if (nodeType === 'DATA_STORE') bpmnElementType = 'DATA_STORE'
  }

  const eventKind =
    bpmnElementType === 'EVENT'
      ? oneOf(
          source.bpmnEventKind ?? bpmn.eventKind ?? bpmn.bpmnEventKind,
          EVENT_KINDS,
          nodeType === 'START' ? 'START' : nodeType === 'END' ? 'END' : 'INTERMEDIATE',
        )
      : null
  const taskType =
    bpmnElementType === 'TASK'
      ? oneOf(
          source.bpmnTaskType ?? bpmn.taskType ?? bpmn.bpmnTaskType,
          TASK_TYPES,
          'NONE',
        )
      : null
  return {
    bpmnElementType,
    bpmnEventKind: eventKind,
    bpmnEventDefinition:
      bpmnElementType === 'EVENT'
        ? oneOf(
            source.bpmnEventDefinition ?? bpmn.eventDefinition ?? bpmn.bpmnEventDefinition,
            EVENT_DEFINITIONS,
            'NONE',
          )
        : null,
    bpmnTaskType: taskType,
    bpmnGatewayType:
      bpmnElementType === 'GATEWAY'
        ? oneOf(
            source.bpmnGatewayType ?? bpmn.gatewayType ?? bpmn.bpmnGatewayType,
            GATEWAY_TYPES,
            'EXCLUSIVE',
          )
        : null,
    bpmnSubProcessKind:
      bpmnElementType === 'SUB_PROCESS'
        ? oneOf(
            source.bpmnSubProcessKind ?? bpmn.subProcessKind ?? bpmn.bpmnSubProcessKind,
            SUB_PROCESS_KINDS,
            'EMBEDDED',
          )
        : null,
    bpmnCallActivityRef:
      bpmnElementType === 'CALL_ACTIVITY'
        ? stringValue(source.bpmnCallActivityRef ?? bpmn.callActivityRef ?? bpmn.bpmnCallActivityRef) ||
          null
        : null,
  }
}

export function legacyNodeTypeForBpmn(profile: BpmnNodeProfile): BusinessFlowNodeType {
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return 'START'
    if (profile.bpmnEventKind === 'END') return 'END'
    return 'EVENT'
  }
  if (profile.bpmnElementType === 'GATEWAY') return 'GATEWAY'
  if (profile.bpmnElementType === 'SUB_PROCESS') return 'SUB_PROCESS'
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return 'CALL_ACTIVITY'
  if (profile.bpmnElementType === 'DATA_OBJECT') return 'DATA_OBJECT'
  if (profile.bpmnElementType === 'DATA_INPUT') return 'DATA_INPUT'
  if (profile.bpmnElementType === 'DATA_OUTPUT') return 'DATA_OUTPUT'
  if (profile.bpmnElementType === 'DATA_STORE') return 'DATA_STORE'
  return 'TASK'
}

export function bpmnNodeTitle(profile: BpmnNodeProfile) {
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return '开始事件'
    if (profile.bpmnEventKind === 'END') return '结束事件'
    return '中间事件'
  }
  if (profile.bpmnElementType === 'GATEWAY') {
    if (profile.bpmnGatewayType === 'PARALLEL') return '并行网关'
    if (profile.bpmnGatewayType === 'INCLUSIVE') return '包容网关'
    if (profile.bpmnGatewayType === 'COMPLEX') return '复杂网关'
    return '排他网关'
  }
  if (profile.bpmnElementType === 'SUB_PROCESS') {
    return profile.bpmnSubProcessKind === 'TRANSACTION' ? '事务' : '流程容器'
  }
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return '调用活动'
  if (profile.bpmnElementType === 'DATA_OBJECT') return '数据对象'
  if (profile.bpmnElementType === 'DATA_INPUT') return '数据输入'
  if (profile.bpmnElementType === 'DATA_OUTPUT') return '数据输出'
  if (profile.bpmnElementType === 'DATA_STORE') return '数据存储'
  return '任务'
}

export function bpmnNodeOptionKey(profile: BpmnNodeProfile) {
  if (profile.bpmnElementType === 'EVENT') {
    return `event-${profile.bpmnEventKind?.toLowerCase() ?? 'intermediate'}`
  }
  if (profile.bpmnElementType === 'TASK') return 'activity-task'
  if (profile.bpmnElementType === 'SUB_PROCESS') {
    return profile.bpmnSubProcessKind === 'TRANSACTION'
      ? 'activity-transaction'
      : 'activity-process-container'
  }
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return 'activity-process-container'
  if (profile.bpmnElementType === 'GATEWAY') {
    return `gateway-${profile.bpmnGatewayType?.toLowerCase() ?? 'exclusive'}`
  }
  if (profile.bpmnElementType === 'DATA_OBJECT') return 'data-object'
  if (profile.bpmnElementType === 'DATA_INPUT') return 'data-input'
  if (profile.bpmnElementType === 'DATA_OUTPUT') return 'data-output'
  if (profile.bpmnElementType === 'DATA_STORE') return 'data-store'
  return 'activity-task'
}

export function bpmnNodeSize(profile: BpmnNodeProfile): CanvasSize {
  if (profile.bpmnElementType === 'EVENT') return { width: 58, height: 58 }
  if (profile.bpmnElementType === 'GATEWAY') return { width: 88, height: 72 }
  if (
    profile.bpmnElementType === 'DATA_OBJECT' ||
    profile.bpmnElementType === 'DATA_INPUT' ||
    profile.bpmnElementType === 'DATA_OUTPUT'
  ) return { width: 96, height: 72 }
  if (profile.bpmnElementType === 'DATA_STORE') return { width: 108, height: 78 }
  if (profile.bpmnElementType === 'SUB_PROCESS') return { width: 260, height: 170 }
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return { width: 170, height: 74 }
  return { width: 148, height: 64 }
}

export function normalizeBpmnEdgeProfile(
  source: NullableBpmnEdgeProfile & {
    edgeType?: BusinessFlowEdgeType | null
    propertiesJson?: JsonLike
    isCrossLane?: boolean
  },
): BpmnEdgeProfile {
  const bpmn = profileSource(source.propertiesJson)
  const rawFlowType = source.bpmnFlowType ?? bpmn.flowType ?? bpmn.bpmnFlowType
  let bpmnFlowType = oneOf(rawFlowType, FLOW_TYPES, 'SEQUENCE')
  if (!rawFlowType) {
    if (source.edgeType === 'MESSAGE') bpmnFlowType = 'MESSAGE'
    if (source.edgeType === 'ASSOCIATION' || source.edgeType === 'DATA_FLOW') bpmnFlowType = 'ASSOCIATION'
  }
  return {
    bpmnFlowType,
    bpmnSequenceFlowKind:
      bpmnFlowType === 'SEQUENCE'
        ? oneOf(
            source.bpmnSequenceFlowKind ?? bpmn.sequenceFlowKind ?? bpmn.bpmnSequenceFlowKind,
            SEQUENCE_FLOW_KINDS,
            source.edgeType === 'EXCEPTION' ? 'EXCEPTION' : 'NORMAL',
          )
        : null,
    bpmnMessageName:
      bpmnFlowType === 'MESSAGE'
        ? stringValue(source.bpmnMessageName ?? bpmn.messageName ?? bpmn.bpmnMessageName) || null
        : null,
    bpmnConditionExpression:
      bpmnFlowType === 'SEQUENCE'
        ? stringValue(
            source.bpmnConditionExpression ??
              bpmn.conditionExpression ??
              bpmn.bpmnConditionExpression,
          ) || null
        : null,
  }
}

export function legacyEdgeTypeForBpmn(
  profile: BpmnEdgeProfile,
  isCrossLane = false,
): BusinessFlowEdgeType {
  if (profile.bpmnFlowType === 'MESSAGE') return 'MESSAGE'
  if (profile.bpmnFlowType === 'ASSOCIATION') return 'ASSOCIATION'
  if (profile.bpmnSequenceFlowKind === 'EXCEPTION') return 'EXCEPTION'
  return isCrossLane ? 'DEPENDENCY' : 'SEQUENCE'
}

export function isDataBpmnElement(elementType?: BpmnElementType | null) {
  return elementType === 'DATA_OBJECT' ||
    elementType === 'DATA_INPUT' ||
    elementType === 'DATA_OUTPUT' ||
    elementType === 'DATA_STORE'
}

export function mergeBpmnIntoProperties(
  propertiesJson: JsonLike,
  profile: BpmnNodeProfile | BpmnEdgeProfile,
): BusinessFlowJson {
  const props = objectValue(propertiesJson)
  const {
    mes: _mes,
    mesSemantics: _mesSemantics,
    mes_semantics_json: _mesSemanticsJson,
    ...cleanProperties
  } = props
  return {
    ...cleanProperties,
    bpmn: { ...profile },
  }
}
