import type {
  TaskUiActionType,
  TaskUiAssertion,
  TaskUiColumn,
  TaskUiContext,
  TaskUiElementType,
  TaskUiOperationStep,
  TaskUiOption,
  TaskUiTaskType,
  TaskUiValueSource,
} from './types'

const ELEMENT_TYPES = new Set<TaskUiElementType>([
  'ContextMenu',
  'Button',
  'Checkbox',
  'DataTable',
  'DatePicker',
  'Input',
  'Label',
  'RadioGroup',
  'Select',
  'Textarea',
])

const ACTION_TYPES = new Set<TaskUiActionType>([
  'click',
  'doubleClick',
  'rightClick',
  'input',
  'clear',
  'select',
  'check',
  'uncheck',
  'toggle',
  'selectDate',
  'selectRange',
  'search',
  'filter',
  'sort',
  'selectRow',
  'assertVisible',
  'assertText',
  'assertValue',
  'assertCell',
  'selectMenuItem',
])

const TASK_TYPES = new Set<TaskUiTaskType>(['userTask', 'serviceTask', 'manualTask'])
const VALUE_SOURCES = new Set<TaskUiValueSource>(['fixed', 'testData', 'previousStep', 'apiResponse'])

export const TASK_UI_ELEMENT_TYPES = [...ELEMENT_TYPES]
export const TASK_UI_ACTION_TYPES = [...ACTION_TYPES]
export const TASK_UI_TASK_TYPES = [...TASK_TYPES]
export const TASK_UI_VALUE_SOURCES = [...VALUE_SOURCES]

export const TASK_UI_ELEMENT_TYPE_LABELS: Record<TaskUiElementType, string> = {
  ContextMenu: '右键菜单',
  Button: '按钮',
  Checkbox: '复选框',
  DataTable: '数据表格',
  DatePicker: '日期选择器',
  Input: '输入框',
  Label: '标签',
  RadioGroup: '单选按钮组',
  Select: '下拉选择',
  Textarea: '文本域',
}

export const TASK_UI_ACTION_TYPE_LABELS: Record<TaskUiActionType, string> = {
  click: '点击',
  doubleClick: '双击',
  rightClick: '右键点击',
  input: '输入',
  clear: '清空',
  select: '选择',
  check: '勾选',
  uncheck: '取消勾选',
  toggle: '切换',
  selectDate: '选择日期',
  selectRange: '选择日期范围',
  search: '搜索',
  filter: '筛选',
  sort: '排序',
  selectRow: '选择行',
  assertVisible: '断言可见',
  assertText: '断言文本',
  assertValue: '断言值',
  assertCell: '断言单元格',
  selectMenuItem: '选择菜单项',
}

export const TASK_UI_TASK_TYPE_LABELS: Record<TaskUiTaskType, string> = {
  userTask: '用户任务',
  serviceTask: '服务任务',
  manualTask: '人工任务',
}

export const TASK_UI_VALUE_SOURCE_LABELS: Record<TaskUiValueSource, string> = {
  fixed: '固定值',
  testData: '测试数据',
  previousStep: '上一步输出',
  apiResponse: '接口响应',
}

export const TASK_UI_ACTIONS_BY_ELEMENT: Record<TaskUiElementType, TaskUiActionType[]> = {
  ContextMenu: ['rightClick', 'selectMenuItem', 'assertVisible'],
  Button: ['click', 'doubleClick', 'assertVisible'],
  Checkbox: ['check', 'uncheck', 'toggle', 'assertVisible', 'assertValue'],
  DataTable: ['search', 'filter', 'sort', 'selectRow', 'assertCell', 'assertVisible'],
  DatePicker: ['selectDate', 'selectRange', 'clear', 'assertVisible', 'assertValue'],
  Input: ['input', 'clear', 'assertVisible', 'assertText', 'assertValue'],
  Label: ['assertText', 'assertVisible'],
  RadioGroup: ['select', 'assertVisible', 'assertValue'],
  Select: ['select', 'search', 'clear', 'assertVisible', 'assertValue'],
  Textarea: ['input', 'clear', 'assertVisible', 'assertText'],
}

