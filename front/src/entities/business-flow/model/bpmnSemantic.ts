import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BpmnSemanticJson,
  BpmnSemanticType,
} from './types'

const DATA_TYPES = new Set(['DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'])

export function isDataBpmnProfile(profile: BpmnNodeProfile) {
  return DATA_TYPES.has(profile.bpmnElementType)
}

export function nodeSemanticType(profile: BpmnNodeProfile): BpmnSemanticType | null {
  if (profile.bpmnElementType === 'TASK') return null
  if (profile.bpmnElementType === 'EVENT') {
    if (profile.bpmnEventKind === 'START') return 'startEvent'
    if (profile.bpmnEventKind === 'END') return 'endEvent'
    return 'intermediateEvent'
  }
  if (profile.bpmnElementType === 'SUB_PROCESS' && profile.bpmnSubProcessKind === 'TRANSACTION') {
    return 'transaction'
  }
  if (profile.bpmnElementType === 'GATEWAY') {
    if (profile.bpmnGatewayType === 'INCLUSIVE') return 'inclusiveGateway'
    if (profile.bpmnGatewayType === 'PARALLEL') return 'parallelGateway'
    if (profile.bpmnGatewayType === 'COMPLEX') return 'complexGateway'
    return 'exclusiveGateway'
  }
  if (profile.bpmnElementType === 'DATA_OBJECT') return 'dataObject'
  if (profile.bpmnElementType === 'DATA_INPUT') return 'dataInput'
  if (profile.bpmnElementType === 'DATA_OUTPUT') return 'dataOutput'
  if (profile.bpmnElementType === 'DATA_STORE') return 'dataStore'
  return null
}

export function edgeSemanticType(profile: BpmnEdgeProfile): BpmnSemanticType {
  if (profile.bpmnFlowType === 'MESSAGE') return 'messageFlow'
  if (profile.bpmnFlowType === 'ASSOCIATION') return 'association'
  return 'sequenceFlow'
}

const NAME_KEYS: Record<BpmnSemanticType, string> = {
  startEvent: 'eventName',
  intermediateEvent: 'eventName',
  endEvent: 'eventName',
  transaction: 'transactionName',
  exclusiveGateway: 'decisionName',
  inclusiveGateway: 'decisionName',
  parallelGateway: 'gatewayName',
  complexGateway: 'gatewayName',
  dataObject: 'dataName',
  dataInput: 'dataName',
  dataOutput: 'dataName',
  dataStore: 'dataName',
  sequenceFlow: 'flowName',
  messageFlow: 'messageName',
  association: 'associationName',
}

export const BPMN_SEMANTIC_TYPES = Object.keys(NAME_KEYS) as BpmnSemanticType[]

const ENUM_VALUES: Partial<Record<BpmnSemanticType, Record<string, string[]>>> = {
  startEvent: { triggerType: ['manual', 'message', 'timer', 'signal', 'condition'] },
  intermediateEvent: {
    catchOrThrow: ['catch', 'throw'],
    eventDefinition: ['message', 'timer', 'error', 'signal', 'compensation', 'escalation'],
  },
  endEvent: { resultType: ['success', 'failure', 'cancel', 'terminate', 'error', 'compensation'] },
  transaction: {
    transactionType: ['technical', 'business', 'saga'],
    compensationOrder: ['reverseOrder', 'forwardOrder', 'custom'],
    consistencyLevel: ['strong', 'eventual'],
  },
  exclusiveGateway: { conditionExpressionType: ['naturalLanguage', 'feel', 'javascript', 'sql'] },
  parallelGateway: { parallelMode: ['fork', 'join', 'forkJoin'] },
  dataInput: {
    sourceType: ['user', 'system', 'api', 'message', 'file'],
    sensitiveLevel: ['normal', 'internal', 'confidential'],
  },
  dataOutput: { targetType: ['api', 'database', 'message', 'file', 'ui'] },
  dataStore: {
    storeType: ['database', 'cache', 'file', 'mq', 'externalSystem'],
    accessMode: ['read', 'write', 'readWrite'],
    consistencyLevel: ['strong', 'eventual'],
    privacyLevel: ['normal', 'internal', 'confidential'],
  },
  sequenceFlow: {
    flowKind: ['normal', 'conditional', 'default', 'exception', 'compensation'],
    conditionExpressionType: ['naturalLanguage', 'feel', 'javascript', 'sql'],
    testScenarioType: ['normal', 'exception', 'boundary', 'compensation'],
  },
  messageFlow: {
    deliveryMode: ['sync', 'async'],
    testScenarioType: ['normal', 'exception', 'boundary', 'compensation'],
  },
  association: {
    direction: ['none', 'oneWay', 'twoWay'],
    dataRole: ['input', 'output', 'reference'],
    testScenarioType: ['normal', 'exception', 'boundary', 'compensation'],
  },
}

