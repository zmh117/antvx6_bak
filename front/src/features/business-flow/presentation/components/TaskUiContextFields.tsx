import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

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
  TASK_UI_ACTION_TYPE_LABELS,
  TASK_UI_ELEMENT_TYPES,
  TASK_UI_ELEMENT_TYPE_LABELS,
  TASK_UI_TASK_TYPES,
  TASK_UI_TASK_TYPE_LABELS,
  TASK_UI_VALUE_SOURCES,
  TASK_UI_VALUE_SOURCE_LABELS,
  normalizeTaskUiContext,
  taskUiQualityIssues,
  textArrayValue,
  type TaskUiActionType,
  type TaskUiColumn,
  type TaskUiContext,
  type TaskUiElementType,
  type TaskUiOperationStep,
  type TaskUiOption,
} from '@/entities/business-flow'

export function TaskUiContextFields({
  value,
  fallbackTaskName,
  onChange,
}: {
  value: TaskUiContext | null
  fallbackTaskName?: string | null
  onChange: (value: TaskUiContext) => void
}) {
  const data = normalizeTaskUiContext(value, { taskName: fallbackTaskName })
  const update = (next: Partial<TaskUiContext>) => onChange(normalizeTaskUiContext({ ...data, ...next }))
  const updatePage = (patch: Partial<NonNullable<TaskUiContext['page']>>) => {
    update({ page: { ...data.page, ...patch } })
  }
  const updateStep = (index: number, patch: Partial<TaskUiOperationStep>) => {
    update({
      uiSteps: data.uiSteps.map((step, itemIndex) => (
        itemIndex === index ? { ...step, ...patch, stepNo: itemIndex + 1 } : { ...step, stepNo: itemIndex + 1 }
      )),
    })
  }
  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= data.uiSteps.length) return
    const next = [...data.uiSteps]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    update({ uiSteps: next.map((step, itemIndex) => ({ ...step, stepNo: itemIndex + 1 })) })
  }
  const issues = taskUiQualityIssues(data)
  return (
    <div className="space-y-4">
      <SectionTitle>基础信息</SectionTitle>
      <FieldGroup>
        <Field>
          <FieldLabel>任务名称</FieldLabel>
          <Input value={data.taskName ?? ''} onChange={(event) => update({ taskName: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel>任务类型</FieldLabel>
          <Select value={String(data.taskType || 'userTask')} onValueChange={(taskType) => update({ taskType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_UI_TASK_TYPES.map((item) => <SelectItem key={item} value={item}>{TASK_UI_TASK_TYPE_LABELS[item]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <TextField label="执行角色" value={data.actor ?? ''} onChange={(actor) => update({ actor })} />
        <TextAreaField label="业务目的" value={data.businessIntent ?? ''} onChange={(businessIntent) => update({ businessIntent })} />
        <TextListField label="业务规则" value={data.businessRules ?? []} onChange={(businessRules) => update({ businessRules })} />
        <TextListField label="前置条件" value={data.preconditions ?? []} onChange={(preconditions) => update({ preconditions })} />
        <TextListField label="后置结果" value={data.postconditions ?? []} onChange={(postconditions) => update({ postconditions })} />
      </FieldGroup>

      <SectionTitle>页面信息</SectionTitle>
      <FieldGroup>
        <TextField label="页面名称" value={data.page?.pageName ?? ''} onChange={(pageName) => updatePage({ pageName })} />
        <TextField label="URL" value={data.page?.urlPattern ?? data.page?.routePattern ?? ''} onChange={(urlPattern) => updatePage({ urlPattern, routePattern: urlPattern })} />
        <TextField label="所属模块" value={data.page?.moduleName ?? ''} onChange={(moduleName) => updatePage({ moduleName })} />
      </FieldGroup>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle>UI 操作步骤</SectionTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ uiSteps: [...data.uiSteps, newStep(data.uiSteps.length + 1)] })}>
            <Plus className="mr-1 size-3" />
            添加步骤
          </Button>
        </div>
        {data.uiSteps.map((step, index) => {
          const elementType = step.elementType as TaskUiElementType
          const actions = TASK_UI_ACTIONS_BY_ELEMENT[elementType] ?? TASK_UI_ACTIONS_BY_ELEMENT.Input
          return (
            <div key={step.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">第 {index + 1} 步</div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveStep(index, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={index === data.uiSteps.length - 1} onClick={() => moveStep(index, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => update({ uiSteps: data.uiSteps.filter((_, itemIndex) => itemIndex !== index) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel>元素类型</FieldLabel>
                  <Select
                    value={elementType}
                    onValueChange={(nextElementType) => {
                      const nextActions = TASK_UI_ACTIONS_BY_ELEMENT[nextElementType as TaskUiElementType] ?? TASK_UI_ACTIONS_BY_ELEMENT.Input
                      updateStep(index, {
                        elementType: nextElementType,
                        actionType: nextActions.includes(step.actionType as TaskUiActionType) ? step.actionType : nextActions[0],
                      })
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_UI_ELEMENT_TYPES.map((item) => <SelectItem key={item} value={item}>{TASK_UI_ELEMENT_TYPE_LABELS[item]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>操作动作</FieldLabel>
                  <Select value={String(step.actionType || actions[0])} onValueChange={(actionType) => updateStep(index, { actionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {actions.map((item) => <SelectItem key={item} value={item}>{TASK_UI_ACTION_TYPE_LABELS[item]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <TextField label="元素名称" value={step.elementName} onChange={(elementName) => updateStep(index, { elementName })} />
              <TextField label="元素定位说明" value={step.elementLocationHint ?? ''} onChange={(elementLocationHint) => updateStep(index, { elementLocationHint })} />
              <TextField label="输入值或选择值" value={valueToText(step.value)} onChange={(nextValue) => updateStep(index, { value: nextValue })} />
              <Field>
                <FieldLabel>值来源</FieldLabel>
                <Select value={String(step.valueSource || 'fixed')} onValueChange={(valueSource) => updateStep(index, { valueSource })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_UI_VALUE_SOURCES.map((item) => <SelectItem key={item} value={item}>{TASK_UI_VALUE_SOURCE_LABELS[item]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <BooleanField label="是否必填" checked={Boolean(step.required)} onChange={(required) => updateStep(index, { required })} />
              <TextAreaField label="业务含义" value={step.businessMeaning ?? ''} onChange={(businessMeaning) => updateStep(index, { businessMeaning })} />
              <TextAreaField label="预期状态" value={step.expectedState ?? ''} onChange={(expectedState) => updateStep(index, { expectedState })} />
              <TextAreaField label="预期结果" value={step.expectedResult ?? ''} onChange={(expectedResult) => updateStep(index, { expectedResult })} />
              <BooleanField label="是否截图" checked={Boolean(step.screenshotRequired)} onChange={(screenshotRequired) => updateStep(index, { screenshotRequired })} />
              <TextField label="等待条件" value={step.waitCondition ?? ''} onChange={(waitCondition) => updateStep(index, { waitCondition })} />
              <TextListField label="负向用例提示" value={step.negativeTestHints ?? []} onChange={(negativeTestHints) => updateStep(index, { negativeTestHints })} />
              <StepSpecificFields step={step} onChange={(patch) => updateStep(index, patch)} />
            </div>
          )
        })}
        {issues.length ? (
          <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
            {issues.map((issue) => <div key={issue}>{issue}</div>)}
          </div>
        ) : null}
      </div>

      <SectionTitle>断言与预期</SectionTitle>
      <FieldGroup>
        <TextListField label="输入数据" value={data.inputDataRefs ?? []} onChange={(inputDataRefs) => update({ inputDataRefs })} />
        <TextListField label="输出数据" value={data.outputDataRefs ?? []} onChange={(outputDataRefs) => update({ outputDataRefs })} />
        <TextListField label="预期结果" value={data.expectedResults ?? []} onChange={(expectedResults) => update({ expectedResults })} />
        <TextListField label="断言" value={(data.assertions ?? []).map(assertionToText)} onChange={(assertions) => update({ assertions })} />
        <TextListField label="Mock 需求" value={data.mockRequirements ?? []} onChange={(mockRequirements) => update({ mockRequirements })} />
      </FieldGroup>
    </div>
  )
}

function StepSpecificFields({
  step,
  onChange,
}: {
  step: TaskUiOperationStep
  onChange: (patch: Partial<TaskUiOperationStep>) => void
}) {
  const elementType = step.elementType as TaskUiElementType
  if (elementType === 'Button') {
    return (
      <FieldGroup>
        <TextField label="按钮文本" value={step.buttonText ?? ''} onChange={(buttonText) => onChange({ buttonText })} />
        <TextField label="按钮角色" value={step.buttonRole ?? ''} onChange={(buttonRole) => onChange({ buttonRole })} />
        <TextField label="禁用条件" value={step.disabledCondition ?? ''} onChange={(disabledCondition) => onChange({ disabledCondition })} />
        <BooleanField label="是否需要确认" checked={Boolean(step.confirmRequired)} onChange={(confirmRequired) => onChange({ confirmRequired })} />
        <BooleanField label="是否出现加载" checked={Boolean(step.loadingExpected)} onChange={(loadingExpected) => onChange({ loadingExpected })} />
      </FieldGroup>
    )
  }
  if (elementType === 'Input' || elementType === 'Textarea') {
    return (
      <FieldGroup>
        {elementType === 'Input' ? <TextField label="输入类型" value={step.inputType ?? ''} onChange={(inputType) => onChange({ inputType })} /> : null}
        <TextField label="占位符" value={step.placeholder ?? ''} onChange={(placeholder) => onChange({ placeholder })} />
        <TextField label="最小长度" value={numberToText(step.minLength)} onChange={(minLength) => onChange({ minLength: numberFromText(minLength) })} />
        <TextField label="最大长度" value={numberToText(step.maxLength)} onChange={(maxLength) => onChange({ maxLength: numberFromText(maxLength) })} />
        <TextField label="格式规则" value={step.pattern ?? ''} onChange={(pattern) => onChange({ pattern })} />
        <TextField label="默认值" value={valueToText(step.defaultValue)} onChange={(defaultValue) => onChange({ defaultValue })} />
        <TextListField label="测试值" value={step.testValues ?? []} onChange={(testValues) => onChange({ testValues })} />
        <TextListField label="非法值" value={step.invalidValues ?? []} onChange={(invalidValues) => onChange({ invalidValues })} />
        <BooleanField label="输入前是否清空" checked={Boolean(step.clearBeforeInput)} onChange={(clearBeforeInput) => onChange({ clearBeforeInput })} />
        {elementType === 'Textarea' ? (
          <>
            <TextField label="行数" value={numberToText(step.rows)} onChange={(rows) => onChange({ rows: numberFromText(rows) })} />
            <BooleanField label="是否允许换行" checked={Boolean(step.allowLineBreak)} onChange={(allowLineBreak) => onChange({ allowLineBreak })} />
            <BooleanField label="是否敏感信息" checked={Boolean(step.sensitive)} onChange={(sensitive) => onChange({ sensitive })} />
          </>
        ) : null}
      </FieldGroup>
    )
  }
  if (elementType === 'Select' || elementType === 'RadioGroup') {
    return (
      <FieldGroup>
        <OptionsField label="选项" value={step.options ?? []} onChange={(options) => onChange({ options })} />
        <TextField label="默认值" value={valueToText(step.defaultValue)} onChange={(defaultValue) => onChange({ defaultValue })} />
        <TextField label="已选值" value={valueToText(step.selectedValue)} onChange={(selectedValue) => onChange({ selectedValue })} />
        {elementType === 'Select' ? (
          <>
            <BooleanField label="是否多选" checked={Boolean(step.multiple)} onChange={(multiple) => onChange({ multiple })} />
            <BooleanField label="是否可搜索" checked={Boolean(step.searchable)} onChange={(searchable) => onChange({ searchable })} />
            <BooleanField label="是否可清空" checked={Boolean(step.clearable)} onChange={(clearable) => onChange({ clearable })} />
            <TextField label="选项来源" value={step.optionSource ?? ''} onChange={(optionSource) => onChange({ optionSource })} />
            <TextField label="选项接口说明" value={step.optionApiRef ?? ''} onChange={(optionApiRef) => onChange({ optionApiRef })} />
          </>
        ) : (
          <TextField label="布局" value={step.layout ?? ''} onChange={(layout) => onChange({ layout })} />
        )}
        <TextListField label="禁用选项" value={step.disabledOptions ?? []} onChange={(disabledOptions) => onChange({ disabledOptions })} />
      </FieldGroup>
    )
  }
  if (elementType === 'Checkbox') {
    return (
      <FieldGroup>
        <BooleanField label="是否选中" checked={Boolean(step.checked)} onChange={(checked) => onChange({ checked })} />
        <BooleanField label="是否提交必选" checked={Boolean(step.requiredToSubmit)} onChange={(requiredToSubmit) => onChange({ requiredToSubmit })} />
        <TextField label="文案" value={step.labelText ?? ''} onChange={(labelText) => onChange({ labelText })} />
        <TextAreaField label="选中含义" value={step.checkedMeaning ?? ''} onChange={(checkedMeaning) => onChange({ checkedMeaning })} />
        <TextAreaField label="未选中含义" value={step.uncheckedMeaning ?? ''} onChange={(uncheckedMeaning) => onChange({ uncheckedMeaning })} />
      </FieldGroup>
    )
  }
  if (elementType === 'DatePicker') {
    return (
      <FieldGroup>
        <TextField label="选择类型" value={step.pickerType ?? ''} onChange={(pickerType) => onChange({ pickerType })} />
        <TextField label="日期格式" value={step.dateFormat ?? ''} onChange={(dateFormat) => onChange({ dateFormat })} />
        <TextField label="最小日期" value={step.minDate ?? ''} onChange={(minDate) => onChange({ minDate })} />
        <TextField label="最大日期" value={step.maxDate ?? ''} onChange={(maxDate) => onChange({ maxDate })} />
        <TextListField label="禁用日期" value={step.disabledDates ?? []} onChange={(disabledDates) => onChange({ disabledDates })} />
        <OptionsField label="快捷项" value={step.presets ?? []} onChange={(presets) => onChange({ presets })} />
        <TextField label="已选日期" value={step.selectedDate ?? ''} onChange={(selectedDate) => onChange({ selectedDate })} />
        <TextField label="已选范围开始" value={step.selectedRange?.start ?? ''} onChange={(start) => onChange({ selectedRange: { ...step.selectedRange, start } })} />
        <TextField label="已选范围结束" value={step.selectedRange?.end ?? ''} onChange={(end) => onChange({ selectedRange: { ...step.selectedRange, end } })} />
        <TextField label="时区" value={step.timezone ?? ''} onChange={(timezone) => onChange({ timezone })} />
      </FieldGroup>
    )
  }
  if (elementType === 'DataTable') {
    return (
      <FieldGroup>
        <ColumnsField label="表格列" value={step.columns ?? []} onChange={(columns) => onChange({ columns })} />
        <TextField label="行唯一键" value={step.rowKey ?? ''} onChange={(rowKey) => onChange({ rowKey })} />
        <BooleanField label="是否分页" checked={Boolean(step.pagination)} onChange={(pagination) => onChange({ pagination })} />
        <TextListField label="可排序列" value={step.sortableColumns ?? []} onChange={(sortableColumns) => onChange({ sortableColumns })} />
        <TextListField label="可筛选列" value={step.filterableColumns ?? []} onChange={(filterableColumns) => onChange({ filterableColumns })} />
        <BooleanField label="是否可选择行" checked={Boolean(step.selectable)} onChange={(selectable) => onChange({ selectable })} />
        <OptionsField label="行操作" value={step.rowActions ?? []} onChange={(rowActions) => onChange({ rowActions })} />
        <TextAreaField label="预期数据" value={recordsToText(step.expectedRows ?? [])} onChange={(text) => onChange({ expectedRows: recordsFromText(text) })} />
        <TextListField label="表格断言" value={step.assertionRules ?? []} onChange={(assertionRules) => onChange({ assertionRules })} />
      </FieldGroup>
    )
  }
  if (elementType === 'ContextMenu') {
    return (
      <FieldGroup>
        <TextField label="触发元素" value={step.triggerElement ?? ''} onChange={(triggerElement) => onChange({ triggerElement })} />
        <TextField label="触发动作" value={step.triggerAction ?? ''} onChange={(triggerAction) => onChange({ triggerAction })} />
        <OptionsField label="菜单项" value={step.menuItems ?? []} onChange={(menuItems) => onChange({ menuItems })} />
        <TextField label="选择菜单项" value={step.selectedMenuItem ?? ''} onChange={(selectedMenuItem) => onChange({ selectedMenuItem })} />
        <TextListField label="禁用菜单项" value={step.disabledMenuItems ?? []} onChange={(disabledMenuItems) => onChange({ disabledMenuItems })} />
        <TextAreaField label="显示条件" value={step.visibleCondition ?? ''} onChange={(visibleCondition) => onChange({ visibleCondition })} />
      </FieldGroup>
    )
  }
  if (elementType === 'Label') {
    return (
      <FieldGroup>
        <TextField label="标签文本" value={step.labelText ?? ''} onChange={(labelText) => onChange({ labelText })} />
        <TextField label="关联控件" value={step.associatedControl ?? ''} onChange={(associatedControl) => onChange({ associatedControl })} />
        <BooleanField label="是否显示必填标记" checked={Boolean(step.requiredMark)} onChange={(requiredMark) => onChange({ requiredMark })} />
        <TextField label="可访问性名称" value={step.accessibilityName ?? ''} onChange={(accessibilityName) => onChange({ accessibilityName })} />
        <TextField label="预期文本" value={step.expectedText ?? ''} onChange={(expectedText) => onChange({ expectedText })} />
      </FieldGroup>
    )
  }
  return null
}

function SectionTitle({ children }: { children: string }) {
  return <div className="text-xs font-semibold">{children}</div>
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea rows={2} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

function TextListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea rows={2} value={value.join('\n')} onChange={(event) => onChange(textArrayValue(event.target.value))} />
    </Field>
  )
}

function BooleanField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function OptionsField({ label, value, onChange }: { label: string; value: TaskUiOption[]; onChange: (value: TaskUiOption[]) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea rows={3} value={optionsToText(value)} onChange={(event) => onChange(optionsFromText(event.target.value))} />
    </Field>
  )
}

function ColumnsField({ label, value, onChange }: { label: string; value: TaskUiColumn[]; onChange: (value: TaskUiColumn[]) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea rows={3} value={columnsToText(value)} onChange={(event) => onChange(columnsFromText(event.target.value))} />
    </Field>
  )
}

function newStep(stepNo: number): TaskUiOperationStep {
  return {
    id: createUiStepId(),
    stepNo,
    elementType: 'Input',
    elementName: '',
    actionType: 'input',
    elementLocationHint: '',
    value: '',
    valueSource: 'fixed',
    required: false,
    businessMeaning: '',
    expectedState: '',
    expectedResult: '',
    screenshotRequired: false,
    waitCondition: '',
    negativeTestHints: [],
  }
}

function createUiStepId() {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `ui_step_${uuid.replaceAll('-', '').slice(0, 12)}`
}

function valueToText(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value)
}

function numberToText(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function numberFromText(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function assertionToText(value: unknown) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const source = value as Record<string, unknown>
  return [source.assertionType, source.target, valueToText(source.expected), source.description]
    .map((item) => typeof item === 'string' ? item : valueToText(item))
    .filter(Boolean)
    .join(' | ')
}

function optionsToText(value: TaskUiOption[]) {
  return value.map((item) => [item.label, item.value, item.businessMeaning ?? ''].join(' | ')).join('\n')
}

function optionsFromText(value: string): TaskUiOption[] {
  return textArrayValue(value).map((line) => {
    const [label = '', optionValue = '', businessMeaning = ''] = line.split('|').map((item) => item.trim())
    return {
      label: label || optionValue,
      value: optionValue || label,
      businessMeaning: businessMeaning || null,
    }
  }).filter((item) => item.label || item.value)
}

function columnsToText(value: TaskUiColumn[]) {
  return value.map((item) => [item.title, item.field].join(' | ')).join('\n')
}

function columnsFromText(value: string): TaskUiColumn[] {
  return textArrayValue(value).map((line) => {
    const [title = '', field = ''] = line.split('|').map((item) => item.trim())
    return { title: title || field, field: field || title }
  }).filter((item) => item.title || item.field)
}

function recordsToText(value: Record<string, unknown>[]) {
  return value.map((item) => JSON.stringify(item)).join('\n')
}

function recordsFromText(value: string): Record<string, unknown>[] {
  return textArrayValue(value).flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : []
    } catch {
      return []
    }
  })
}
