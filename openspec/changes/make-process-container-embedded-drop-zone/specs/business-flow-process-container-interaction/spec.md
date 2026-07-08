## ADDED Requirements

### Requirement: Process container renders as an embedded canvas frame
系统 SHALL 将流程容器渲染为业务流程图画布中的可视框，并提供可容纳 BPMN 元素的内部区域。

#### Scenario: User creates a process container
- **WHEN** 用户从 BPMN 工具箱拖入流程容器
- **THEN** 画布 SHALL 显示一个带标题区和内容区的流程容器框
- **AND** 该容器 SHALL 保留 BPMN 节点身份
- **AND** 该容器 SHALL 允许普通 BPMN 节点拖入其内容区

#### Scenario: User selects a process container
- **WHEN** 用户选中流程容器
- **THEN** 属性面板 SHALL 显示 BPMN 节点字段和流程容器配置
- **AND** 系统 MUST NOT 将流程容器显示为独立小画布或外部弹窗

### Requirement: Nodes can be dragged into a process container
系统 SHALL 允许用户将泳道内普通 BPMN 节点拖入流程容器，并实时反馈可放置状态。

#### Scenario: User drags a node over a process container
- **WHEN** 用户拖动 Task、Event、Gateway 或 Data 节点经过流程容器内容区
- **THEN** 目标流程容器 SHALL 显示命中或可放置状态
- **AND** 被拖动节点 SHALL 在画布上保持可见

#### Scenario: User drops a node inside a process container
- **WHEN** 用户在流程容器内容区释放普通 BPMN 节点
- **THEN** 系统 SHALL 将该节点设置为流程容器内部节点
- **AND** 系统 SHALL 更新该节点的 `containerNodeKey` 为流程容器节点 key
- **AND** 该节点 SHALL 继续保留所属泳道
- **AND** 该节点 SHALL 立即显示在流程容器内部
- **AND** 系统 SHALL 仅在节点外框完整位于流程容器内容区内时建立容器归属

#### Scenario: User attempts to drag a process container into another process container
- **WHEN** 用户将流程容器拖入另一个流程容器
- **THEN** 系统 SHALL 阻止该拖入行为
- **AND** 系统 SHALL 保持被拖动流程容器在泳道顶层

### Requirement: Nodes can be dragged out of a process container
系统 SHALL 允许用户将流程容器内部节点拖出到所属泳道顶层。

#### Scenario: User drags an internal node outside the container
- **WHEN** 用户将流程容器内部节点拖出容器边界并释放到同一泳道空白区域
- **THEN** 系统 SHALL 清空该节点的 `containerNodeKey`
- **AND** 系统 SHALL 将该节点重新挂到所属泳道顶层
- **AND** 该节点 SHALL 按释放位置显示在泳道内
- **AND** 后续移动原流程容器 MUST NOT 带动该节点移动

#### Scenario: User drags an internal node from one container to another
- **WHEN** 用户将流程容器内部节点拖到同一泳道内另一个流程容器内容区并释放
- **THEN** 系统 SHALL 将该节点的 `containerNodeKey` 更新为目标流程容器节点 key
- **AND** 该节点 SHALL 立即显示在目标流程容器内部

### Requirement: Process container maintains internal layout
系统 SHALL 保持流程容器内部节点的相对位置，并在必要时扩展容器尺寸。

#### Scenario: Internal node is placed near container edge
- **WHEN** 用户将节点拖入流程容器且节点超出当前内容区
- **THEN** 流程容器 SHALL 自动扩展到可容纳该节点
- **AND** 节点 SHALL 不被容器标题区遮挡

#### Scenario: User moves a process container with internal nodes
- **WHEN** 用户移动包含内部节点的流程容器
- **THEN** 内部节点 SHALL 在视觉上随容器移动
- **AND** 内部节点相对流程容器的位置 SHALL 保持稳定
- **AND** 相关连线 SHALL 继续连接到正确端口

