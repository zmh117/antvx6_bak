import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BPMN_SEMANTIC_ENUM_LABELS,
  BPMN_SEMANTIC_TYPES,
  bpmnSemanticDisplayName,
  bpmnSemanticQualityIssues,
  edgeSemanticType,
  emptyBpmnSemantic,
  nodeSemanticType,
  normalizeBpmnSemantic,
} from '../src/entities/business-flow/model/bpmnSemantic.js'

test('maps the existing 12 non-task nodes and three edge types', () => {
  assert.equal(nodeSemanticType({ bpmnElementType: 'EVENT', bpmnEventKind: 'START' }), 'startEvent')
  assert.equal(nodeSemanticType({ bpmnElementType: 'EVENT', bpmnEventKind: 'INTERMEDIATE' }), 'intermediateEvent')
  assert.equal(nodeSemanticType({ bpmnElementType: 'EVENT', bpmnEventKind: 'END' }), 'endEvent')
  assert.equal(nodeSemanticType({ bpmnElementType: 'SUB_PROCESS', bpmnSubProcessKind: 'TRANSACTION' }), 'transaction')
  for (const gateway of ['EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX'] as const) {
    assert.ok(nodeSemanticType({ bpmnElementType: 'GATEWAY', bpmnGatewayType: gateway }))
  }
  for (const dataType of ['DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'] as const) {
    assert.ok(nodeSemanticType({ bpmnElementType: dataType }))
  }
  assert.equal(nodeSemanticType({ bpmnElementType: 'TASK' }), null)
  assert.equal(edgeSemanticType({ bpmnFlowType: 'SEQUENCE' }), 'sequenceFlow')
  assert.equal(edgeSemanticType({ bpmnFlowType: 'MESSAGE' }), 'messageFlow')
  assert.equal(edgeSemanticType({ bpmnFlowType: 'ASSOCIATION' }), 'association')
})

test('normalizes stable English keys and uses the old title only as name fallback', () => {
  const semantic = normalizeBpmnSemantic(
    {
      semanticType: 'wrong',
      triggerType: 'message',
      startCondition: '收到订单消息',
      unknownField: 'discard',
    },
    'startEvent',
    '订单开始',
  )
  assert.equal(semantic.schemaVersion, 1)
  assert.equal(semantic.semanticType, 'startEvent')
  assert.equal(bpmnSemanticDisplayName(semantic), '订单开始')
  assert.equal('unknownField' in semantic, false)
})

test('reports missing event and saga compensation semantics', () => {
  const start = emptyBpmnSemantic('startEvent', '')
  assert.ok(bpmnSemanticQualityIssues(start).some((issue) => issue.includes('业务名称')))
  const saga = normalizeBpmnSemantic({ transactionType: 'saga' }, 'transaction', '预订事务')
  assert.ok(bpmnSemanticQualityIssues(saga).some((issue) => issue.includes('补偿')))
})

test('creates and isolates all 15 semantic models', () => {
  assert.equal(BPMN_SEMANTIC_TYPES.length, 15)
  for (const semanticType of BPMN_SEMANTIC_TYPES) {
    const value = normalizeBpmnSemantic(
      { unknownField: 'discard', eventName: '名称', flowName: '路径' },
      semanticType,
      '默认名称',
    )
    assert.equal(value.semanticType, semanticType)
    assert.equal(value.schemaVersion, 1)
    assert.equal('unknownField' in value, false)
    assert.ok(bpmnSemanticDisplayName(value))
  }
})

test('rejects invalid enums and invalid gateway references', () => {
  const start = normalizeBpmnSemantic({ triggerType: 'INVALID' }, 'startEvent', '开始')
  const triggerType = (start as unknown as Record<string, string>).triggerType
  assert.equal(triggerType, 'manual')
  assert.equal(BPMN_SEMANTIC_ENUM_LABELS[triggerType], '人工触发')
  const gateway = normalizeBpmnSemantic({
    branches: [
      { flowId: 'flow-1', label: '成功', condition: 'ok' },
      { flowId: 'flow-1', label: '重复', condition: 'again' },
    ],
    defaultFlowId: 'flow-2',
  }, 'exclusiveGateway', '判断')
  const issues = bpmnSemanticQualityIssues(gateway)
  assert.ok(issues.some((issue) => issue.includes('重复')))
  assert.ok(issues.some((issue) => issue.includes('默认路径')))
})
