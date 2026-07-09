import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  BpmnBranchCondition,
  BpmnSemanticJson,
  BpmnSemanticType,
} from '@/entities/business-flow'
import {
  BPMN_SEMANTIC_ENUM_LABELS,
  bpmnSemanticQualityIssues,
  normalizeBpmnSemantic,
} from '@/entities/business-flow'

type FieldKind = 'text' | 'textarea' | 'list' | 'boolean' | 'number' | 'select'
type FieldSpec = {
  key: string
  label: string
  kind?: FieldKind
  options?: string[]
}
export type BpmnFlowOption = { value: string; label: string }

const COMMON_SCENARIOS = ['normal', 'exception', 'boundary', 'compensation']
const FIELDS: Record<BpmnSemanticType, FieldSpec[]> = {
  startEvent: [
    { key: 'eventName', label: '事件名称' },
    { key: 'triggerType', label: '触发方式', kind: 'select', options: ['manual', 'message', 'timer', 'signal', 'condition'] },
    { key: 'triggerSource', label: '触发来源' },
    { key: 'startCondition', label: '启动条件', kind: 'textarea' },
    { key: 'inputDataRefs', label: '输入数据', kind: 'list' },
    { key: 'initiator', label: '发起方' },
    { key: 'frequency', label: '触发频率' },
    { key: 'preCheckRules', label: '启动前校验规则', kind: 'list' },
  ],
  intermediateEvent: [
    { key: 'eventName', label: '事件名称' },
    { key: 'catchOrThrow', label: '事件行为', kind: 'select', options: ['catch', 'throw'] },
    { key: 'eventDefinition', label: '事件定义', kind: 'select', options: ['message', 'timer', 'error', 'signal', 'compensation', 'escalation'] },
    { key: 'interrupting', label: '是否中断当前流程', kind: 'boolean' },
    { key: 'timeout', label: '超时时间' },
    { key: 'messageName', label: '消息名称' },
    { key: 'errorCode', label: '错误码' },
    { key: 'escalationCode', label: '升级码' },
    { key: 'businessMeaning', label: '业务含义', kind: 'textarea' },
  ],
  endEvent: [
    { key: 'eventName', label: '事件名称' },
    { key: 'resultType', label: '结果类型', kind: 'select', options: ['success', 'failure', 'cancel', 'terminate', 'error', 'compensation'] },
    { key: 'finalBusinessState', label: '最终业务状态' },
    { key: 'outputDataRefs', label: '输出数据', kind: 'list' },
    { key: 'notifyTargets', label: '通知对象', kind: 'list' },
    { key: 'auditRequired', label: '需要审计', kind: 'boolean' },
    { key: 'rollbackRequired', label: '需要回滚或补偿', kind: 'boolean' },
  ],
  transaction: [
    { key: 'transactionName', label: '事务名称' },
    { key: 'transactionType', label: '事务类型', kind: 'select', options: ['technical', 'business', 'saga'] },
    { key: 'successCriteria', label: '成功条件', kind: 'list' },
    { key: 'cancelTriggers', label: '取消触发条件', kind: 'list' },
    { key: 'compensationPolicy', label: '补偿策略' },
    { key: 'compensationOrder', label: '补偿顺序', kind: 'select', options: ['reverseOrder', 'forwardOrder', 'custom'] },
    { key: 'consistencyLevel', label: '一致性级别', kind: 'select', options: ['strong', 'eventual'] },
    { key: 'timeout', label: '事务超时' },
    { key: 'isolationNote', label: '隔离性说明', kind: 'textarea' },
    { key: 'compensationTasks', label: '补偿活动', kind: 'list' },
    { key: 'partialSuccessPolicy', label: '部分成功策略', kind: 'textarea' },
    { key: 'auditRequired', label: '需要审计', kind: 'boolean' },
  ],
  exclusiveGateway: [
    { key: 'decisionName', label: '决策名称' },
    { key: 'decisionVariable', label: '判断变量' },
    { key: 'defaultFlowId', label: '默认路径' },
    { key: 'conditionExpressionType', label: '条件表达式类型', kind: 'select', options: ['naturalLanguage', 'feel', 'javascript', 'sql'] },
    { key: 'mutuallyExclusive', label: '分支条件互斥', kind: 'boolean' },
    { key: 'coverageRequired', label: '要求覆盖全部分支', kind: 'boolean' },
  ],
  inclusiveGateway: [
    { key: 'decisionName', label: '决策名称' },
    { key: 'allowMultipleBranches', label: '允许多分支同时命中', kind: 'boolean' },
    { key: 'mergePolicy', label: '合并策略' },
    { key: 'minSelectedBranches', label: '最少命中分支数', kind: 'number' },
    { key: 'coverageRequired', label: '要求覆盖全部分支', kind: 'boolean' },
  ],
  parallelGateway: [
    { key: 'gatewayName', label: '网关名称' },
    { key: 'parallelMode', label: '并行模式', kind: 'select', options: ['fork', 'join', 'forkJoin'] },
    { key: 'waitForAll', label: '等待全部分支', kind: 'boolean' },
    { key: 'expectedBranches', label: '预期分支', kind: 'list' },
    { key: 'partialFailurePolicy', label: '部分失败策略', kind: 'textarea' },
    { key: 'timeout', label: '等待超时' },
    { key: 'concurrencyLimit', label: '并发限制', kind: 'number' },
  ],
  complexGateway: [
    { key: 'gatewayName', label: '网关名称' },
    { key: 'activationCondition', label: '激活条件', kind: 'textarea' },
    { key: 'completionCondition', label: '完成条件', kind: 'textarea' },
    { key: 'requiredCount', label: '要求完成数量', kind: 'number' },
    { key: 'totalCount', label: '总分支数量', kind: 'number' },
    { key: 'customRule', label: '自定义规则', kind: 'textarea' },
    { key: 'explanation', label: '业务解释', kind: 'textarea' },
  ],
  dataObject: [
    { key: 'dataName', label: '数据名称' },
    { key: 'entityName', label: '业务实体' },
    { key: 'schemaRef', label: '数据结构引用' },
    { key: 'lifecycleState', label: '生命周期状态' },
    { key: 'ownerActivityRef', label: '产生或修改活动' },
    { key: 'readByRefs', label: '读取活动', kind: 'list' },
    { key: 'writeByRefs', label: '写入活动', kind: 'list' },
  ],
  dataInput: [
    { key: 'dataName', label: '数据名称' },
    { key: 'sourceType', label: '来源类型', kind: 'select', options: ['user', 'system', 'api', 'message', 'file'] },
    { key: 'sourceRef', label: '来源引用' },
    { key: 'required', label: '必填', kind: 'boolean' },
    { key: 'validationRules', label: '校验规则', kind: 'list' },
    { key: 'exampleValue', label: '示例值', kind: 'textarea' },
    { key: 'sensitiveLevel', label: '敏感等级', kind: 'select', options: ['normal', 'internal', 'confidential'] },
    { key: 'defaultValue', label: '默认值' },
  ],
  dataOutput: [
    { key: 'dataName', label: '数据名称' },
    { key: 'targetType', label: '目标类型', kind: 'select', options: ['api', 'database', 'message', 'file', 'ui'] },
    { key: 'targetRef', label: '目标引用' },
    { key: 'outputContract', label: '输出契约', kind: 'textarea' },
    { key: 'transformRule', label: '转换规则', kind: 'textarea' },
    { key: 'successOutput', label: '成功输出', kind: 'textarea' },
    { key: 'failureOutput', label: '失败输出', kind: 'textarea' },
  ],
  dataStore: [
    { key: 'dataName', label: '数据名称' },
    { key: 'storeType', label: '存储类型', kind: 'select', options: ['database', 'cache', 'file', 'mq', 'externalSystem'] },
    { key: 'systemRef', label: '所属系统' },
    { key: 'accessMode', label: '访问模式', kind: 'select', options: ['read', 'write', 'readWrite'] },
    { key: 'consistencyLevel', label: '一致性级别', kind: 'select', options: ['strong', 'eventual'] },
    { key: 'retentionPolicy', label: '保留策略', kind: 'textarea' },
    { key: 'privacyLevel', label: '隐私等级', kind: 'select', options: ['normal', 'internal', 'confidential'] },
  ],
  sequenceFlow: [
    { key: 'flowName', label: '路径名称' },
    { key: 'flowKind', label: '路径类型', kind: 'select', options: ['normal', 'conditional', 'default', 'exception', 'compensation'] },
    { key: 'conditionText', label: '自然语言条件', kind: 'textarea' },
    { key: 'conditionExpression', label: '条件表达式', kind: 'textarea' },
    { key: 'conditionExpressionType', label: '表达式类型', kind: 'select', options: ['naturalLanguage', 'feel', 'javascript', 'sql'] },
    { key: 'priority', label: '分支优先级', kind: 'number' },
    { key: 'isDefault', label: '默认路径', kind: 'boolean' },
    { key: 'businessRuleRefs', label: '业务规则引用', kind: 'list' },
    { key: 'testScenarioType', label: '测试场景类型', kind: 'select', options: COMMON_SCENARIOS },
    { key: 'expectedResult', label: '预期结果', kind: 'textarea' },
  ],
  messageFlow: [
    { key: 'messageName', label: '消息名称' },
    { key: 'businessMeaning', label: '业务含义', kind: 'textarea' },
    { key: 'senderRef', label: '发送方' },
    { key: 'receiverRef', label: '接收方' },
    { key: 'payloadDataRefs', label: '负载数据', kind: 'list' },
    { key: 'deliveryMode', label: '投递方式', kind: 'select', options: ['sync', 'async'] },
    { key: 'timeout', label: '等待超时' },
    { key: 'testScenarioType', label: '测试场景类型', kind: 'select', options: COMMON_SCENARIOS },
    { key: 'expectedResult', label: '预期结果', kind: 'textarea' },
  ],
  association: [
    { key: 'associationName', label: '关联名称' },
    { key: 'businessMeaning', label: '关联含义', kind: 'textarea' },
    { key: 'direction', label: '关联方向', kind: 'select', options: ['none', 'oneWay', 'twoWay'] },
    { key: 'dataRole', label: '数据角色', kind: 'select', options: ['input', 'output', 'reference'] },
    { key: 'testScenarioType', label: '测试场景类型', kind: 'select', options: COMMON_SCENARIOS },
    { key: 'expectedResult', label: '预期结果', kind: 'textarea' },
  ],
}

