import type {
  BpmnEdgeProfile,
  BpmnFlowType,
  BpmnNodeProfile,
  BpmnSequenceFlowKind,
} from '@/entities/business-flow'
import {
  BPMN_NODE_OPTIONS,
  bpmnNodeOptionKey,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
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
  const selectedKey = bpmnNodeOptionKey(profile)

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>BPMN 节点类型</FieldLabel>
        <Select
          value={selectedKey}
          onValueChange={(key) => {
            const option = BPMN_NODE_OPTIONS.find((item) => item.key === key)
            if (option) onChange(normalizeBpmnNodeProfile(option.profile))
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {BPMN_NODE_OPTIONS.find((item) => item.key === selectedKey)?.label ?? '任务'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(['事件', '活动', '网关', '数据'] as const).map((group) => (
              <SelectGroup key={group}>
                {BPMN_NODE_OPTIONS.filter((option) => option.group === group).map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {group} · {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {profile.bpmnElementType === 'CALL_ACTIVITY' ? (
        <Field>
          <FieldLabel>调用目标</FieldLabel>
          <Input
            value={profile.bpmnCallActivityRef ?? ''}
            onChange={(event) =>
              onChange(
                normalizeBpmnNodeProfile({
                  ...profile,
                  bpmnCallActivityRef: event.target.value.trim() || null,
                }),
              )
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
