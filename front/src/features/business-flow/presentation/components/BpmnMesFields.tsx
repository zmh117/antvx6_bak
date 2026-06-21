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
  MesSemantics,
} from '@/entities/business-flow'
import {
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
  normalizeMesSemantics,
} from '@/entities/business-flow'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Option<T extends string> = {
  value: T
  label: string
}

const ELEMENT_OPTIONS: Option<BpmnElementType>[] = [
  { value: 'EVENT', label: '事件' },
  { value: 'TASK', label: '任务' },
  { value: 'GATEWAY', label: '网关' },
  { value: 'SUB_PROCESS', label: '子流程' },
  { value: 'CALL_ACTIVITY', label: '调用活动' },
  { value: 'DATA_OBJECT', label: '数据对象' },
  { value: 'TEXT_ANNOTATION', label: '注释' },
]

const EVENT_KIND_OPTIONS: Option<BpmnEventKind>[] = [
  { value: 'START', label: '开始' },
  { value: 'INTERMEDIATE', label: '中间' },
  { value: 'END', label: '结束' },
  { value: 'BOUNDARY', label: '边界' },
]

const EVENT_DEFINITION_OPTIONS: Option<BpmnEventDefinition>[] = [
  { value: 'NONE', label: '无' },
  { value: 'MESSAGE', label: '消息' },
  { value: 'TIMER', label: '定时' },
  { value: 'ERROR', label: '错误' },
  { value: 'ESCALATION', label: '升级' },
  { value: 'CONDITIONAL', label: '条件' },
  { value: 'SIGNAL', label: '信号' },
  { value: 'LINK', label: '链接' },
  { value: 'MULTIPLE', label: '多重' },
  { value: 'TERMINATE', label: '终止' },
  { value: 'CANCEL', label: '取消' },
  { value: 'COMPENSATION', label: '补偿' },
]

const TASK_TYPE_OPTIONS: Option<BpmnTaskType>[] = [
  { value: 'NONE', label: '普通任务' },
  { value: 'USER', label: '用户任务' },
  { value: 'SERVICE', label: '服务任务' },
  { value: 'MANUAL', label: '人工任务' },
  { value: 'SCRIPT', label: '脚本任务' },
  { value: 'BUSINESS_RULE', label: '规则任务' },
  { value: 'RECEIVE', label: '接收任务' },
  { value: 'SEND', label: '发送任务' },
]

const GATEWAY_TYPE_OPTIONS: Option<BpmnGatewayType>[] = [
  { value: 'EXCLUSIVE', label: '排他网关' },
  { value: 'PARALLEL', label: '并行网关' },
  { value: 'INCLUSIVE', label: '包容网关' },
  { value: 'EVENT_BASED', label: '事件网关' },
  { value: 'COMPLEX', label: '复杂网关' },
]

const SUB_PROCESS_OPTIONS: Option<BpmnSubProcessKind>[] = [
  { value: 'EMBEDDED', label: '嵌入子流程' },
  { value: 'TRANSACTION', label: '事务子流程' },
  { value: 'EVENT_SUB_PROCESS', label: '事件子流程' },
]

const FLOW_TYPE_OPTIONS: Option<BpmnFlowType>[] = [
  { value: 'SEQUENCE', label: '顺序流' },
  { value: 'MESSAGE', label: '消息流' },
  { value: 'ASSOCIATION', label: '关联线' },
]

const SEQUENCE_KIND_OPTIONS: Option<BpmnSequenceFlowKind>[] = [
  { value: 'NORMAL', label: '普通' },
  { value: 'CONDITIONAL', label: '条件' },
  { value: 'DEFAULT', label: '默认' },
  { value: 'EXCEPTION', label: '异常' },
]

function optionLabel<T extends string>(options: Option<T>[], value?: T | null) {
  return options.find((option) => option.value === value)?.label ?? ''
}

function CsvField({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea
        rows={2}
        value={(value ?? []).join('\n')}
        onChange={(event) => onChange(parseList(event.target.value))}
      />
    </Field>
  )
}