const EMPTY_BY_TYPE: Record<BpmnSemanticType, Record<string, unknown>> = {
  startEvent: { eventName: '', triggerType: 'manual', triggerSource: '', startCondition: '', inputDataRefs: [], initiator: '', frequency: '', preCheckRules: [] },
  intermediateEvent: { eventName: '', catchOrThrow: 'catch', eventDefinition: 'message', interrupting: false, timeout: '', messageName: '', errorCode: '', escalationCode: '', businessMeaning: '' },
  endEvent: { eventName: '', resultType: 'success', finalBusinessState: '', outputDataRefs: [], notifyTargets: [], auditRequired: false, rollbackRequired: false },
  transaction: { transactionName: '', transactionType: 'business', successCriteria: [], cancelTriggers: [], compensationPolicy: '', compensationOrder: 'reverseOrder', consistencyLevel: 'eventual', timeout: '', isolationNote: '', compensationTasks: [], partialSuccessPolicy: '', auditRequired: false },
  exclusiveGateway: { decisionName: '', decisionVariable: '', branches: [], defaultFlowId: '', conditionExpressionType: 'naturalLanguage', mutuallyExclusive: true, coverageRequired: true },
  inclusiveGateway: { decisionName: '', branchConditions: [], allowMultipleBranches: true, mergePolicy: '', minSelectedBranches: 1, coverageRequired: true },
  parallelGateway: { gatewayName: '', parallelMode: 'forkJoin', waitForAll: true, expectedBranches: [], partialFailurePolicy: '', timeout: '', concurrencyLimit: null },
  complexGateway: { gatewayName: '', activationCondition: '', completionCondition: '', requiredCount: null, totalCount: null, customRule: '', explanation: '' },
  dataObject: { dataName: '', entityName: '', schemaRef: '', lifecycleState: '', ownerActivityRef: '', readByRefs: [], writeByRefs: [] },
  dataInput: { dataName: '', sourceType: 'user', sourceRef: '', required: false, validationRules: [], exampleValue: '', sensitiveLevel: 'normal', defaultValue: '' },
  dataOutput: { dataName: '', targetType: 'ui', targetRef: '', outputContract: '', transformRule: '', successOutput: '', failureOutput: '' },
  dataStore: { dataName: '', storeType: 'database', systemRef: '', accessMode: 'readWrite', consistencyLevel: 'eventual', retentionPolicy: '', privacyLevel: 'internal' },
  sequenceFlow: { flowName: '', flowKind: 'normal', conditionText: '', conditionExpression: '', conditionExpressionType: 'naturalLanguage', priority: null, isDefault: false, businessRuleRefs: [], testScenarioType: 'normal', expectedResult: '' },
  messageFlow: { messageName: '', businessMeaning: '', senderRef: '', receiverRef: '', payloadDataRefs: [], deliveryMode: 'async', timeout: '', testScenarioType: 'normal', expectedResult: '' },
  association: { associationName: '', businessMeaning: '', direction: 'none', dataRole: 'reference', testScenarioType: 'normal', expectedResult: '' },
}

export function emptyBpmnSemantic(type: BpmnSemanticType, name = ''): BpmnSemanticJson {
  return {
    schemaVersion: 1,
    semanticType: type,
    ...EMPTY_BY_TYPE[type],
    [NAME_KEYS[type]]: name,
  } as BpmnSemanticJson
}