export function taskUiEmpty(taskName = ''): TaskUiContext {
  return {
    taskName,
    taskType: 'userTask',
    actor: '',
    businessIntent: '',
    businessRules: [],
    preconditions: [],
    postconditions: [],
    page: { pageName: '', urlPattern: '', routePattern: '', moduleName: '' },
    uiSteps: [],
    inputDataRefs: [],
    outputDataRefs: [],
    expectedResults: [],
    assertions: [],
    mockRequirements: [],
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item).trim()).filter(Boolean)
    : typeof value === 'string'
      ? value.split('\n').map((item) => item.trim()).filter(Boolean)
      : []
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeOption(value: unknown): TaskUiOption | null {
  const source = asObject(value)
  const label = asString(source.label).trim()
  const optionValue = asString(source.value).trim()
  if (!label && !optionValue) return null
  return {
    label: label || optionValue,
    value: optionValue || label,
    businessMeaning: asString(source.businessMeaning).trim() || null,
  }
}

function asOptions(value: unknown): TaskUiOption[] {
  return Array.isArray(value)
    ? value.map(normalizeOption).filter((item): item is TaskUiOption => Boolean(item))
    : []
}

function normalizeColumn(value: unknown): TaskUiColumn | null {
  const source = asObject(value)
  const title = asString(source.title).trim()
  const field = asString(source.field).trim()
  if (!title && !field) return null
  return { title: title || field, field: field || title }
}

function asColumns(value: unknown): TaskUiColumn[] {
  return Array.isArray(value)
    ? value.map(normalizeColumn).filter((item): item is TaskUiColumn => Boolean(item))
    : []
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asObject).filter((item) => Object.keys(item).length > 0)
    : []
}

function asAssertions(value: unknown): TaskUiAssertion[] {
  if (!Array.isArray(value)) return asStringArray(value)
  const assertions: TaskUiAssertion[] = []
  value.forEach((item) => {
    if (typeof item === 'string') {
      if (item.trim()) assertions.push(item.trim())
      return
    }
    const source = asObject(item)
    if (!Object.keys(source).length) return
    assertions.push({
      assertionType: asString(source.assertionType).trim() || null,
      target: asString(source.target).trim() || null,
      expected: source.expected,
      description: asString(source.description).trim() || null,
    })
  })
  return assertions
}

function normalizeElementType(value: unknown): TaskUiElementType {
  const text = asString(value).trim()
  if (text === 'Radio') return 'RadioGroup'
  if (text === 'Data Table') return 'DataTable'
  if (text === 'Date Picker') return 'DatePicker'
  if (text === 'Context Menu') return 'ContextMenu'
  return ELEMENT_TYPES.has(text as TaskUiElementType) ? text as TaskUiElementType : 'Input'
}

function normalizeActionType(value: unknown, elementType: TaskUiElementType): TaskUiActionType {
  const text = asString(value).trim()
  const action = ACTION_TYPES.has(text as TaskUiActionType)
    ? text as TaskUiActionType
    : TASK_UI_ACTIONS_BY_ELEMENT[elementType][0]
  return action
}

function normalizeTaskType(value: unknown): TaskUiTaskType {
  const text = asString(value).trim()
  return TASK_TYPES.has(text as TaskUiTaskType) ? text as TaskUiTaskType : 'userTask'
}

function normalizeValueSource(value: unknown): TaskUiValueSource {
  const text = asString(value).trim()
  return VALUE_SOURCES.has(text as TaskUiValueSource) ? text as TaskUiValueSource : 'fixed'
}

function normalizeSelectedRange(value: unknown) {
  const source = asObject(value)
  const start = asString(source.start).trim()
  const end = asString(source.end).trim()
  return start || end ? { start: start || null, end: end || null } : null
}