const TYPE_TITLES: Record<BpmnSemanticType, string> = {
  startEvent: '开始事件',
  intermediateEvent: '中间事件',
  endEvent: '结束事件',
  transaction: '事务',
  exclusiveGateway: '排他网关',
  inclusiveGateway: '包容网关',
  parallelGateway: '并行网关',
  complexGateway: '复杂网关',
  dataObject: '数据对象',
  dataInput: '数据输入',
  dataOutput: '数据输出',
  dataStore: '数据存储',
  sequenceFlow: '顺序流',
  messageFlow: '消息流',
  association: '关联线',
}

function optionLabel(value: string) {
  return BPMN_SEMANTIC_ENUM_LABELS[value] ?? value
}

function BranchEditor({
  label,
  value,
  flowOptions,
  onChange,
}: {
  label: string
  value: BpmnBranchCondition[]
  flowOptions: BpmnFlowOption[]
  onChange: (value: BpmnBranchCondition[]) => void
}) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="添加分支"
          onClick={() => onChange([...value, { flowId: '', label: '', condition: '' }])}
        >
          <Plus />
        </Button>
      </div>
      <div className="space-y-2">
        {value.map((branch, index) => (
          <div key={`${index}-${branch.flowId}`} className="grid grid-cols-[1fr_auto] gap-2 border-l-2 pl-2">
            <div className="space-y-2">
              <Select
                value={branch.flowId || 'none'}
                onValueChange={(flowId) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, flowId: flowId === 'none' ? '' : flowId } : item))}
              >
                <SelectTrigger>
                  <SelectValue>{flowOptions.find((option) => option.value === branch.flowId)?.label ?? '选择实际连线'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未选择</SelectItem>
                  {flowOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={branch.label}
                placeholder="分支名称"
                onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
              />
              <Textarea
                rows={2}
                value={branch.condition}
                placeholder="分支条件"
                onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, condition: event.target.value } : item))}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="删除分支"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </Field>
  )
}