export function normalizeBpmnSemantic(
  value: unknown,
  type: BpmnSemanticType,
  fallbackName = '',
): BpmnSemanticJson {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const allowed = EMPTY_BY_TYPE[type]
  const normalized: Record<string, unknown> = { schemaVersion: 1, semanticType: type }
  Object.entries(allowed).forEach(([key, fallback]) => {
    const raw = source[key]
    if (key === 'branches' || key === 'branchConditions') {
      normalized[key] = Array.isArray(raw)
        ? raw.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => {
            const branch = item as Record<string, unknown>
            return {
              flowId: typeof branch.flowId === 'string' ? branch.flowId.trim() : '',
              label: typeof branch.label === 'string' ? branch.label.trim() : '',
              condition: typeof branch.condition === 'string' ? branch.condition.trim() : '',
            }
          })
        : []
    } else if (Array.isArray(fallback)) {
      normalized[key] = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
        : []
    }
    else if (typeof fallback === 'boolean') normalized[key] = typeof raw === 'boolean' ? raw : fallback
    else if (typeof fallback === 'number' || fallback === null) {
      const number = Number(raw)
      normalized[key] = raw === '' || raw === undefined || raw === null || !Number.isFinite(number)
        ? fallback
        : number
    } else {
      const fallbackText = typeof fallback === 'string' ? fallback : ''
      const text = typeof raw === 'string' ? raw.trim() : fallbackText
      const allowedValues = ENUM_VALUES[type]?.[key]
      normalized[key] = allowedValues && !allowedValues.includes(text) ? fallbackText : text
    }
  })
  const nameKey = NAME_KEYS[type]
  normalized[nameKey] = String(normalized[nameKey] || fallbackName).trim()
  return normalized as BpmnSemanticJson
}

export function bpmnSemanticDisplayName(value: BpmnSemanticJson | null | undefined, fallback = '') {
  if (!value) return fallback
  return String((value as unknown as Record<string, unknown>)[NAME_KEYS[value.semanticType]] || fallback).trim()
}

export function bpmnSemanticQualityIssues(value: BpmnSemanticJson): string[] {
  const issues: string[] = []
  if (!bpmnSemanticDisplayName(value)) issues.push('缺少业务名称')
  const data = value as unknown as Record<string, unknown>
  if (value.semanticType === 'startEvent' && (!data.triggerType || !data.startCondition)) issues.push('开始事件缺少触发方式或启动条件')
  if (value.semanticType === 'endEvent' && (!data.resultType || !data.finalBusinessState)) issues.push('结束事件缺少结果类型或最终业务状态')
  if (value.semanticType === 'transaction' && data.transactionType === 'saga') {
    if (!(data.cancelTriggers as unknown[])?.length || !data.compensationPolicy || !(data.compensationTasks as unknown[])?.length) issues.push('Saga 事务缺少取消条件或补偿定义')
  }
  if (value.semanticType === 'exclusiveGateway' && !data.decisionVariable) issues.push('排他网关缺少判断变量')
  if (value.semanticType === 'exclusiveGateway' || value.semanticType === 'inclusiveGateway') {
    const branches = (data.branches ?? data.branchConditions) as { flowId?: string }[]
    const ids = branches.map((branch) => branch.flowId).filter(Boolean) as string[]
    if (new Set(ids).size !== ids.length) issues.push('网关存在重复的分支连线')
    if (value.semanticType === 'exclusiveGateway' && data.defaultFlowId && !ids.includes(String(data.defaultFlowId))) {
      issues.push('默认路径不在已配置分支中')
    }
  }
  if (value.semanticType === 'complexGateway') {
    const required = data.requiredCount as number | null
    const total = data.totalCount as number | null
    if (required !== null && total !== null && required > total) issues.push('要求完成数量不能大于总分支数量')
  }
  return issues
}

export const BPMN_SEMANTIC_ENUM_LABELS: Record<string, string> = {
  manual: '人工触发', message: '消息触发', timer: '定时触发', signal: '信号触发',
  condition: '条件触发', catch: '捕获', throw: '抛出', error: '错误',
  compensation: '补偿', escalation: '升级', success: '成功', failure: '失败',
  cancel: '取消', terminate: '终止', technical: '技术事务', business: '业务事务',
  saga: '长事务补偿', reverseOrder: '逆序补偿', forwardOrder: '顺序补偿',
  custom: '自定义', strong: '强一致', eventual: '最终一致',
  naturalLanguage: '自然语言', feel: '规则表达式',
  javascript: '脚本表达式', sql: '查询表达式', fork: '并行拆分', join: '并行汇聚',
  forkJoin: '拆分并汇聚', user: '用户', system: '系统', api: '接口',
  file: '文件', database: '数据库', cache: '缓存', mq: '消息队列',
  externalSystem: '外部系统', ui: '页面', read: '只读', write: '只写',
  readWrite: '读写', normal: '普通', conditional: '条件', default: '默认',
  exception: '异常', boundary: '边界', async: '异步', sync: '同步', none: '无方向',
  oneWay: '单向', twoWay: '双向', input: '输入', output: '输出',
  reference: '引用', internal: '内部', confidential: '机密',
}
