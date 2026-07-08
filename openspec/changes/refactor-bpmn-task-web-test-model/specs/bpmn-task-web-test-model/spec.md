## ADDED Requirements

### Requirement: Task 属性面板使用 Web 测试任务模型
系统 SHALL 将 BPMN Task 的用户可编辑属性替换为面向 Web 系统测试用例生成的任务模型，并且 SHALL 在前端属性面板中使用中文字段显示。

#### Scenario: 选择 Task 节点
- **WHEN** 用户在业务流程图或泳道组件编辑器中选择 `bpmnElementType = TASK` 的节点
- **THEN** 属性面板 SHALL 显示中文分组：基础信息、页面信息、UI 操作步骤、断言与预期
- **AND** 属性面板 SHALL 显示任务名称、任务类型、执行角色、业务目的、业务规则、前置条件、后置结果、页面名称、URL、所属模块、输入数据、输出数据、预期结果、断言、Mock 需求

#### Scenario: Task 面板不再显示旧字段
- **WHEN** 用户选择 Task 节点
- **THEN** 属性面板 MUST NOT 显示旧字段：标题、描述、角色、业务规则、输入摘要、输出摘要
- **AND** 属性面板 MUST NOT 显示 BPMN 节点、BPMN 节点类型编辑区
- **AND** 属性面板 MUST NOT 显示 ER 字段绑定入口

#### Scenario: 选择非 Task 节点
- **WHEN** 用户选择事件、网关、数据节点、事务或连线
- **THEN** 系统 MUST NOT 将 Task Web 测试字段作为该元素的必填字段

### Requirement: Task 语义保存到稳定 JSON 模型
系统 SHALL 将 Task 的 Web 测试语义保存到 `task_ui_json`，并且 SHALL 保持代码和持久化 JSON key 使用稳定英文命名。

#### Scenario: 保存新 Task 模型
- **WHEN** 用户填写 Task 的基础信息、页面信息、UI 操作步骤、断言与预期并保存
- **THEN** 系统 SHALL 将结构化数据保存到 `task_ui_json`
- **AND** 画布节点显示名 SHALL 使用 `task_ui_json.taskName`
- **AND** 底层 `title` 字段 SHALL 仅作为显示兼容缓存同步任务名称

#### Scenario: 前端显示中文字段
- **WHEN** 用户编辑 Task 模型
- **THEN** 前端 SHALL 使用中文字段名、中文分组名、中文控件类型标签和中文操作动作标签
- **AND** 系统 SHALL NOT 要求用户理解或填写英文 JSON key

#### Scenario: 旧数据库列保留兼容
- **WHEN** 系统保存或读取 Task 节点
- **THEN** 系统 MUST NOT 物理删除旧数据库字段
- **AND** Task 新语义 SHALL NOT 继续依赖 `description`、`actor`、`business_rule`、`input_summary`、`output_summary`

### Requirement: Task 支持有序 UI 操作步骤列表
系统 SHALL 允许一个 Task 保存多个 UI 操作步骤，每个步骤 SHALL 分离“元素类型”和“操作动作”。

#### Scenario: 添加多个 UI 操作步骤
- **WHEN** 用户在 Task 属性面板中添加多个 UI 操作步骤
- **THEN** 每个步骤 SHALL 保存稳定 ID、步骤序号、元素类型、元素名称、操作动作、输入值或选择值、值来源、是否必填、业务含义、预期状态、预期结果、是否截图、等待条件、负向用例提示
- **AND** 系统 SHALL 保持步骤顺序可保存、可恢复

#### Scenario: 元素类型和操作动作分开选择
- **WHEN** 用户配置 UI 操作步骤
- **THEN** 系统 SHALL 允许用户分别选择元素类型和操作动作
- **AND** 系统 MUST NOT 把一个 Task 限制为只能选择一个操作元素类型

#### Scenario: UI 步骤不包含结构化 locator
- **WHEN** 用户创建或保存 UI 操作步骤
- **THEN** UI 步骤 MUST NOT 包含结构化 `locator`、定位策略、CSS 或 XPath 字段
- **AND** 系统 SHALL 仅允许用户填写可选中文字段“元素定位说明”或“定位依据”

### Requirement: UI 步骤支持受控元素类型和动作类型
系统 SHALL 提供受控的 UI 元素类型和操作动作类型，并且 SHALL 校验元素类型与动作类型的合法组合。

#### Scenario: 支持的元素类型
- **WHEN** 用户选择 UI 步骤的元素类型
- **THEN** 系统 SHALL 支持右键菜单、按钮、复选框、数据表格、日期选择器、输入框、标签、单选按钮组、下拉选择、文本域
- **AND** 系统 SHALL 将这些中文标签映射到稳定英文枚举值

#### Scenario: 支持的动作类型
- **WHEN** 用户选择 UI 步骤的操作动作
- **THEN** 系统 SHALL 支持点击、双击、右键点击、输入、清空、勾选、取消勾选、切换、选择、选择日期、选择日期范围、搜索、筛选、排序、选择行、断言可见、断言文本、断言值、断言单元格、选择菜单项
- **AND** 系统 SHALL 将这些中文标签映射到稳定英文枚举值

#### Scenario: 元素动作组合不合法
- **WHEN** 用户配置不合理组合，例如标签执行输入动作或按钮执行选择日期动作
- **THEN** 系统 SHALL 提供建模质量问题或校验错误
- **AND** Agent context SHALL 标记该 Task 的测试生成依据不完整或不可靠