#### Scenario: User resizes a process container
- **WHEN** 用户缩放流程容器
- **THEN** 系统 SHALL 调整流程容器尺寸并保存新尺寸
- **AND** 系统 MUST NOT 允许流程容器缩小到遮挡或裁切内部节点

### Requirement: Process container supports internal and boundary-crossing edges
系统 SHALL 允许流程容器内部节点正常连线，并允许内部节点连接到容器外部节点。

#### Scenario: User connects two internal nodes in the same container
- **WHEN** 用户连接同一流程容器内的两个节点
- **THEN** 系统 SHALL 创建并保存该连线
- **AND** Agent context SHALL 将该连线标记为 `insideContainer`

#### Scenario: User connects an internal node to an external node
- **WHEN** 用户连接流程容器内部节点与容器外部节点
- **THEN** 系统 SHALL 创建并保存该连线
- **AND** Agent context SHALL 将该连线标记为 `crossContainerBoundary`

#### Scenario: User connects two top-level nodes
- **WHEN** 用户连接两个都不在流程容器内部的节点
- **THEN** 系统 SHALL 创建并保存该连线
- **AND** Agent context SHALL 将该连线标记为 `topLevel`

### Requirement: Process container hierarchy persists across lifecycle paths
系统 SHALL 在业务图保存、增量变更、协作物化、历史恢复、泳道组件发布和组件放置中保留流程容器层级。

#### Scenario: User saves a graph with internal nodes
- **WHEN** 用户保存包含流程容器内部节点的业务流程图
- **THEN** 后端 SHALL 保存流程容器节点、内部节点和内部节点的 `containerNodeKey`
- **AND** 再次打开该图时，内部节点 SHALL 仍显示在流程容器内部

#### Scenario: Collaborative user moves a node into a container
- **WHEN** 协作者将节点拖入流程容器并同步
- **THEN** 其他在线用户 SHALL 看到该节点进入同一流程容器
- **AND** 后端物化状态 SHALL 保留该节点的 `containerNodeKey`

#### Scenario: User restores history containing process containers
- **WHEN** 用户恢复包含流程容器和内部节点的历史版本
- **THEN** 恢复后的画布 SHALL 保留容器、内部节点、相对坐标和相关连线

#### Scenario: User places a swimlane component with process containers
- **WHEN** 用户将包含流程容器和内部节点的泳道组件放入业务图
- **THEN** 系统 SHALL 重映射所有节点 key
- **AND** 系统 SHALL 同步重写内部节点的 `containerNodeKey`
- **AND** 新实例 SHALL 保留组件模板中的容器层级

### Requirement: Process container deletion protects internal content
系统 SHALL 防止用户误删仍包含内部节点的流程容器。

#### Scenario: User deletes a non-empty process container
- **WHEN** 用户尝试删除包含内部节点的流程容器
- **THEN** 系统 SHALL 阻止删除
- **AND** 系统 SHALL 保留流程容器及其内部节点

#### Scenario: User deletes an empty process container
- **WHEN** 用户删除不包含内部节点的流程容器
- **THEN** 系统 SHALL 删除该流程容器
- **AND** 系统 SHALL 保留同泳道内其他节点和连线

### Requirement: Agent context exposes process container structure
系统 SHALL 在 Agent context 中输出流程容器层级、内部节点和边作用域，使 Agent 能准确理解子流程。

#### Scenario: Agent reads a graph with a process container
- **WHEN** Agent 调用 `GET /api/graphs/{graph_id}/agent-context`
- **THEN** 响应 SHALL 包含流程容器列表
- **AND** 每个流程容器 SHALL 输出容器 key、标题、模式、内部节点 key 列表和质量问题

#### Scenario: Agent reads internal nodes
- **WHEN** Agent context 包含流程容器内部节点
- **THEN** 每个内部节点 SHALL 输出其 `containerNodeKey`
- **AND** 该节点 SHALL 继续输出所属泳道和 BPMN 类型
