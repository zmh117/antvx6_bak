## Why

当前业务流程图已经收敛为通用 BPMN 子集：15 个节点、结构化泳道、节点/边字段、ER 引用、协作与历史链路。这个模型能表达基础流程，但对 MES 生产制造用例生成还不够稳定：Agent 只能从标题、规则、输入输出和自由 JSON 里推断“称量、投料、质检、放行、异常处理”等业务含义，缺少可校验、可检索、可复用的业务语义。

此前已经清理过硬编码 MES 字段，目的是让业务图能服务多个产品。因此新的能力不应把 MES 重新写死进 BPMN 节点模型，而应在通用 BPMN 上增加可配置的“业务语义 Profile”：BPMN 负责流程语法，Profile 负责领域语义，Agent 读取后端生成的结构化上下文来写用例。

## What Changes

- 增加业务语义 Profile 机制，用通用结构描述节点、边、流程的领域语义，不改变现有 15 个 BPMN 工具箱节点。
- 增加产品/领域可复用的 Profile 注册与校验能力，首批提供通用 Profile 与 MES 生产制造 Profile 模板。
- 将节点/边的业务语义从自由文本升级为结构化语义 payload，同时保留 `actor`、`businessRule`、`inputSummary`、`outputSummary`、`erRefs` 等现有字段。
- 在业务图编辑器中支持选择语义 Profile、填写受控字段、提示建模质量问题，例如任务缺少操作类型、网关出边缺少条件、关键任务缺少 ER 引用。
- 在后端保存、协作物化、历史/恢复、泳道组件模板中传递业务语义 Profile，避免只存在于前端画布。
- 扩展 Agent context，让 Agent 读取结构化流程语义、路径、数据引用、ER 绑定和规则，而不是解析图标或 X6 渲染 JSON。

## Capabilities

### New Capabilities

- `business-flow-semantic-profile`: 业务流程图可在通用 BPMN 之上挂载可配置业务语义 Profile，并向 Agent 输出结构化上下文。

### Modified Capabilities

- `business-flow-bpmn-modeling`: 保持 BPMN 工具箱通用，不引入 MES 专用节点。
- `graph-agent-context`: Agent context 增加业务语义 JSON 投影，继续通过后端 API 读取图上下文。

## Impact

- 前端业务流程模型与编辑器：
  - `front/src/entities/business-flow/model/types.ts`
  - `front/src/entities/business-flow/model/bpmn.ts`
  - `front/src/features/business-flow-editor/**`
  - `front/src/features/business-flow/infrastructure/x6/**`
  - `front/src/features/business-flow/infrastructure/yjs/**`
- 后端业务流程 DDD、DTO、路由与校验：
  - `back/app/domain/business_flow/**`
  - `back/app/interfaces/http/schemas/business_flow/**`
  - `back/app/interfaces/http/routers/business_flow/routes.py`
  - `back/app/interfaces/http/routers/swimlane_components.py`
- Agent 上下文：
  - `back/app/application/agent_context_service.py`
  - `back/app/application/business_flow/queries/get_agent_context.py`
  - `back/app/infrastructure/db/repositories/agent_context_repository.py`
  - `back/app/interfaces/http/routers/graphs.py`
- 数据库与迁移：
  - 新增 Profile 注册表或等价配置表
  - 为业务图节点/边、泳道组件节点/边增加通用业务语义字段
  - 保持旧图兼容，不恢复旧 MES 专用字段
- 测试与验证：
  - 前端类型/构建、业务图保存/恢复、协作物化、Agent context 输出、后端校验与迁移回归
