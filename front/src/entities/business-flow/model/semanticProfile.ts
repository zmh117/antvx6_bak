import type {
  BusinessFlowEdgeRecord,
  BusinessFlowJson,
  BusinessFlowNodeRecord,
  BusinessSemanticProfile,
} from './types'

export const BUSINESS_SEMANTIC_PROFILES: BusinessSemanticProfile[] = [
  {
    profileKey: 'generic-business-operation',
    domain: 'generic',
    targetScope: 'NODE',
    version: 1,
    name: '通用业务操作',
    description: '描述任意业务节点的操作、对象、前置条件和后置条件。',
  },
  {
    profileKey: 'mes-manufacturing-node',
    domain: 'mes',
    targetScope: 'NODE',
    version: 1,
    name: 'MES 生产步骤',
    description: '描述称量、投料、质检、放行、审计和偏差处理等生产制造步骤。',
    taxonomyJson: {
      operationType: [
        'RECEIVE_MATERIAL',
        'WEIGH',
        'DISPENSE',
        'MIX',
        'REACT',
        'SAMPLE',
        'QC_CHECK',
        'RELEASE',
        'PACK',
        'TRANSFER',
        'CLEAN',
        'STERILIZE',
        'RECORD_AUDIT',
        'HANDLE_DEVIATION',
      ],
      businessObject: [
        'WORK_ORDER',
        'BATCH',
        'MATERIAL_LOT',
        'RECIPE',
        'EQUIPMENT',
        'PROCESS_PARAMETER',
        'QC_RESULT',
        'EBR',
        'AUDIT_TRAIL',
      ],
      resourceType: ['OPERATOR', 'EQUIPMENT', 'WORKCENTER', 'SYSTEM'],
      exceptionType: [
        'QUALITY_FAILED',
        'MATERIAL_SHORTAGE',
        'EQUIPMENT_FAILURE',
        'PARAMETER_OUT_OF_RANGE',
        'SIGNATURE_REJECTED',
      ],
    },
  },
  {
    profileKey: 'mes-manufacturing-edge',
    domain: 'mes',
    targetScope: 'EDGE',
    version: 1,
    name: 'MES 流转语义',
    description: '描述条件、交接、消息、超时策略和异常类型。',
    taxonomyJson: {
      exceptionType: [
        'QUALITY_FAILED',
        'MATERIAL_SHORTAGE',
        'EQUIPMENT_FAILURE',
        'PARAMETER_OUT_OF_RANGE',
        'SIGNATURE_REJECTED',
      ],
    },
  },
]

export type BusinessFlowQualityIssue = {
  severity: 'info' | 'warning'
  targetType: 'NODE' | 'EDGE'
  targetKey?: string | null
  code: string
  message: string
}

export function semanticPayload(value?: BusinessFlowJson | null): BusinessFlowJson {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function textArrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string') return []
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function updateSemanticPayload(
  payload: BusinessFlowJson | null | undefined,
  key: string,
  value: unknown,
): BusinessFlowJson {
  const next = { ...semanticPayload(payload) }
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}

export function profileForNode(node: Pick<BusinessFlowNodeRecord, 'semanticProfileKey'>) {
  return BUSINESS_SEMANTIC_PROFILES.find(
    (profile) => profile.targetScope === 'NODE' && profile.profileKey === node.semanticProfileKey,
  )
}

export function profileForEdge(edge: Pick<BusinessFlowEdgeRecord, 'semanticProfileKey'>) {
  return BUSINESS_SEMANTIC_PROFILES.find(
    (profile) => profile.targetScope === 'EDGE' && profile.profileKey === edge.semanticProfileKey,
  )
}

export function businessFlowQualityIssues(
  nodes: BusinessFlowNodeRecord[],
  edges: BusinessFlowEdgeRecord[],
): BusinessFlowQualityIssue[] {
  const refsByNode = new Map(nodes.map((node) => [node.nodeKey, node.erRefs ?? []]))
  const outgoing = new Map<string, BusinessFlowEdgeRecord[]>()
  edges.forEach((edge) => {
    if (!edge.sourceNodeKey) return
    outgoing.set(edge.sourceNodeKey, [...(outgoing.get(edge.sourceNodeKey) ?? []), edge])
  })
  const issues: BusinessFlowQualityIssue[] = []
  nodes.forEach((node) => {
    const payload = semanticPayload(node.semanticPayloadJson)
    if (node.semanticProfileKey && node.bpmnElementType === 'TASK' && !payload.operationType) {
      issues.push({
        severity: 'warning',
        targetType: 'NODE',
        targetKey: node.nodeKey,
        code: 'MISSING_OPERATION_TYPE',
        message: '任务已选择业务语义 Profile，但缺少操作类型。',
      })
    }
    if (node.semanticProfileKey && node.bpmnElementType === 'TASK' && !(refsByNode.get(node.nodeKey)?.length)) {
      issues.push({
        severity: 'warning',
        targetType: 'NODE',
        targetKey: node.nodeKey,
        code: 'MISSING_ER_REF',
        message: '关键业务任务缺少 ER 读写/检查绑定。',
      })
    }
    if (
      ['DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'].includes(node.bpmnElementType ?? '') &&
      !payload.businessObject &&
      !(refsByNode.get(node.nodeKey)?.length)
    ) {
      issues.push({
        severity: 'info',
        targetType: 'NODE',
        targetKey: node.nodeKey,
        code: 'DATA_NODE_WITHOUT_BUSINESS_OBJECT',
        message: '数据节点缺少业务对象或 ER 绑定。',
      })
    }
    if (node.bpmnElementType === 'GATEWAY') {
      ;(outgoing.get(node.nodeKey) ?? []).forEach((edge) => {
        const edgePayload = semanticPayload(edge.semanticPayloadJson)
        if (!edge.conditionText && !edge.bpmnConditionExpression && !edgePayload.condition) {
          issues.push({
            severity: 'warning',
            targetType: 'EDGE',
            targetKey: edge.edgeKey,
            code: 'MISSING_GATEWAY_CONDITION',
            message: '网关出边缺少条件。',
          })
        }
      })
    }
  })
  return issues
}
