import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import {
  TASK_UI_ACTIONS_BY_ELEMENT,
  TASK_UI_ACTION_TYPES,
  TASK_UI_ELEMENT_TYPES,
  normalizeProcessContainerConfig,
  normalizeTaskUiContext,
  textArrayValue,
  type ProcessContainerConfig,
  type TaskUiContext,
  type TaskUiOperationStep,
} from '@/entities/business-flow'

export function TaskUiContextFields({
  value,
  onChange,
}: {
  value: TaskUiContext | null
  onChange: (value: TaskUiContext) => void
}) {
  const data = normalizeTaskUiContext(value)
  const update = (next: Partial<TaskUiContext>) => onChange({ ...data, ...next })
  const updateStep = (index: number, patch: Partial<TaskUiOperationStep>) => {
    update({
      uiSteps: data.uiSteps.map((step, itemIndex) => (
        itemIndex === index ? { ...step, ...patch, stepNo: itemIndex + 1 } : { ...step, stepNo: itemIndex + 1 }
      )),
    })
  }
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">Task Web 用例上下文</div>
      <FieldGroup>
        <Field>
          <FieldLabel>页面名称</FieldLabel>
          <Input value={data.page?.pageName ?? ''} onChange={(event) => update({ page: { ...data.page, pageName: event.target.value } })} />
        </Field>
        <Field>
          <FieldLabel>路由模式</FieldLabel>
          <Input value={data.page?.routePattern ?? ''} onChange={(event) => update({ page: { ...data.page, routePattern: event.target.value } })} />
        </Field>
        <Field>
          <FieldLabel>模块</FieldLabel>
          <Input value={data.page?.moduleName ?? ''} onChange={(event) => update({ page: { ...data.page, moduleName: event.target.value } })} />
        </Field>
      </FieldGroup>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold">UI Steps</div>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ uiSteps: [...data.uiSteps, newStep(data.uiSteps.length + 1)] })}>
            <Plus className="mr-1 size-3" />
            添加
          </Button>
        </div>
        {data.uiSteps.map((step, index) => {
          const actions = TASK_UI_ACTIONS_BY_ELEMENT[step.elementType as keyof typeof TASK_UI_ACTIONS_BY_ELEMENT] ?? TASK_UI_ACTION_TYPES
          return (
            <div key={step.id} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">#{index + 1}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => update({ uiSteps: data.uiSteps.filter((_, itemIndex) => itemIndex !== index) })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={String(step.elementType || 'Input')} onValueChange={(elementType) => updateStep(index, { elementType, actionType: (TASK_UI_ACTIONS_BY_ELEMENT[elementType as keyof typeof TASK_UI_ACTIONS_BY_ELEMENT] ?? TASK_UI_ACTION_TYPES)[0] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_UI_ELEMENT_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={String(step.actionType || actions[0])} onValueChange={(actionType) => updateStep(index, { actionType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{actions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input placeholder="控件名称" value={step.elementName} onChange={(event) => updateStep(index, { elementName: event.target.value })} />
              <Input placeholder="输入值或选择值" value={typeof step.value === 'string' || typeof step.value === 'number' ? String(step.value) : ''} onChange={(event) => updateStep(index, { value: event.target.value })} />
              <Textarea rows={2} placeholder="业务含义" value={step.businessMeaning ?? ''} onChange={(event) => updateStep(index, { businessMeaning: event.target.value })} />
              <Textarea rows={2} placeholder="预期结果" value={step.expectedResult ?? ''} onChange={(event) => updateStep(index, { expectedResult: event.target.value })} />
              <Textarea rows={2} placeholder="负向用例提示，每行一个" value={(step.negativeTestHints ?? []).join('\n')} onChange={(event) => updateStep(index, { negativeTestHints: textArrayValue(event.target.value) })} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProcessContainerFields({
  value,
  onChange,
}: {
  value: ProcessContainerConfig | null
  onChange: (value: ProcessContainerConfig) => void
}) {
  const data = normalizeProcessContainerConfig(value)
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">流程容器</div>
      <FieldGroup>
        <Field>
          <FieldLabel>模式</FieldLabel>
          <Select value={data.containerMode} onValueChange={(containerMode) => onChange({ ...data, containerMode: containerMode as ProcessContainerConfig['containerMode'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="embedded">embedded</SelectItem>
              <SelectItem value="reusableCall">reusableCall</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {data.containerMode === 'reusableCall' ? (
          <>
            <Field><FieldLabel>被调用流程</FieldLabel><Input value={data.calledProcessRef ?? ''} onChange={(event) => onChange({ ...data, calledProcessRef: event.target.value })} /></Field>
            <Field><FieldLabel>版本策略</FieldLabel><Input value={data.calledProcessVersion ?? ''} onChange={(event) => onChange({ ...data, calledProcessVersion: event.target.value })} /></Field>
          </>
        ) : null}
      </FieldGroup>
    </div>
  )
}

function newStep(stepNo: number): TaskUiOperationStep {
  return {
    id: `ui_step_${Date.now().toString(36)}_${stepNo}`,
    stepNo,
    elementType: 'Input',
    elementName: '',
    actionType: 'input',
    value: '',
    businessMeaning: '',
    expectedResult: '',
    negativeTestHints: [],
  }
}
