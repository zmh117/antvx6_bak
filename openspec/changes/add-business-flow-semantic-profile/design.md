## Context

业务图当前采用双层模型：X6 画布用于渲染与交互，结构化业务表用于保存语义、历史、协作物化、ER 绑定和 Agent context。BPMN 模型已经收敛为通用 15 节点子集，后端 `business_flow/bpmn.py` 负责 BPMN 校验和旧 MES JSON 清理。Agent context 当前会汇总 ER 检索文档、关系、泳道业务图节点/边、ER 引用，并返回 `text + documents`。

新的能力要解决的是“业务语义可机器理解”而不是“再增加一批 MES 图标”。例如 MES 场景下，BPMN 的 TASK 只能说明这是一个任务；Profile 需要说明它是称量、投料、混合、采样、质检、放行、包装、清场，还是偏差处理，并给出对象、资源、前置条件、后置条件、规则、异常路径和 ER 读写绑定。

## Goals / Non-Goals

**Goals:**

- 在通用 BPMN 节点之上挂载领域业务语义，不改变 15 个 BPMN 工具箱节点。
- 提供可配置 Profile 注册、字段定义、受控词表和校验规则，支持 MES 模板，也支持后续其他产品模板。
- 将业务语义作为结构化语义数据持久化，进入组件模板、业务图实例、协作、历史、恢复和 Agent context。
- 让 Agent 通过后端 API 读取流程语义 JSON，而不是直接读数据库、图标、截图或原始 X6 JSON。
- 为用例生成提供明确输入：流程步骤、路径、分支条件、异常路径、数据对象、ER 引用、业务规则、前置/后置条件。

**Non-Goals:**

- 不恢复旧的硬编码 MES 字段或 MES 专用 BPMN 节点。
- 不替换 BPMN 校验、X6 渲染、Yjs 协作或现有业务图保存/历史架构。
- 不在第一版实现完整独立 Agent Runtime、MQ 执行平面或用例写回页面。
- 不要求所有旧图一次性补齐语义；旧图应继续可打开、可保存、可进入 Agent context。

## Decisions

### Decision 1: BPMN 与业务语义分层

BPMN 字段继续只描述流程语法：事件、任务、网关、子流程、调用活动、数据节点和 BPMN 连线类型。业务语义通过独立的 Semantic Profile 字段描述，节点和边都可以挂载 Profile。

建议的节点语义结构：

```json
{
  "profileKey": "mes-manufacturing",
  "profileVersion": 1,
  "payload": {
    "operationType": "QC_CHECK",
    "businessObject": "BATCH",
    "resourceRefs": ["equipment", "workcenter", "operator"],
    "materialRefs": ["material", "lot", "recipe"],
    "preconditions": ["工单已下发"],
    "postconditions": ["质检结果已记录"],
    "validationRules": ["不合格时必须进入偏差处理"],
    "exceptionHandlers": ["QUALITY_FAILED"]
  }
}
```

建议的边语义结构：

```json
{
  "profileKey": "mes-manufacturing",
  "profileVersion": 1,
  "payload": {
    "handoff": "QC_TO_PRODUCTION_MANAGER",
    "condition": "质检结果 = 合格",
    "message": "release_approved",
    "timeoutPolicy": null,
    "exceptionType": null
  }
}
```

Rationale: 这样能保持 BPMN 通用性，同时让 MES、LIMS、WMS、CRM 等业务语义通过配置扩展。

### Decision 2: Profile 注册表使用通用 schema + taxonomy

新增产品/领域可复用的 Profile 注册能力。Profile 定义应包含：

- `profile_key`：稳定键，例如 `generic-business-operation`、`mes-manufacturing`
- `domain`：业务领域，例如 `generic`、`mes`
- `target_scope`：`FLOW`、`NODE`、`EDGE`
- `version`
- `schema_json`：字段结构、必填规则、类型约束
- `taxonomy_json`：受控词表，例如 MES 操作类型、业务对象、资源类型、异常类型
- `quality_rules_json`：建模质量规则，例如关键任务必须绑定 ER 引用
- `status`

Rationale: Profile 定义进入数据层后，其他产品可以复用或复制模板，不需要发版才能新增业务分类。首版可以内置 seed 数据，后续再做 Profile 管理 UI。

### Decision 3: 语义 payload 进入结构化持久化字段

节点、边、泳道组件节点、泳道组件边都需要持久化业务语义。建议新增通用字段，而不是把语义混入 `style_json` 或只藏在前端：

- `semantic_profile_key`
- `semantic_profile_version`
- `semantic_payload_json`

流程级可通过业务图 `semantic_json` 或新增等价字段保存当前选用的 Profile 集合与全局语义。

Rationale: `properties_json` 当前承担杂项扩展并且有历史 MES 清理逻辑。业务语义是 Agent、查询、校验、历史恢复都依赖的结构化数据，应有明确字段边界。

### Decision 4: MES 是模板，不是核心模型

首批提供 MES Profile 模板，但不把 MES 类型写进 BPMN 枚举。推荐 MES 节点 taxonomy：

- `operationType`: `RECEIVE_MATERIAL`、`WEIGH`、`DISPENSE`、`MIX`、`REACT`、`SAMPLE`、`QC_CHECK`、`RELEASE`、`PACK`、`TRANSFER`、`CLEAN`、`STERILIZE`、`RECORD_AUDIT`、`HANDLE_DEVIATION`
- `businessObject`: `WORK_ORDER`、`BATCH`、`MATERIAL_LOT`、`RECIPE`、`EQUIPMENT`、`PROCESS_PARAMETER`、`QC_RESULT`、`EBR`、`AUDIT_TRAIL`
- `resourceType`: `OPERATOR`、`EQUIPMENT`、`WORKCENTER`、`SYSTEM`
- `exceptionType`: `QUALITY_FAILED`、`MATERIAL_SHORTAGE`、`EQUIPMENT_FAILURE`、`PARAMETER_OUT_OF_RANGE`、`SIGNATURE_REJECTED`

