## ADDED Requirements

### Requirement: Process container capability is disabled
系统 SHALL 禁用流程容器产品能力，同时保留旧数据字段兼容。

#### Scenario: User opens BPMN toolbox
- **WHEN** 用户打开业务图或泳道组件的 BPMN 工具箱
- **THEN** 工具箱 MUST NOT 显示“流程容器”节点
- **AND** 系统 MUST NOT 通过工具箱创建带 `processContainerJson` 的节点

#### Scenario: User selects a BPMN node
- **WHEN** 用户选中任意 BPMN 节点
- **THEN** 属性面板 MUST NOT 显示“流程容器”配置区域
- **AND** Task UI Steps/Page 字段 SHALL 继续按 Task 节点展示

#### Scenario: User moves BPMN nodes on canvas
- **WHEN** 用户拖动 BPMN 节点
- **THEN** 系统 MUST NOT 执行流程容器命中、高亮、拖入、拖出或重归属逻辑
- **AND** 系统 SHALL 只保留泳道父子关系

#### Scenario: User resizes canvas elements
- **WHEN** 用户在画布上选中节点
- **THEN** 系统 MUST NOT 为流程容器提供缩放能力
- **AND** 泳道缩放 SHALL 保持原有行为

### Requirement: Legacy process container data is ignored at runtime
系统 SHALL 在运行时过滤旧流程容器节点，并保留非容器节点。

#### Scenario: User opens an old graph with process containers
- **WHEN** 图中存在历史流程容器节点
- **THEN** 系统 SHALL 从画布中过滤这些流程容器节点
- **AND** 系统 SHALL 保留原内部节点
- **AND** 系统 SHALL 清空原内部节点的 `containerNodeKey`
- **AND** 系统 SHALL 将原内部节点恢复为泳道顶层节点

#### Scenario: Old graph has edges connected to process containers
- **WHEN** 历史连线的 source 或 target 是被过滤的流程容器节点
- **THEN** 系统 SHALL 过滤该连线
- **AND** 其他普通节点之间的连线 SHALL 保留

#### Scenario: Collaborative document contains process container data
- **WHEN** 协作文档中仍存在历史流程容器节点或容器归属字段
- **THEN** 本地画布状态 SHALL 清洗这些流程容器节点
- **AND** 本地缓存 SHALL 不再保留容器归属

### Requirement: Agent context does not expose process containers
系统 SHALL 在 Agent Context 中忽略流程容器语义。

#### Scenario: Agent reads a graph with legacy process containers
- **WHEN** Agent 获取业务图上下文
- **THEN** 响应 MUST NOT 输出流程容器列表
- **AND** 响应 MUST NOT 将节点标记为流程容器内部节点
- **AND** 连线作用域 SHALL 视为 `topLevel`