### Requirement: UI 步骤按元素类型展示专属字段
系统 SHALL 根据 UI 步骤的元素类型动态展示专属中文配置字段，并且 SHALL 将专属字段保存为该步骤的一部分。

#### Scenario: 配置下拉选择步骤
- **WHEN** 用户选择元素类型为下拉选择
- **THEN** 系统 SHALL 展示选项、是否多选、是否可搜索、是否可清空、默认值、已选值、禁用选项、选项来源、选项接口说明、是否必选
- **AND** 保存后的步骤 SHALL 支持 Agent 基于选项和已选值生成正常与异常选择用例

#### Scenario: 配置输入框步骤
- **WHEN** 用户选择元素类型为输入框
- **THEN** 系统 SHALL 展示输入类型、占位符、最小长度、最大长度、格式规则、是否必填、默认值、测试值、非法值、输入前是否清空
- **AND** 保存后的步骤 SHALL 支持 Agent 基于合法值和非法值生成边界校验用例

#### Scenario: 配置数据表格步骤
- **WHEN** 用户选择元素类型为数据表格
- **THEN** 系统 SHALL 展示表格列、行唯一键、是否分页、可排序列、可筛选列、是否可选择行、行操作、预期数据、表格断言
- **AND** 保存后的步骤 SHALL 支持 Agent 生成查询、筛选、排序、选择行和单元格断言用例

#### Scenario: 配置右键菜单步骤
- **WHEN** 用户选择元素类型为右键菜单
- **THEN** 系统 SHALL 展示触发元素、触发动作、菜单项、选择菜单项、禁用菜单项、显示条件、选择后结果
- **AND** 保存后的步骤 SHALL 支持 Agent 生成右键菜单交互用例

### Requirement: Task 模型贯穿业务图生命周期
系统 SHALL 在业务图保存、增量变更、Yjs 协作、泳道组件发布与放置、历史记录和恢复中保留 Task Web 测试模型。

#### Scenario: 保存并重新打开业务图
- **WHEN** 用户编辑 Task Web 测试模型并保存业务图
- **THEN** 用户重新打开业务图 SHALL 看到相同的任务名称、页面信息、UI 操作步骤、断言与预期

#### Scenario: 泳道组件包含 Task 模型
- **WHEN** 泳道组件模板中的 Task 包含 Web 测试模型
- **THEN** 用户将该组件放置到业务图实例后，实例节点 SHALL 保留该模型

#### Scenario: 协作者修改 UI 步骤
- **WHEN** 协作者修改同一业务图中某个 Task 的 UI 操作步骤
- **THEN** 系统 SHALL 通过协作和物化链路保留该修改
- **AND** 其他用户刷新后 SHALL 看到一致数据

#### Scenario: 恢复历史版本
- **WHEN** 用户恢复包含 Task Web 测试模型的历史版本
- **THEN** 恢复后的业务图 SHALL 保留任务名称、页面信息、UI 操作步骤、断言与预期

### Requirement: Agent context 输出 Task Web 测试模型
系统 SHALL 在图 Agent context 中输出 Task 的结构化 Web 测试模型，使 Agent 不依赖旧备注字段、截图或数据库直读。

#### Scenario: Agent 读取业务流程图
- **WHEN** Agent 调用图上下文接口读取业务流程图
- **THEN** 响应 SHALL 在结构化上下文中包含 Task 的基础信息、页面信息、UI 操作步骤、输入数据、输出数据、预期结果、断言和 Mock 需求
- **AND** 响应 SHALL 继续保持既有 `text` 和 `documents` 字段兼容

#### Scenario: Task 模型不完整
- **WHEN** Task 缺少任务名称、页面名称、UI 操作步骤、元素名称、操作动作或预期结果
- **THEN** Agent context SHALL 输出建模质量问题
- **AND** 质量问题 SHALL 指明生成 Web 测试用例可能不完整

#### Scenario: Task 存在旧 ER 绑定
- **WHEN** 旧图中的 Task 节点仍存在 ER 绑定数据
- **THEN** Agent context MUST NOT 将旧 ER 绑定作为 Task Web 测试模型的一部分
- **AND** 系统 SHALL 保留旧数据兼容但不把它作为新用例生成依据

### Requirement: 旧 Task 数据兼容打开
系统 SHALL 兼容旧 Task 节点数据，同时 SHALL 停止在新 UI 和 Agent 语义中暴露旧字段。

#### Scenario: 旧图没有 task_ui_json
- **WHEN** 用户打开旧业务图，Task 节点没有 `task_ui_json`
- **THEN** 系统 SHALL 使用旧 `title` 作为任务名称 fallback
- **AND** 系统 SHALL 初始化空的页面信息、UI 操作步骤、断言与预期

#### Scenario: 旧图包含描述和摘要字段
- **WHEN** 用户打开旧业务图，Task 节点包含描述、角色、业务规则、输入摘要或输出摘要
- **THEN** 新 Task 属性面板 MUST NOT 展示这些旧字段
- **AND** 系统 MUST NOT 把这些旧字段作为新 Task Web 测试模型的必填来源

#### Scenario: 内部 BPMN profile 保持可用
- **WHEN** 旧图或新图渲染 Task 节点
- **THEN** 系统 SHALL 保留内部 BPMN profile 以支持画布渲染、连接校验和旧图兼容
- **AND** 用户属性面板 MUST NOT 将内部 BPMN profile 暴露为 Task 业务字段