export function normalizeTaskUiContext(
  value: unknown,
  fallback: { taskName?: string | null } = {},
): TaskUiContext {
  const source = asObject(value)
  const page = asObject(source.page)
  const uiSteps = Array.isArray(source.uiSteps) ? source.uiSteps : []
  const fallbackTaskName = asString(fallback.taskName).trim()
  const taskName = asString(source.taskName).trim() || fallbackTaskName
  return {
    taskName,
    taskType: normalizeTaskType(source.taskType),
    actor: asString(source.actor).trim(),
    businessIntent: asString(source.businessIntent).trim(),
    businessRules: asStringArray(source.businessRules),
    preconditions: asStringArray(source.preconditions),
    postconditions: asStringArray(source.postconditions),
    page: {
      pageName: asString(page.pageName).trim(),
      urlPattern: asString(page.urlPattern ?? page.routePattern).trim(),
      routePattern: asString(page.routePattern ?? page.urlPattern).trim(),
      moduleName: asString(page.moduleName).trim(),
    },
    uiSteps: uiSteps.map((item, index): TaskUiOperationStep => {
      const step = asObject(item)
      const elementType = normalizeElementType(step.elementType)
      const actionType = normalizeActionType(step.actionType, elementType)
      return {
        id: asString(step.id).trim() || `step_${index + 1}`,
        stepNo: Number.isFinite(Number(step.stepNo)) ? Number(step.stepNo) : index + 1,
        elementType,
        elementName: asString(step.elementName).trim(),
        actionType,
        elementLocationHint: asString(step.elementLocationHint).trim(),
        value: step.value,
        valueSource: normalizeValueSource(step.valueSource),
        required: asBoolean(step.required),
        businessMeaning: asString(step.businessMeaning).trim(),
        expectedState: asString(step.expectedState).trim(),
        expectedResult: asString(step.expectedResult).trim(),
        screenshotRequired: asBoolean(step.screenshotRequired),
        waitCondition: asString(step.waitCondition).trim(),
        negativeTestHints: asStringArray(step.negativeTestHints),
        buttonText: asString(step.buttonText).trim(),
        buttonRole: asString(step.buttonRole).trim(),
        disabledCondition: asString(step.disabledCondition).trim(),
        confirmRequired: asBoolean(step.confirmRequired),
        loadingExpected: asBoolean(step.loadingExpected),
        inputType: asString(step.inputType).trim(),
        placeholder: asString(step.placeholder).trim(),
        minLength: asNumber(step.minLength),
        maxLength: asNumber(step.maxLength),
        pattern: asString(step.pattern).trim(),
        defaultValue: step.defaultValue,
        testValues: asStringArray(step.testValues),
        invalidValues: asStringArray(step.invalidValues),
        clearBeforeInput: asBoolean(step.clearBeforeInput),
        rows: asNumber(step.rows),
        allowLineBreak: asBoolean(step.allowLineBreak),
        sensitive: asBoolean(step.sensitive),
        options: asOptions(step.options),
        multiple: asBoolean(step.multiple),
        searchable: asBoolean(step.searchable),
        clearable: asBoolean(step.clearable),
        selectedValue: step.selectedValue,
        disabledOptions: asStringArray(step.disabledOptions),
        optionSource: asString(step.optionSource).trim(),
        optionApiRef: asString(step.optionApiRef).trim(),
        layout: asString(step.layout).trim(),
        checked: asBoolean(step.checked),
        requiredToSubmit: asBoolean(step.requiredToSubmit),
        labelText: asString(step.labelText).trim(),
        checkedMeaning: asString(step.checkedMeaning).trim(),
        uncheckedMeaning: asString(step.uncheckedMeaning).trim(),
        pickerType: asString(step.pickerType).trim(),
        dateFormat: asString(step.dateFormat).trim(),
        minDate: asString(step.minDate).trim(),
        maxDate: asString(step.maxDate).trim(),
        disabledDates: asStringArray(step.disabledDates),
        presets: asOptions(step.presets),
        selectedDate: asString(step.selectedDate).trim(),
        selectedRange: normalizeSelectedRange(step.selectedRange),
        timezone: asString(step.timezone).trim(),
        columns: asColumns(step.columns),
        rowKey: asString(step.rowKey).trim(),
        pagination: asBoolean(step.pagination),
        sortableColumns: asStringArray(step.sortableColumns),
        filterableColumns: asStringArray(step.filterableColumns),
        selectable: asBoolean(step.selectable),
        rowActions: asOptions(step.rowActions),
        expectedRows: asRecordArray(step.expectedRows),
        assertionRules: asStringArray(step.assertionRules),
        triggerElement: asString(step.triggerElement).trim(),
        triggerAction: asString(step.triggerAction).trim(),
        menuItems: asOptions(step.menuItems),
        selectedMenuItem: asString(step.selectedMenuItem).trim(),
        disabledMenuItems: asStringArray(step.disabledMenuItems),
        visibleCondition: asString(step.visibleCondition).trim(),
        associatedControl: asString(step.associatedControl).trim(),
        requiredMark: asBoolean(step.requiredMark),
        accessibilityName: asString(step.accessibilityName).trim(),
        expectedText: asString(step.expectedText).trim(),
      }
    }).sort((left, right) => left.stepNo - right.stepNo),
    inputDataRefs: asStringArray(source.inputDataRefs),
    outputDataRefs: asStringArray(source.outputDataRefs),
    expectedResults: asStringArray(source.expectedResults),
    assertions: asAssertions(source.assertions),
    mockRequirements: asStringArray(source.mockRequirements),
  }
}