Rationale: 这能覆盖 MES 用例生成需要的语义，同时保持其他产品可用。

### Decision 5: Agent context 输出 text + structured JSON

现有 `GET /api/graphs/{graph_id}/agent-context?q=` 保留。扩展响应中的文档内容，增加结构化流程上下文，至少包含：

```json
{
  "businessFlows": [
    {
      "flowId": "...",
      "code": "...",
      "name": "...",
      "profileKeys": ["mes-manufacturing"],
      "steps": [],
      "edges": [],
      "dataObjects": [],
      "erRefs": [],
      "rules": [],
      "happyPaths": [],
      "branchPaths": [],
      "exceptionPaths": [],
      "qualityIssues": []
    }
  ]
}
```

Rationale: Agent 写用例需要稳定结构，不应只依赖自然语言摘要。自然语言 `text` 可继续用于提示词上下文，结构化 JSON 用于可重复推理和生成。

### Decision 6: 建模质量检查先做阻断少、提示多

首版以提示为主，避免旧图和半成品图无法保存。高风险错误继续阻断，例如 BPMN 数据节点必须用 Association。业务语义质量问题以 `qualityIssues` 返回给前端和 Agent context。

建议质量规则：

- 任务节点缺少 Profile 或 `operationType`
- 关键业务任务缺少 `actor` 或泳道责任方
- 关键业务任务缺少 ER 引用
- 网关出边缺少条件
- 条件流没有 `conditionText` 或语义边条件
- 数据节点没有绑定业务对象或 ER 引用
- 结束事件前存在未汇合并行路径

Rationale: 业务建模需要迭代，过早强阻断会影响画图；但 Agent 需要知道哪些部分不可靠。

## Data Model

推荐新增表：

```text
business_semantic_profile
- id
- product_id nullable
- profile_key
- domain
- target_scope
- version
- name
- description
- schema_json
- taxonomy_json
- quality_rules_json
- status
- created_at / updated_at
```

推荐新增列：

```text
business_flow_node
- semantic_profile_key nullable
- semantic_profile_version int nullable
- semantic_payload_json jsonb not null default '{}'

business_flow_edge
- semantic_profile_key nullable
- semantic_profile_version int nullable
- semantic_payload_json jsonb not null default '{}'

swimlane_component_node
- semantic_profile_key nullable
- semantic_profile_version int nullable
- semantic_payload_json jsonb not null default '{}'

swimlane_component_edge
- semantic_profile_key nullable
- semantic_profile_version int nullable
- semantic_payload_json jsonb not null default '{}'
```

如果实现中发现现有组件表名或字段名不同，应以实际迁移和 repository 为准，但字段边界保持一致。

## API / UI Design

- DTO 增加 `semantic_profile_key`、`semantic_profile_version`、`semantic_payload_json`，前端规范化为 `semanticProfileKey`、`semanticProfileVersion`、`semanticPayloadJson`。
- 业务图编辑器节点属性面板增加 Profile 选择与字段表单。
- 边属性面板增加条件、交接、消息、异常语义字段。
- Profile 字段表单由 `schema_json` 和 `taxonomy_json` 驱动，首版可先支持文本、枚举、多选、数组字符串、引用说明。
- ER 引用编辑继续使用现有 `READ / CREATE / UPDATE / DELETE / CHECK`，并在质量检查中提示关键步骤未绑定数据。

## Agent Context Design

Agent 读取路径：

```text
business_flow_* / semantic profile tables
-> agent_context_repository
-> agent_context_service
-> GET /api/graphs/{graph_id}/agent-context?q=
-> Agent 使用 text + documents + structured businessFlowContext
```

Agent 不直接解析图标，不直接读 X6 JSON，也不建议散落直连数据库。独立 Agent Runtime 后续可以通过 Internal API 或 MCP Gateway 调用该上下文 API。

## Migration Plan

1. 新增 Profile 注册表和语义字段，seed 通用与 MES Profile。
2. 旧图默认 `semantic_profile_key = null`、`semantic_payload_json = {}`，保持可打开和可保存。
3. 保存、协作物化、历史恢复、组件发布/放置全部透传新字段。
4. Agent context 先兼容无语义图，再增强有语义图的 structured JSON。
5. 前端编辑器先支持常用 MES 字段与通用字段，后续再扩展 Profile 管理 UI。

## Risks / Trade-offs

- Profile 太自由会降低 Agent 可靠性。缓解：使用 schema、taxonomy 和质量规则约束。
- 新增字段会增加保存/协作/历史链路改动面。缓解：沿现有 DTO、ops、materialize、restore 路径逐层透传并加回归测试。
- MES 模板可能不覆盖所有制造流程。缓解：模板作为 seed，可通过 Profile 注册扩展，不写死进 BPMN。
- 结构化 Agent context 可能影响现有客户端。缓解：保持原 `text + documents`，新增字段向后兼容。

## Open Questions

- Profile 是否需要第一版提供管理 UI，还是先通过 seed/migration 和后端只读 API 暴露？
- MES taxonomy 首版是否需要覆盖电子签名、审计追踪、设备状态、工艺参数上下限等细分类？
- Agent 生成用例的回写格式是否在本变更中定义，还是留给独立 Agent Runtime 变更？