export function BpmnSemanticFields({
  value,
  semanticType,
  onChange,
  flowOptions = [],
  children,
}: {
  value: BpmnSemanticJson
  semanticType: BpmnSemanticType
  onChange: (value: BpmnSemanticJson) => void
  flowOptions?: BpmnFlowOption[]
  children?: ReactNode
}) {
  const normalized = normalizeBpmnSemantic(value, semanticType)
  const data = normalized as unknown as Record<string, unknown>
  const update = (key: string, next: unknown) => {
    onChange(normalizeBpmnSemantic({ ...data, [key]: next }, semanticType))
  }
  const branchKey =
    semanticType === 'exclusiveGateway'
      ? 'branches'
      : semanticType === 'inclusiveGateway'
        ? 'branchConditions'
        : null

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold">{TYPE_TITLES[semanticType]}</div>
      <FieldGroup>
        {FIELDS[semanticType].map((field) => {
          const kind = field.kind ?? 'text'
          if (semanticType === 'intermediateEvent') {
            const definitionFields: Record<string, string> = {
              timeout: 'timer',
              messageName: 'message',
              errorCode: 'error',
              escalationCode: 'escalation',
            }
            if (definitionFields[field.key] && definitionFields[field.key] !== data.eventDefinition) {
              return null
            }
          }
          if (field.key === 'defaultFlowId') {
            const current = String(data.defaultFlowId ?? '')
            return (
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <Select value={current || 'none'} onValueChange={(next) => update(field.key, next === 'none' ? '' : next)}>
                  <SelectTrigger>
                    <SelectValue>{flowOptions.find((option) => option.value === current)?.label ?? '未选择'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未选择</SelectItem>
                    {flowOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )
          }
          if (kind === 'boolean') {
            return (
              <Field key={field.key} orientation="horizontal">
                <Checkbox
                  checked={Boolean(data[field.key])}
                  onCheckedChange={(checked) => update(field.key, checked === true)}
                />
                <FieldLabel>{field.label}</FieldLabel>
              </Field>
            )
          }
          if (kind === 'select') {
            const current = String(data[field.key] ?? '')
            return (
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <Select value={current} onValueChange={(next) => update(field.key, next)}>
                  <SelectTrigger>
                    <SelectValue>{optionLabel(current)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? []).map((option) => (
                      <SelectItem key={option} value={option}>
                        {optionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )
          }
          if (kind === 'list') {
            return (
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <Textarea
                  rows={3}
                  value={(data[field.key] as string[] | undefined)?.join('\n') ?? ''}
                  onChange={(event) => update(field.key, event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))}
                />
              </Field>
            )
          }
          if (kind === 'textarea') {
            return (
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <Textarea rows={3} value={String(data[field.key] ?? '')} onChange={(event) => update(field.key, event.target.value)} />
              </Field>
            )
          }
          return (
            <Field key={field.key}>
              <FieldLabel>{field.label}</FieldLabel>
              <Input
                type={kind === 'number' ? 'number' : 'text'}
                value={data[field.key] === null ? '' : String(data[field.key] ?? '')}
                onChange={(event) => update(field.key, kind === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
              />
            </Field>
          )
        })}
        {branchKey ? (
          <BranchEditor
            label="分支条件"
            value={(data[branchKey] as BpmnBranchCondition[] | undefined) ?? []}
            flowOptions={flowOptions}
            onChange={(branches) => update(branchKey, branches)}
          />
        ) : null}
      </FieldGroup>
      {children}
      {bpmnSemanticQualityIssues(normalized).length ? (
        <div className="space-y-1 border-l-2 border-amber-500 pl-2 text-xs text-amber-700">
          {bpmnSemanticQualityIssues(normalized).map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
