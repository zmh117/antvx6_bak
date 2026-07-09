import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeTaskUiContext,
  TASK_UI_ACTION_TYPE_LABELS,
  TASK_UI_ELEMENT_TYPE_LABELS,
  taskUiQualityIssues,
} from '../src/entities/business-flow/model/taskUi.js'

test('normalizes task web-test model with Chinese-facing labels and legacy page route', () => {
  const normalized = normalizeTaskUiContext(
    {
      taskType: 'manualTask',
      actor: '计划员',
      businessIntent: '提交生产工单',
      page: { pageName: '工单创建页', routePattern: '/mes/work-orders/new', moduleName: 'MES' },
      uiSteps: [
        {
          stepNo: 2,
          elementType: 'Select',
          actionType: 'select',
          elementName: '生产线',
          elementLocationHint: '通过字段标题识别',
          locator: { strategy: 'testId', value: 'line-select' },
          options: [{ label: '一号线', value: 'LINE_1', businessMeaning: '主生产线' }],
          selectedValue: 'LINE_1',
          expectedResult: '生产线已选择',
        },
        {
          stepNo: 1,
          elementType: 'Button',
          actionType: 'click',
          elementName: '新增',
          buttonText: '新增',
          loadingExpected: true,
          expectedResult: '打开创建表单',
        },
      ],
    },
    { taskName: '提交工单' },
  )

  assert.equal(TASK_UI_ELEMENT_TYPE_LABELS.Select, '下拉选择')
  assert.equal(TASK_UI_ACTION_TYPE_LABELS.select, '选择')
  assert.equal(normalized.taskName, '提交工单')
  assert.ok(normalized.page)
  assert.equal(normalized.page.urlPattern, '/mes/work-orders/new')
  assert.equal(normalized.page.routePattern, '/mes/work-orders/new')
  assert.deepEqual(normalized.uiSteps.map((step) => step.stepNo), [1, 2])
  assert.equal(normalized.uiSteps[1].elementLocationHint, '通过字段标题识别')
  assert.equal('locator' in normalized.uiSteps[1], false)
  assert.deepEqual(normalized.uiSteps[1].options, [
    { label: '一号线', value: 'LINE_1', businessMeaning: '主生产线' },
  ])
})

test('reports missing required task fields and element-specific configuration gaps', () => {
  const issues = taskUiQualityIssues({
    taskName: '',
    page: {},
    uiSteps: [
      { elementType: 'Select', actionType: 'click', elementName: '目的地' },
      { elementType: 'DataTable', actionType: 'assertCell', elementName: '订单列表' },
      { elementType: 'ContextMenu', actionType: 'selectMenuItem', elementName: '订单行菜单' },
    ],
  })

  assert.ok(issues.some((issue) => issue.includes('任务名称')))
  assert.ok(issues.some((issue) => issue.includes('页面名称')))
  assert.ok(issues.some((issue) => issue.includes('元素类型与操作动作不匹配')))
  assert.ok(issues.some((issue) => issue.includes('下拉选择缺少选项')))
  assert.ok(issues.some((issue) => issue.includes('数据表格缺少列或表格断言')))
  assert.ok(issues.some((issue) => issue.includes('右键菜单缺少菜单项')))
})
