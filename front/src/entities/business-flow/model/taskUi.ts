import type {
  TaskUiActionType,
  TaskUiContext,
  TaskUiElementType,
  TaskUiOperationStep,
} from './types'

const ELEMENT_TYPES = new Set<TaskUiElementType>([
  'Button',
  'Input',
  'Select',
  'Checkbox',
  'Radio',
  'DatePicker',
  'Upload',
  'DataTable',
  'Dialog',
  'Label',
])

const ACTION_TYPES = new Set<TaskUiActionType>([
  'click',
  'input',
  'select',
  'check',
  'uncheck',
  'upload',
  'assertVisible',
  'assertText',
  'assertData',
  'wait',
])

export const TASK_UI_ELEMENT_TYPES = [...ELEMENT_TYPES]
export const TASK_UI_ACTION_TYPES = [...ACTION_TYPES]

export const TASK_UI_ACTIONS_BY_ELEMENT: Record<TaskUiElementType, TaskUiActionType[]> = {
  Button: ['click', 'assertVisible'],
  Input: ['input', 'assertVisible', 'assertText'],
  Select: ['select', 'assertVisible', 'assertText'],
  Checkbox: ['check', 'uncheck', 'assertVisible'],
  Radio: ['select', 'assertVisible'],
  DatePicker: ['select', 'input', 'assertVisible'],
  Upload: ['upload', 'assertVisible'],
  DataTable: ['assertData', 'assertVisible'],
  Dialog: ['assertVisible', 'assertText'],
  Label: ['assertVisible', 'assertText'],
}

export function taskUiEmpty(): TaskUiContext {
  return { page: { pageName: '', routePattern: '', moduleName: '' }, uiSteps: [], expectedResults: [], assertions: [] }
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
    : []
}

export function normalizeTaskUiContext(value: unknown): TaskUiContext {
  const source = asObject(value)
  const page = asObject(source.page)
  const uiSteps = Array.isArray(source.uiSteps) ? source.uiSteps : []
  return {
    page: {
      pageName: asString(page.pageName).trim(),
      routePattern: asString(page.routePattern).trim(),
      moduleName: asString(page.moduleName).trim(),
    },
    uiSteps: uiSteps.map((item, index): TaskUiOperationStep => {
      const step = asObject(item)
      return {
        id: asString(step.id).trim() || `step_${index + 1}`,
        stepNo: Number.isFinite(Number(step.stepNo)) ? Number(step.stepNo) : index + 1,
        elementType: asString(step.elementType).trim() || 'Input',
        elementName: asString(step.elementName).trim(),
        actionType: asString(step.actionType).trim() || 'input',
        value: step.value,
        businessMeaning: asString(step.businessMeaning).trim(),
        expectedResult: asString(step.expectedResult).trim(),
        negativeTestHints: asStringArray(step.negativeTestHints),
      }
    }).sort((left, right) => left.stepNo - right.stepNo),
    expectedResults: asStringArray(source.expectedResults),
    assertions: asStringArray(source.assertions),
  }
}

export function taskUiQualityIssues(value: unknown): string[] {
  const taskUi = normalizeTaskUiContext(value)
  const issues: string[] = []
  if (!taskUi.page?.pageName) issues.push('Task 缺少页面名称，生成 Web 用例可能不完整。')
  if (!taskUi.uiSteps.length) issues.push('Task 缺少 UI Steps，生成操作步骤可能不完整。')
  taskUi.uiSteps.forEach((step, index) => {
    if (!step.elementName) issues.push(`第 ${index + 1} 步缺少控件名称。`)
    if (!ELEMENT_TYPES.has(step.elementType as TaskUiElementType)) issues.push(`第 ${index + 1} 步控件类型不受控。`)
    if (!ACTION_TYPES.has(step.actionType as TaskUiActionType)) issues.push(`第 ${index + 1} 步动作类型不受控。`)
    const allowed = TASK_UI_ACTIONS_BY_ELEMENT[step.elementType as TaskUiElementType]
    if (allowed && !allowed.includes(step.actionType as TaskUiActionType)) {
      issues.push(`第 ${index + 1} 步控件类型与动作类型不匹配。`)
    }
  })
  return issues
}
