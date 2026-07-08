## Context

当前业务流程图的 Task 节点同时承担画布显示、BPMN 渲染、结构化持久化、协作、历史和 Agent context 输出。现有节点字段 `title / description / actor / businessRule / inputSummary / outputSummary` 更像“通用备注”，对 Web 系统测试用例生成不够精确；当前 `task_ui_json` 已有页面和 UI Steps 雏形，但控件类型、操作动作、专属字段、断言和兼容策略还不完整。

用户明确要求：

- Task 属性不再使用原来的节点字段：标题、描述、角色、业务规则、输入摘要、输出摘要、BPMN 节点、BPMN 节点类型。
- Task 不需要绑定 ER 字段。
- UI 表单字段显示中文，不使用英文单词。
- 不做结构化 `locator` 字段，只保留中文“元素定位说明/定位依据”作为可选描述。
- 代码和持久化 JSON key 继续使用英文稳定字段名。

该改造横跨前端实体模型、业务图编辑器、泳道组件编辑器、X6 cell data、Yjs 协作、后端 DTO/领域校验、历史恢复和 Agent context，因此需要端到端设计。

## Goals / Non-Goals

**Goals:**

- 将 BPMN Task 的用户可编辑属性收敛为 Web 测试任务模型：业务语义、页面信息、UI 操作步骤、断言与预期。
- 删除 Task 属性面板中的旧通用节点字段、BPMN profile 编辑字段和 ER 绑定入口。
- 保持 UI 显示字段全部为中文；控件类型和动作在前端显示中文标签。
- 保持代码和存储 key 英文稳定，避免破坏已有 API、协作和 Agent 读取。
- 扩展 `task_ui_json`，使它成为 Task 节点面向测试生成的唯一业务语义来源。
- 保留旧图兼容：旧数据可打开、可保存，数据库旧列本次不做破坏性删除。
- Agent context 输出新 Task 模型，避免继续依赖旧备注字段或 ER 绑定。

**Non-Goals:**

- 不新增结构化 `locator` 模型，不实现 Playwright 自动定位代码生成。
- 不把 Task 绑定到 ER 字段，也不新增 Task 到 ER 字段的替代绑定。
- 不删除 BPMN 工具箱的“任务”节点，不删除内部 BPMN profile；只是从 Task 属性面板隐藏 BPMN profile 编辑。
- 不在本变更中物理删除数据库旧列；如需 drop column，后续单独迁移。
- 不把 UI 步骤拆成单独业务表；首版继续使用 JSON 结构并在代码层强类型校验。

## Decisions

### Decision 1: Task 表单使用中文业务字段，底层继续使用英文 key

Task 表单分为四组：

```text
基础信息
页面信息
UI 操作步骤
断言与预期
```

前端展示使用中文字段，例如“任务名称”“任务类型”“执行角色”“业务目的”“页面名称”“元素类型”“操作动作”“元素定位说明”。持久化继续使用英文 key，例如 `taskName`、`taskType`、`actor`、`businessIntent`、`page`、`uiSteps`、`elementType`、`actionType`、`elementLocationHint`。

Rationale: 中文 UI 满足建模体验；英文 key 保持 TypeScript、Python、历史、Yjs 和 Agent 解析稳定。

Alternatives considered:

- JSON key 也改成中文。这样会让后端校验、协作 patch、历史恢复和 Agent prompt 处理更脆弱，也不利于代码维护。
- 继续使用旧字段名，只改显示文案。这样无法表达 UI 步骤和断言，Agent 仍拿不到结构化测试上下文。

### Decision 2: `task_ui_json` 成为 Task 测试语义的唯一结构化来源

推荐结构：

```json
{
  "taskName": "提交订单",
  "taskType": "userTask",
  "actor": "采购员",
  "businessIntent": "填写订单并提交",
  "businessRules": ["必填项完整后才能提交"],
  "preconditions": ["用户已登录"],
  "postconditions": ["订单状态为待支付"],
  "page": {
    "pageName": "订单创建页",
    "urlPattern": "/orders/create",
    "moduleName": "订单"
  },
  "inputDataRefs": ["默认商品", "收货地址"],
  "outputDataRefs": ["订单号"],
  "expectedResults": ["页面提示提交成功"],
  "assertions": [
    {
      "assertionType": "页面文本",
      "target": "成功提示",
      "expected": "提交成功"
    }
  ],
  "mockRequirements": ["库存接口返回有库存"],
  "uiSteps": []
}
```

旧 `title` 仍作为画布标签兼容缓存：Task 保存时将 `taskUiJson.taskName` 同步到 X6 label 和底层 `title`；用户界面不再显示“标题”字段。旧 `description / actor / business_rule / input_summary / output_summary` 不再作为 Task 用户语义读写；旧数据只做兼容读取，不进入新 Agent 语义。

Rationale: `task_ui_json` 已存在于前后端链路中，扩展它比新增表或复用旧散列字段风险更低。

### Decision 3: UI Steps 使用“元素类型 + 操作动作”双轴模型

每个 Task 可包含多个 UI 操作步骤。每步至少包含：

```json
{
  "id": "step_001",
  "stepNo": 1,
  "elementType": "Input",
  "elementName": "商品数量",
  "actionType": "input",
  "elementLocationHint": "数量输入框",
  "value": "2",
  "valueSource": "fixed",
  "required": true,
  "businessMeaning": "指定购买数量",
  "expectedState": "字段显示 2",
  "expectedResult": "数量录入成功",
  "screenshotRequired": false,
  "waitCondition": "无",
  "negativeTestHints": ["为空", "为 0", "超过库存"]
}
```

