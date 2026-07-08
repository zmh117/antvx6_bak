## ADDED Requirements

### Requirement: BPMN Task supports page context
系统 SHALL 允许通用 BPMN Task 保存用于 Web 系统测试用例生成的页面上下文，并且该上下文 SHALL 与 BPMN 类型字段分层保存。

#### Scenario: User edits task page fields
- **WHEN** 用户选择 `bpmnElementType = TASK` 的业务流程节点并填写页面名称、路由模式和模块名称
- **THEN** 系统保存这些页面字段
- **AND** 节点仍保持通用 BPMN Task，不改变 BPMN 工具箱类型

#### Scenario: Non-task node is selected
- **WHEN** 用户选择事件、网关、数据节点或流程容器
- **THEN** 系统 MUST NOT 将 Task 页面字段作为该节点的必填字段

### Requirement: BPMN Task supports UI operation steps
系统 SHALL 允许通用 BPMN Task 保存有序 UI 操作步骤列表，用于描述测试生成所需的页面操作序列。

#### Scenario: User adds UI steps to task
- **WHEN** 用户在 Task 属性面板中添加多个 UI Step
- **THEN** 每个 UI Step SHALL 保存稳定 ID、步骤序号、控件类型、控件名称、动作类型、值、业务含义、预期结果和负向用例提示
- **AND** 系统 SHALL 保持步骤顺序可编辑和可持久化

#### Scenario: UI step omits locator
- **WHEN** 用户创建或保存 UI Step
- **THEN** UI Step SHALL NOT require Locator
- **AND** 系统 MUST NOT 把 Locator 作为 Task UI Step 的必填模型字段

#### Scenario: Element type and action type are inconsistent
- **WHEN** UI Step 使用不合理的控件类型和动作类型组合，例如 `Label + input`
- **THEN** 系统 SHALL 返回建模质量问题或校验错误
- **AND** Agent context SHALL NOT treat the invalid step as fully reliable test instruction

### Requirement: Task UI context persists through business-flow lifecycle
系统 SHALL 在业务图保存、增量变更、协作物化、泳道组件发布/放置、历史记录和恢复中保留 Task 页面上下文与 UI Steps。

#### Scenario: Collaborative user edits UI steps
- **WHEN** 协作者修改 Task 的 UI Steps 并触发 Yjs 协作文档物化
- **THEN** 后端结构化业务图状态 SHALL 保存更新后的 UI Steps
- **AND** 其他用户重新打开业务图时 SHALL 看到相同的 UI Steps

#### Scenario: Component with task UI steps is placed
- **WHEN** 泳道组件模板中的 Task 包含页面上下文和 UI Steps
- **THEN** 用户将该组件放置到业务图实例后，实例节点 SHALL 保留这些 Task UI 字段

#### Scenario: History restore includes task UI context
- **WHEN** 用户恢复一个包含 Task UI 上下文的业务图历史版本
- **THEN** 恢复后的节点 SHALL 保留页面字段、UI Steps、预期结果和断言

### Requirement: Agent context exposes task UI test context
系统 SHALL 在图 Agent context 中输出 Task 的页面上下文和 UI Steps，使 Agent 能够生成 Web 系统测试用例。

#### Scenario: Agent requests graph context
- **WHEN** Agent 调用 `GET /api/graphs/{graph_id}/agent-context`
- **THEN** 响应 SHALL 在结构化 businessFlowContext 中包含 Task 的 page、uiSteps、expectedResults 和 assertions
- **AND** 响应 SHALL 继续保持既有 text 和 documents 字段兼容

#### Scenario: Task UI context is incomplete
- **WHEN** Task 缺少页面名称、UI Steps 为空或步骤字段不完整
- **THEN** Agent context SHALL 包含质量问题
- **AND** 质量问题 SHALL 指明生成测试用例可能不完整

### Requirement: Task UI context remains separate from Locator and domain profile
系统 MUST 将 Task UI Steps 与 Locator、业务语义 Profile 分离，避免把页面定位细节或领域操作类型混入 BPMN Task 字段。

#### Scenario: Task has semantic profile and UI steps
- **WHEN** Task 同时拥有业务语义 Profile 和 UI Steps
- **THEN** 系统 SHALL 分别保存 semantic payload 与 Task UI context
- **AND** Agent context SHALL 能够同时读取业务语义和 UI 测试步骤

#### Scenario: Future automation generator needs locators
- **WHEN** 后续自动化测试代码生成需要 Locator
- **THEN** 系统 SHALL 通过独立页面组件目录或等价映射能力提供定位信息
- **AND** Task UI Step 模型 MUST NOT 被要求直接保存 Locator