function parseList(value: string) {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function selectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger>
          <SelectValue>{optionLabel(options, value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export function BpmnNodeProfileFields({
  profile,
  onChange,
}: {
  profile: BpmnNodeProfile
  onChange: (profile: BpmnNodeProfile) => void
}) {
  const update = (patch: Partial<BpmnNodeProfile>) => {
    onChange(normalizeBpmnNodeProfile({ ...profile, ...patch }))
  }

  return (
    <FieldGroup>
      {selectField({
        label: 'BPMN 元素',
        value: profile.bpmnElementType,
        options: ELEMENT_OPTIONS,
        onChange: (bpmnElementType) => update({ bpmnElementType }),
      })}
      {profile.bpmnElementType === 'EVENT'
        ? (
            <>
              {selectField({
                label: '事件阶段',
                value: profile.bpmnEventKind ?? 'INTERMEDIATE',
                options: EVENT_KIND_OPTIONS,
                onChange: (bpmnEventKind) => update({ bpmnEventKind }),
              })}
              {selectField({
                label: '事件定义',
                value: profile.bpmnEventDefinition ?? 'NONE',
                options: EVENT_DEFINITION_OPTIONS,
                onChange: (bpmnEventDefinition) => update({ bpmnEventDefinition }),
              })}
              {profile.bpmnEventKind === 'BOUNDARY' ? (
                <Field>
                  <FieldLabel>附着节点 Key</FieldLabel>
                  <Input
                    value={profile.bpmnBoundaryAttachedToNodeKey ?? ''}
                    onChange={(event) =>
                      update({
                        bpmnBoundaryAttachedToNodeKey:
                          event.target.value.trim() || null,
                      })
                    }
                  />
                </Field>
              ) : null}
            </>
          )
        : null}
      {profile.bpmnElementType === 'TASK'
        ? selectField({
            label: '任务类型',
            value: profile.bpmnTaskType ?? 'NONE',
            options: TASK_TYPE_OPTIONS,
            onChange: (bpmnTaskType) => update({ bpmnTaskType }),
          })
        : null}
      {profile.bpmnElementType === 'GATEWAY'
        ? selectField({
            label: '网关类型',
            value: profile.bpmnGatewayType ?? 'EXCLUSIVE',
            options: GATEWAY_TYPE_OPTIONS,
            onChange: (bpmnGatewayType) => update({ bpmnGatewayType }),
          })
        : null}
      {profile.bpmnElementType === 'SUB_PROCESS'
        ? selectField({
            label: '子流程类型',
            value: profile.bpmnSubProcessKind ?? 'EMBEDDED',
            options: SUB_PROCESS_OPTIONS,
            onChange: (bpmnSubProcessKind) => update({ bpmnSubProcessKind }),
          })
        : null}
      {profile.bpmnElementType === 'CALL_ACTIVITY' ? (
        <Field>
          <FieldLabel>调用目标</FieldLabel>
          <Input
            value={profile.bpmnCallActivityRef ?? ''}
            onChange={(event) =>
              update({ bpmnCallActivityRef: event.target.value.trim() || null })
            }
          />
        </Field>
      ) : null}
    </FieldGroup>
  )
}

export function BpmnEdgeProfileFields({
  profile,
  onChange,
}: {
  profile: BpmnEdgeProfile
  onChange: (profile: BpmnEdgeProfile) => void
}) {
  const update = (patch: Partial<BpmnEdgeProfile>) => {
    onChange(normalizeBpmnEdgeProfile({ ...profile, ...patch }))
  }

  return (
    <FieldGroup>
      {selectField({
        label: 'BPMN 连线',
        value: profile.bpmnFlowType,
        options: FLOW_TYPE_OPTIONS,
        onChange: (bpmnFlowType) => update({ bpmnFlowType }),
      })}
      {profile.bpmnFlowType === 'SEQUENCE'
        ? (
            <>
              {selectField({
                label: '顺序流类型',
                value: profile.bpmnSequenceFlowKind ?? 'NORMAL',
                options: SEQUENCE_KIND_OPTIONS,
                onChange: (bpmnSequenceFlowKind) =>
                  update({ bpmnSequenceFlowKind }),
              })}
              <Field>
                <FieldLabel>条件表达式</FieldLabel>
                <Textarea
                  rows={2}
                  value={profile.bpmnConditionExpression ?? ''}
                  onChange={(event) =>
                    update({
                      bpmnConditionExpression:
                        event.target.value.trim() || null,
                    })
                  }
                />
              </Field>
            </>
          )
        : null}
      {profile.bpmnFlowType === 'MESSAGE' ? (
        <Field>
          <FieldLabel>消息名称</FieldLabel>
          <Input
            value={profile.bpmnMessageName ?? ''}
            onChange={(event) =>
              update({ bpmnMessageName: event.target.value.trim() || null })
            }
          />
        </Field>
      ) : null}
    </FieldGroup>
  )
}

export function MesSemanticsFields({
  value,
  onChange,
}: {
  value?: MesSemantics | null
  onChange: (value: MesSemantics) => void
}) {
  const current = normalizeMesSemantics(value)
  const update = (patch: Partial<MesSemantics>) => {
    onChange(normalizeMesSemantics({ ...current, ...patch }))
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>主配方</FieldLabel>
        <Input
          value={current.masterRecipe ?? ''}
          onChange={(event) =>
            update({ masterRecipe: event.target.value.trim() || null })
          }
        />
      </Field>
      <Field>
        <FieldLabel>处方</FieldLabel>
        <Input
          value={current.recipe ?? ''}
          onChange={(event) => update({ recipe: event.target.value.trim() || null })}
        />
      </Field>
      <CsvField
        label="变量"
        value={current.variables}
        onChange={(variables) => update({ variables })}
      />
      <CsvField
        label="系统配置"
        value={current.systemConfigs}
        onChange={(systemConfigs) => update({ systemConfigs })}
      />
      <CsvField
        label="生产流程步骤"
        value={current.controlSteps}
        onChange={(controlSteps) => update({ controlSteps })}
      />
      <CsvField
        label="控件"
        value={current.controls}
        onChange={(controls) => update({ controls })}
      />
      <CsvField
        label="投入物料"
        value={current.materialInputs}
        onChange={(materialInputs) => update({ materialInputs })}
      />
      <CsvField
        label="产出物料"
        value={current.materialOutputs}
        onChange={(materialOutputs) => update({ materialOutputs })}
      />
      <Field>
        <FieldLabel>物料使用记录</FieldLabel>
        <Input
          value={current.materialUsageRecord ?? ''}
          onChange={(event) =>
            update({ materialUsageRecord: event.target.value.trim() || null })
          }
        />
      </Field>
      <CsvField
        label="批记录字段"
        value={current.batchRecordFields}
        onChange={(batchRecordFields) => update({ batchRecordFields })}
      />
      <CsvField
        label="审计追踪事件"
        value={current.auditEvents}
        onChange={(auditEvents) => update({ auditEvents })}
      />
      <Field>
        <FieldLabel>电子签名</FieldLabel>
        <Input
          value={current.electronicSignature ?? ''}
          onChange={(event) =>
            update({ electronicSignature: event.target.value.trim() || null })
          }
        />
      </Field>
      <Field>
        <FieldLabel>MES 备注</FieldLabel>
        <Textarea
          rows={3}
          value={current.notes ?? ''}
          onChange={(event) => update({ notes: event.target.value.trim() || null })}
        />
      </Field>
    </FieldGroup>
  )
}
