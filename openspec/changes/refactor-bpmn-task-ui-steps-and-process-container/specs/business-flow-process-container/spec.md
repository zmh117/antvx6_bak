## ADDED Requirements

### Requirement: BPMN toolbox exposes a unified process container
系统 SHALL 将新建 SubProcess 与 Call Activity 的建模入口合并为一个流程容器元素，并通过容器模式表达内嵌子流程或可复用调用。

#### Scenario: User opens BPMN toolbox
- **WHEN** 用户打开业务流程图或泳道组件编辑器的 BPMN 工具箱
- **THEN** 工具箱 SHALL 显示一个流程容器元素
- **AND** 工具箱 MUST NOT 同时显示独立的 SubProcess 和 Call Activity 新建入口

#### Scenario: User creates reusable call container
- **WHEN** 用户拖入流程容器并选择 `reusableCall` 模式
- **THEN** 系统 SHALL 允许用户填写被调用流程引用和版本策略
- **AND** 该容器 SHALL 使用统一流程容器交互行为

#### Scenario: Existing call activity graph is opened
- **WHEN** 用户打开旧图中已有的 Call Activity
- **THEN** 系统 SHALL 兼容读取和保存该旧节点
- **AND** 系统 MUST NOT 自动把旧节点批量迁移为流程容器

### Requirement: Process container supports internal nodes
系统 SHALL 允许流程容器在画布中承载内部 BPMN 节点，并结构化保存容器父子关系。

#### Scenario: User drags a node into a process container
- **WHEN** 用户将 Task、Event、Gateway 或 Data 节点拖入流程容器
- **THEN** 系统 SHALL 将该节点设为容器内部节点
- **AND** 系统 SHALL 保存该节点的 `containerNodeKey`
- **AND** 该节点 SHALL 继续保留所属泳道信息

#### Scenario: User drags a node out of a process container
- **WHEN** 用户将容器内部节点拖回泳道顶层
- **THEN** 系统 SHALL 清空该节点的 `containerNodeKey`
- **AND** 系统 SHALL 将节点坐标转换为相对泳道的位置

#### Scenario: Process container moves
- **WHEN** 用户移动流程容器
- **THEN** 容器内部节点 SHALL 在画布上随容器移动
- **AND** 内部节点的相对坐标 SHALL 保持稳定

### Requirement: Process container supports internal and cross-boundary edges
系统 SHALL 允许流程容器内部节点正常连线，并允许内部节点连接到容器外部节点。

#### Scenario: User connects two nodes inside the same process container
- **WHEN** 用户连接同一流程容器内的两个节点
- **THEN** 系统 SHALL 保存该连线
- **AND** Agent context SHALL 将该连线标记为容器内部连线

#### Scenario: User connects internal node to external node
- **WHEN** 用户连接流程容器内部节点与容器外部节点
- **THEN** 系统 SHALL 保存该跨容器边界连线
- **AND** Agent context SHALL 将该连线标记为跨容器边界连线

#### Scenario: User connects top-level nodes outside containers
- **WHEN** 用户连接两个不在流程容器内部的节点
- **THEN** 系统 SHALL 保存该连线
- **AND** Agent context SHALL 将该连线标记为顶层连线

### Requirement: Process container semantics persist through lifecycle paths
系统 SHALL 在业务图保存、增量变更、协作物化、泳道组件发布/放置、历史记录和恢复中保留流程容器、内部节点、父子关系和跨边界连线。

#### Scenario: Collaborative user moves node into container
- **WHEN** 协作者将节点拖入流程容器并触发协作同步
- **THEN** 其他用户 SHALL 看到该节点处于同一流程容器内部
- **AND** 后端物化状态 SHALL 保存该节点的 `containerNodeKey`

#### Scenario: Component with process container is placed
- **WHEN** 泳道组件模板包含流程容器和内部节点
- **THEN** 用户将组件放入业务图实例后，容器层级和内部节点 SHALL 保留
- **AND** 新实例节点键 SHALL 不与已有业务图节点冲突

#### Scenario: History restore includes process containers
- **WHEN** 用户恢复包含流程容器的业务图历史版本
- **THEN** 恢复后的业务图 SHALL 保留流程容器、内部节点、容器父子关系和相关连线

### Requirement: Process container modeling quality is checked
系统 SHALL 对流程容器相关建模问题返回质量问题或阻断错误，避免 Agent 将不可靠结构当成完整流程。

#### Scenario: Process container has no internal nodes
- **WHEN** 流程容器为空
- **THEN** 系统 SHALL 返回非阻断质量问题
- **AND** Agent context SHALL 标记该容器缺少内部流程

#### Scenario: Reusable call container has no called process reference
- **WHEN** 流程容器模式为 `reusableCall` 但未填写被调用流程引用
- **THEN** 系统 SHALL 返回非阻断质量问题

#### Scenario: Container nesting exceeds supported depth
- **WHEN** 用户尝试创建超过系统支持深度的流程容器嵌套
- **THEN** 系统 SHALL 阻止该结构或返回明确错误

### Requirement: Agent context exposes process container hierarchy
系统 SHALL 在图 Agent context 中输出流程容器层级、内部步骤和边作用域，使 Agent 能够理解子流程与跨边界流转。

#### Scenario: Agent reads flow with process container
- **WHEN** Agent 调用 `GET /api/graphs/{graph_id}/agent-context`
- **THEN** 响应 SHALL 包含 containers 列表
- **AND** 每个容器 SHALL 输出 container key、模式、内部 step keys 和质量问题

#### Scenario: Agent reads cross-boundary edge
- **WHEN** 业务图中存在流程容器内部节点连接到外部节点的边
- **THEN** Agent context SHALL 输出该边的 source、target 和 `edgeScope = crossContainerBoundary`