支持的元素类型首版收敛为：

```text
ContextMenu, Button, Checkbox, DataTable, DatePicker, Input, Label, RadioGroup, Select, Textarea
```

支持的动作类型首版收敛为：

```text
click, doubleClick, rightClick, input, clear, check, uncheck, toggle,
select, selectDate, selectRange, search, filter, sort, selectRow,
assertVisible, assertText, assertValue, assertCell, selectMenuItem
```

前端用中文标签显示，例如 `Button` 显示“按钮”，`click` 显示“点击”。存储仍用英文枚举值。

Rationale: 一个业务 Task 通常由多个控件操作组成，不能把 Task 限制为单一控件类型。

### Decision 4: 不做结构化 locator，只保留定位说明

UI Step 不包含 `locator`、`strategy`、`css`、`xpath` 等结构化定位字段。保留可选文本字段：

```text
elementLocationHint
```

前端显示为“元素定位说明”或“定位依据”。

Rationale: 用户明确不要 Locator。流程图表达业务和测试意图；真实自动化定位应由后续页面组件目录、Page Object 或测试工程映射承接。

### Decision 5: 不在 Task 面板暴露 BPMN profile 和 ER 绑定

Task 节点仍然是 BPMN Task，内部保留 `bpmnElementType = TASK` 等字段用于渲染、边校验和旧图兼容，但 Task 属性面板不再展示“BPMN 节点”“BPMN 节点类型”编辑区。

Task 面板不再展示 `NodeErBindingEditor`，Agent context 不再把 Task 的 ER 绑定作为测试语义输出。旧绑定数据如仍存在，只在底层兼容保留，不作为新模型必填或推荐字段。

Rationale: Task 用户要描述的是业务任务和 UI 操作，不应被 BPMN 内部字段和数据库字段绑定打断。

### Decision 6: 元素专属字段放在步骤属性中，前端动态显示

不同元素类型展示不同中文字段，但都保存在同一个 step 对象中：

- 按钮：按钮文本、按钮角色、禁用条件、是否需要确认、是否出现加载、点击后预期结果。
- 输入框：输入类型、占位符、最小长度、最大长度、格式规则、默认值、测试值、非法值、输入前是否清空。
- 文本域：最大长度、最小长度、行数、是否允许换行、是否敏感信息、非法值。
- 下拉选择：选项、是否多选、是否可搜索、是否可清空、默认值、已选值、禁用选项、选项来源、选项接口说明。
- 单选按钮组：选项、默认选中、已选值、布局、禁用项、选项业务含义。
- 复选框：是否选中、是否提交必选、文案、选中含义、未选中含义。
- 日期选择器：选择类型、日期格式、最小日期、最大日期、禁用日期、快捷项、已选日期、已选范围、时区。
- 数据表格：列、行唯一键、是否分页、可排序列、可筛选列、是否可选行、行操作、预期数据、表格断言。
- 右键菜单：触发元素、触发动作、菜单项、选择菜单项、禁用菜单项、显示条件、选择后结果。
- 标签：标签文本、关联控件、是否显示必填标记、可访问性名称、预期文本。

Rationale: 统一 step 对象便于 JSON 保存和 Agent 消费；动态字段满足不同控件的测试生成精度。

## Risks / Trade-offs

- [Risk] 旧字段仍在数据库和 DTO 中存在，开发者可能继续误用。→ Mitigation: Task 读写 helper 统一从 `task_ui_json` 归一化，新 UI 不再暴露旧字段，Agent context 忽略旧字段。
- [Risk] `task_ui_json` 字段过宽，前端表单复杂。→ Mitigation: 先按元素类型动态折叠专属字段，保留 JSON 强类型与质量提示，避免一次性拆表。
- [Risk] 隐藏 BPMN profile 后用户无法修改已放置 Task 的 BPMN 内部类型。→ Mitigation: “任务”节点只作为通用 Task 编辑；需要事件、网关、数据节点时通过工具箱重新建模。
- [Risk] 不做结构化 locator 会限制直接生成 Playwright 代码。→ Mitigation: Agent 生成测试用例优先基于业务步骤；自动化定位作为后续页面组件目录能力处理。
- [Risk] 旧图打开后任务名称为空或与旧标题不同。→ Mitigation: 归一化时用旧 `title` 作为 `taskName` fallback，并在保存时同步回显示标签。

## Migration Plan

1. 扩展前端 `TaskUiContext` / `TaskUiOperationStep` 类型和归一化逻辑，新增业务语义、页面、断言、Mock、元素定位说明和元素专属字段。
2. 替换业务流程编辑器与泳道组件编辑器中的 Task 节点属性面板，删除旧字段、BPMN profile 区和 ER 绑定区。
3. 更新 X6 读写：Task label 从 `taskUiJson.taskName` 派生；新建 Task 初始化空的新模型；保存时旧语义字段不再作为 Task 来源。
4. 更新 Yjs 协作和差量保存，保证 `task_ui_json` 全结构可增量同步、保存、恢复。
5. 更新后端 DTO/领域 helper/质量检查，校验元素类型、动作类型、步骤顺序、必填业务字段和元素专属字段结构。
6. 更新 Agent context，将 Task 输出为 Web 测试任务模型，保留 `text + documents` 兼容，但不再依赖旧字段和 ER 绑定。
7. 保留数据库旧列，不 drop；旧图加载时从旧 `title` 回填任务名称，其他旧备注字段只做兼容保留。

Rollback 策略：因为不删除数据库列，回滚前端后旧字段仍可存在；已写入的新 `task_ui_json` 会作为额外 JSON 数据保留，不影响旧画布基本渲染。