export function taskUiTaskName(value: unknown, fallback = '任务') {
  return normalizeTaskUiContext(value, { taskName: fallback }).taskName?.trim() || fallback
}

export function textArrayValue(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function taskUiQualityIssues(value: unknown): string[] {
  const taskUi = normalizeTaskUiContext(value)
  const issues: string[] = []
  if (!taskUi.taskName?.trim()) issues.push('Task 缺少任务名称，生成 Web 用例可能不完整。')
  if (!taskUi.page?.pageName) issues.push('Task 缺少页面名称，生成 Web 用例可能不完整。')
  if (!taskUi.uiSteps.length) issues.push('Task 缺少 UI 操作步骤，生成操作步骤可能不完整。')
  taskUi.uiSteps.forEach((step, index) => {
    if (!step.elementName) issues.push(`第 ${index + 1} 步缺少元素名称。`)
    if (!ELEMENT_TYPES.has(step.elementType as TaskUiElementType)) issues.push(`第 ${index + 1} 步元素类型不受控。`)
    if (!ACTION_TYPES.has(step.actionType as TaskUiActionType)) issues.push(`第 ${index + 1} 步操作动作不受控。`)
    const allowed = TASK_UI_ACTIONS_BY_ELEMENT[step.elementType as TaskUiElementType]
    if (allowed && !allowed.includes(step.actionType as TaskUiActionType)) {
      issues.push(`第 ${index + 1} 步元素类型与操作动作不匹配。`)
    }
    if (!step.expectedResult && !(taskUi.expectedResults ?? []).length) {
      issues.push(`第 ${index + 1} 步缺少预期结果。`)
    }
    if (step.elementType === 'Select' && !(step.options ?? []).length) {
      issues.push(`第 ${index + 1} 步下拉选择缺少选项。`)
    }
    if (step.elementType === 'DataTable' && !(step.columns ?? []).length && !(step.assertionRules ?? []).length) {
      issues.push(`第 ${index + 1} 步数据表格缺少列或表格断言。`)
    }
    if (step.elementType === 'ContextMenu' && !(step.menuItems ?? []).length) {
      issues.push(`第 ${index + 1} 步右键菜单缺少菜单项。`)
    }
  })
  return issues
}
