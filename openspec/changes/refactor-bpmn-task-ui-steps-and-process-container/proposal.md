## Why

当前业务流程图的 BPMN 节点属性以“标题、描述、角色、业务规则、输入摘要、输出摘要”为主，适合作为通用备注，但不足以让 Agent 稳定生成 Web 系统测试用例。Task 需要结构化表达页面、UI 操作步骤和断言；同时 SubProcess 与 Call Activity 在建模体验上需要收敛为一个可展开的流程容器，支持内部节点和跨容器连线。

## What Changes

- 为通用 BPMN Task 增加 Web 测试生成上下文：页面字段、UI Steps、预期结果、断言和负向用例提示。
- UI Steps 明确包含控件类型、控件名称、动作类型、值、业务含义和预期结果，但不包含 Locator。
- 将工具箱中的 SubProcess 与 Call Activity 合并为一个“流程容器”元素。
- 流程容器拖到画布后展示为可容纳内部元素的框，内部节点可拖入、拖出，并可正常连线。
- 流程容器内部节点允许连接到容器外部节点，系统需要识别并持久化跨容器边界连线。
- 新建流程容器支持 `embedded` 与 `reusableCall` 两种模式；旧 Call Activity 图不做自动迁移。
- 扩展结构化保存、协作、历史恢复、泳道组件模板和 Agent context，使 Task UI Steps 与流程容器层级不丢失。
- 保持 BPMN 与业务语义分层：BPMN 表达流程语法，Task UI Steps 与流程容器配置表达测试生成和产品建模语义。

## Capabilities

### New Capabilities

- `business-flow-task-ui-test-context`: 定义 BPMN Task 的页面信息、UI 操作步骤、预期结果、断言和 Agent context 输出。
- `business-flow-process-container`: 定义合并后的流程容器元素、容器内节点、跨容器连线、结构化持久化和协作恢复行为。

### Modified Capabilities

- 无。

## Impact

- 前端 BPMN 类型与工具箱：`front/src/entities/business-flow/model/bpmn.ts`、`front/src/entities/business-flow/model/types.ts`
- 前端业务图 API 规范化：`front/src/entities/business-flow/api/businessFlowApi.ts`
- X6 画布交互与序列化：`front/src/features/business-flow/infrastructure/x6/businessFlowX6.ts`
- Yjs 协作读写：`front/src/features/business-flow/infrastructure/yjs/businessFlowCollaboration.ts`
- 业务图编辑器和泳道组件编辑器属性面板
- 差量保存与本地草稿：`buildBusinessFlowOps.ts`、`localBusinessFlowStore.ts`
- 后端 DTO、BPMN 校验、业务图路由、泳道组件路由、历史恢复和协作物化
- 数据库迁移：业务图节点与泳道组件节点需要保存 Task UI 上下文和容器父子关系
- Agent context：`agent_context_repository.py`、`agent_context_service.py`、`GET /api/graphs/{graph_id}/agent-context`
