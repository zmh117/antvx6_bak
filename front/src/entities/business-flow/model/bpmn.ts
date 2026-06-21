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
  MesSemantics,
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
  bpmnBoundaryAttachedToNodeKey?: string | null
}

type NullableBpmnEdgeProfile = {
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
}

const EVENT_DEFINITIONS = new Set<BpmnEventDefinition>([
  'NONE',
  'MESSAGE',
  'TIMER',
  'ERROR',
  'ESCALATION',
  'CONDITIONAL',
  'SIGNAL',
  'LINK',
  'MULTIPLE',
  'TERMINATE',
  'CANCEL',
  'COMPENSATION',
])

const EVENT_KINDS = new Set<BpmnEventKind>(['START', 'INTERMEDIATE', 'END', 'BOUNDARY'])
const TASK_TYPES = new Set<BpmnTaskType>([
  'NONE',
  'USER',
  'SERVICE',
  'MANUAL',
  'SCRIPT',
  'BUSINESS_RULE',
  'RECEIVE',
  'SEND',
])
const GATEWAY_TYPES = new Set<BpmnGatewayType>([
  'EXCLUSIVE',
  'PARALLEL',
  'INCLUSIVE',
  'EVENT_BASED',
  'COMPLEX',
])
const SUB_PROCESS_KINDS = new Set<BpmnSubProcessKind>([
  'EMBEDDED',
  'TRANSACTION',
  'EVENT_SUB_PROCESS',
])
const ELEMENT_TYPES = new Set<BpmnElementType>([
  'EVENT',
  'TASK',
  'GATEWAY',
  'SUB_PROCESS',
  'CALL_ACTIVITY',
  'DATA_OBJECT',
  'TEXT_ANNOTATION',
])
const FLOW_TYPES = new Set<BpmnFlowType>(['SEQUENCE', 'MESSAGE', 'ASSOCIATION'])
const SEQUENCE_FLOW_KINDS = new Set<BpmnSequenceFlowKind>([
  'NORMAL',
  'CONDITIONAL',
  'DEFAULT',
  'EXCEPTION',
])

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const text = stringValue(value).toUpperCase()
  return allowed.has(text as T) ? (text as T) : fallback
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => stringValue(item)).filter(Boolean)
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

function mesSource(propertiesJson?: JsonLike) {
  const props = objectValue(propertiesJson)
  return objectValue(props.mes)
}

export function normalizeBpmnNodeProfile(
  source: NullableBpmnNodeProfile & {
    nodeType?: BusinessFlowNodeType | null
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
    if (nodeType === 'TEXT_ANNOTATION') bpmnElementType = 'TEXT_ANNOTATION'
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
          nodeType === 'SERVICE' ? 'SERVICE' : nodeType === 'MANUAL' ? 'MANUAL' : 'NONE',
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
    bpmnBoundaryAttachedToNodeKey:
      eventKind === 'BOUNDARY'
        ? stringValue(
            source.bpmnBoundaryAttachedToNodeKey ??
              bpmn.boundaryAttachedToNodeKey ??
              bpmn.bpmnBoundaryAttachedToNodeKey,
          ) || null
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
  if (profile.bpmnElementType === 'TEXT_ANNOTATION') return 'TEXT_ANNOTATION'
  if (profile.bpmnTaskType === 'SERVICE') return 'SERVICE'
  if (profile.bpmnTaskType === 'MANUAL') return 'MANUAL'
  return 'TASK'
}

export function bpmnNodeTitle(profile: BpmnNodeProfile) {
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return '开始事件'
    if (profile.bpmnEventKind === 'END') return '结束事件'
    if (profile.bpmnEventKind === 'BOUNDARY') return '边界事件'
    return '中间事件'
  }
  if (profile.bpmnElementType === 'GATEWAY') {
    if (profile.bpmnGatewayType === 'PARALLEL') return '并行网关'
    if (profile.bpmnGatewayType === 'INCLUSIVE') return '包容网关'
    if (profile.bpmnGatewayType === 'EVENT_BASED') return '事件网关'
    if (profile.bpmnGatewayType === 'COMPLEX') return '复杂网关'
    return '排他网关'
  }
  if (profile.bpmnElementType === 'SUB_PROCESS') return '子流程'
  if (profile.bpmnElementType === 'CALL_ACTIVITY') return '调用活动'
  if (profile.bpmnElementType === 'DATA_OBJECT') return '数据对象'
  if (profile.bpmnElementType === 'TEXT_ANNOTATION') return '注释'
  if (profile.bpmnTaskType === 'SERVICE') return '服务任务'
  if (profile.bpmnTaskType === 'MANUAL') return '人工任务'
  if (profile.bpmnTaskType === 'SCRIPT') return '脚本任务'
  if (profile.bpmnTaskType === 'BUSINESS_RULE') return '规则任务'
  if (profile.bpmnTaskType === 'RECEIVE') return '接收任务'
  if (profile.bpmnTaskType === 'SEND') return '发送任务'
  if (profile.bpmnTaskType === 'USER') return '用户任务'
  return '任务'
}

export function bpmnNodeSize(profile: BpmnNodeProfile): CanvasSize {
  if (profile.bpmnElementType === 'EVENT') return { width: 58, height: 58 }
  if (profile.bpmnElementType === 'GATEWAY') return { width: 88, height: 72 }
  if (profile.bpmnElementType === 'DATA_OBJECT') return { width: 96, height: 72 }
  if (profile.bpmnElementType === 'TEXT_ANNOTATION') return { width: 150, height: 72 }
  if (profile.bpmnElementType === 'SUB_PROCESS') return { width: 180, height: 92 }
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

export function normalizeMesSemantics(
  value?: MesSemantics | JsonLike,
  propertiesJson?: JsonLike,
): MesSemantics {
  const raw = objectValue(value ?? mesSource(propertiesJson))
  return {
    variables: arrayValue(raw.variables),
    systemConfigs: arrayValue(raw.systemConfigs),
    masterRecipe: stringValue(raw.masterRecipe) || null,
    recipe: stringValue(raw.recipe) || null,
    controlSteps: arrayValue(raw.controlSteps),
    controls: arrayValue(raw.controls),
    materialInputs: arrayValue(raw.materialInputs),
    materialOutputs: arrayValue(raw.materialOutputs),
    materialUsageRecord: stringValue(raw.materialUsageRecord) || null,
    batchRecordFields: arrayValue(raw.batchRecordFields),
    auditEvents: arrayValue(raw.auditEvents),
    electronicSignature: stringValue(raw.electronicSignature) || null,
    notes: stringValue(raw.notes) || null,
  }
}

export function mergeBpmnIntoProperties(
  propertiesJson: JsonLike,
  profile: BpmnNodeProfile | BpmnEdgeProfile,
  mesSemantics?: MesSemantics | null,
): BusinessFlowJson {
  const props = objectValue(propertiesJson)
  return {
    ...props,
    bpmn: { ...objectValue(props.bpmn), ...profile },
    mes: normalizeMesSemantics(mesSemantics ?? mesSource(props)),
  }
}
