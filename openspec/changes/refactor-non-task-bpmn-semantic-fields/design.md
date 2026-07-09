## Context

当前工具箱共有 13 个 BPMN 节点，其中 Task 已使用独立的 `task_ui_json` Web 测试模型；其余 12 个节点仍共用 `title / description / actor / business_rule / input_summary / output_summary`，并在属性面板暴露内部 BPMN profile。Sequence、Message、Association 连线也主要依赖 `label`、少量 condition 字段和通用语义 payload。

业务流程数据同时存在于 X6 cell data、组件草稿与发布版本、业务图结构化表、画布快照、差量操作、Yjs 文档、历史快照和 Agent context。只替换属性面板会造成刷新丢失、协作覆盖、历史不一致或 Agent 继续读取旧字段，因此本变更必须覆盖完整数据链路。

已确认边界：

- 仅改当前 12 个非 Task 节点和 Sequence、Message、Association 连线。
- 不新增边界事件、Rule、Pool、Lane、子流程、调用活动或其他工具箱元素。
- 删除旧用户字段，但每种元素保留专属名称并同步画布文字。
- 数据库旧列保留，不做破坏性删除；新语义停止依赖旧字段。
- 仅四类数据节点允许 ER 绑定。
- UI 全中文，代码和存储 key 保持英文稳定。

## Goals / Non-Goals

**Goals:**

- 为 12 个非 Task 节点和 3 类连线建立按 BPMN 类型区分的强类型业务语义。
- 用专属名称替代通用“标题”，用结构化字段替代描述、角色、业务规则和输入输出摘要。
- 保留内部 BPMN profile 作为节点身份、渲染和连接规则，不再由用户编辑。
- 让新语义贯穿 X6、API、数据库、Yjs、组件发布与放置、历史恢复和 Agent context。
- 让 Agent 能直接读取触发、分支、条件、事务、补偿、数据和预期结果，生成更完整的测试场景。

**Non-Goals:**

- 不修改 Task Web 测试模型。
- 不扩展 BPMN 工具箱，不实现边界事件挂载、Pool 或独立 Rule 目录。
- 不把业务规则表达式执行为代码；表达式只作为建模和测试生成依据。
- 不删除旧数据库列，不批量清除旧数据。
- 不让非数据节点或连线绑定 ER 字段。
- 不从截图、SVG 或数据库表直接推断图语义。

## Decisions

### Decision 1: 使用独立 `bpmn_semantic_json`，不复用通用语义 Profile

在以下四张结构化表增加 `bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb`：

- `swimlane_component_node`
- `swimlane_component_edge`
- `business_flow_node`
- `business_flow_edge`

前端 DTO 使用 `bpmnSemanticJson`，后端数据库字段使用 `bpmn_semantic_json`。JSON 顶层统一包含：

```json
{
  "schemaVersion": 1,
  "semanticType": "startEvent"
}
```

`semanticType` 是判别联合的稳定标识，必须与内部 BPMN profile 一致。节点和连线专属字段只存在于该 JSON 中。

Rationale: `semantic_payload_json` 与已废弃的业务语义 Profile 绑定，继续复用会保留“先选 Profile 再填通用 payload”的错误抽象；`properties_json` 同时承载画布和兼容数据，继续扩张会弱化领域边界。独立 JSONB 能保持数据库扩展性，同时让 TypeScript/Python 领域层强类型约束。

Alternatives considered:

- 复用 `semantic_payload_json`：迁移较少，但会让新 BPMN 模型继续依赖已废弃 Profile。
- 写入 `properties_json.bpmnSemantics`：无需迁移，但与画布属性、历史清洗和内部 BPMN profile 混杂。
- 每个字段独立建列：查询直观，但类型多、字段稀疏，未来增加字段需要频繁迁移。

### Decision 2: 按 15 种元素身份定义判别联合

节点语义模型：

| BPMN 元素 | `semanticType` | 专属名称 key | 主要字段 |
| --- | --- | --- | --- |
| 开始事件 | `startEvent` | `eventName` | `triggerType`、`triggerSource`、`startCondition`、`inputDataRefs`、`initiator`、`frequency`、`preCheckRules` |
| 中间事件 | `intermediateEvent` | `eventName` | `catchOrThrow`、`eventDefinition`、`interrupting`、`timeout`、`messageName`、`errorCode`、`escalationCode`、`businessMeaning` |
| 结束事件 | `endEvent` | `eventName` | `resultType`、`finalBusinessState`、`outputDataRefs`、`notifyTargets`、`auditRequired`、`rollbackRequired` |
| 事务 | `transaction` | `transactionName` | `transactionType`、`successCriteria`、`cancelTriggers`、`compensationPolicy`、`compensationOrder`、`consistencyLevel`、`timeout`、`isolationNote`、`compensationTasks`、`partialSuccessPolicy`、`auditRequired` |
| 排他网关 | `exclusiveGateway` | `decisionName` | `decisionVariable`、`branches`、`defaultFlowId`、`conditionExpressionType`、`mutuallyExclusive`、`coverageRequired` |
| 包容网关 | `inclusiveGateway` | `decisionName` | `branchConditions`、`allowMultipleBranches`、`mergePolicy`、`minSelectedBranches`、`coverageRequired` |
| 并行网关 | `parallelGateway` | `gatewayName` | `parallelMode`、`waitForAll`、`expectedBranches`、`partialFailurePolicy`、`timeout`、`concurrencyLimit` |
| 复杂网关 | `complexGateway` | `gatewayName` | `activationCondition`、`completionCondition`、`requiredCount`、`totalCount`、`customRule`、`explanation` |
| 数据对象 | `dataObject` | `dataName` | `entityName`、`schemaRef`、`lifecycleState`、`ownerActivityRef`、`readByRefs`、`writeByRefs` |
| 数据输入 | `dataInput` | `dataName` | `sourceType`、`sourceRef`、`required`、`validationRules`、`exampleValue`、`sensitiveLevel`、`defaultValue` |
| 数据输出 | `dataOutput` | `dataName` | `targetType`、`targetRef`、`outputContract`、`transformRule`、`successOutput`、`failureOutput` |
| 数据存储 | `dataStore` | `dataName` | `storeType`、`systemRef`、`accessMode`、`consistencyLevel`、`retentionPolicy`、`privacyLevel` |

连线语义模型：

| BPMN 连线 | `semanticType` | 专属名称 key | 主要字段 |
| --- | --- | --- | --- |
| Sequence | `sequenceFlow` | `flowName` | `flowKind`、`conditionText`、`conditionExpression`、`conditionExpressionType`、`priority`、`isDefault`、`businessRuleRefs`、`testScenarioType`、`expectedResult` |
| Message | `messageFlow` | `messageName` | `businessMeaning`、`senderRef`、`receiverRef`、`payloadDataRefs`、`deliveryMode`、`timeout`、`testScenarioType`、`expectedResult` |
| Association | `association` | `associationName` | `businessMeaning`、`direction`、`dataRole`、`testScenarioType`、`expectedResult` |

Rationale: 判别联合让属性面板、归一化、质量检查和 Agent projection 使用同一身份，不需要根据存在某个字段猜测元素类型。

Alternatives considered:

- Event/Gateway/Data/Flow 只分五个大类：实现较少，但仍会出现大量不适用字段。
- 每种类型单独数据库表：约束最强，但会显著增加发布、放置、历史和协作的聚合复杂度。

### Decision 3: 专属名称是业务来源，旧 `title/label` 只做显示缓存

前端使用统一 helper：

```text
semanticDisplayName(profile, bpmnSemanticJson)
```

专属名称改变时，helper 同步：

- X6 label/text；
- DTO 的 `title` 或 `label` 兼容缓存；
- `bpmnSemanticJson` 内的专属名称字段。

旧图没有新 JSON 时，只允许 `title/label -> 专属名称` 的一次性 fallback；`description/actor/business_rule/input_summary/output_summary` 不自动拼接或迁移，避免把不同类型的旧备注错误解释成结构化语义。

Rationale: 画布、列表和旧 API 仍依赖 `title/label`，立即停止写入会造成显示回归；把它降级为派生缓存能兼容现有渲染，又避免双重业务来源。

### Decision 4: 内部 BPMN profile 固定且隐藏

`bpmn_element_type`、event kind、gateway type、subprocess kind、flow type 等字段继续保留，用于：

- 工具箱创建正确形状；
- X6 渲染；
- 节点与连线合法性校验；
- 旧图加载和数据库约束。

属性面板不再渲染 `BpmnNodeProfileFields` 或 `BpmnEdgeProfileFields`。用户如需更换类型，应删除并从工具箱创建正确元素，不能通过属性面板把已存在元素原地变成另一种类型。

Rationale: 元素类型决定形状、字段模型和连接规则，允许原地切换会引入语义 JSON 迁移、非法字段残留和协作冲突。

### Decision 5: ER 绑定复用现有关系表，只对四类数据节点开放

不在 `bpmn_semantic_json` 重复保存 `erTableRefs/erFieldRefs`。四类数据节点继续通过现有 `erRefs`、`business_flow_node_er_ref` 及组件对应结构保存绑定；属性面板将其作为数据语义的一部分展示。

前后端统一使用：

```text
isDataBpmnElement(profile)
```

控制 UI、写入校验、差量操作、组件发布与放置、历史恢复和 Agent projection。非数据节点和连线的新写入不得创建 ER 绑定；遗留绑定不在 UI 和 Agent context 暴露，数据库本次不做批量破坏性清理。

Rationale: ER 引用已经有稳定 key、引用类型和关系表，复制进 JSON 会形成两个真相源。

### Decision 6: 网关分支引用连线稳定 key

排他网关 `branches/defaultFlowId`、包容网关 `branchConditions`、并行网关 `expectedBranches` 均引用业务图内稳定 `edgeKey`，不引用数组下标、画布临时 cell id 或连线显示名。

前端编辑器从当前网关实际入边/出边生成可选择列表。后端质量校验检查：

- 引用的 edge 是否存在并连接该网关；
- `defaultFlowId` 与 Sequence 的 `isDefault` 是否一致；
- 排他分支条件是否缺失或重复；
- 包容网关最少命中数是否合法；
- 并行/复杂网关数量约束是否与实际分支冲突。

Rationale: 稳定 key 才能跨保存、组件实例化、历史和协作保持引用关系。

### Decision 7: 共享归一化与质量问题模型

前端新增非 Task BPMN semantic helper，负责：

- 创建各类型空模型；
- 中文枚举与英文值映射；
- 旧名称 fallback；
- JSON 清洗和未知字段忽略；
- 专属名称读取；
- 前端即时质量提示。

后端领域层实现同构的判别、归一化和质量校验，作为 API 保存、组件发布、实例化、协作物化、历史恢复和 Agent projection 的权威规则。HTTP router 只做 DTO 适配，不内嵌类型判断。

质量问题至少覆盖：缺名称、必需字段缺失、枚举非法、语义类型与 BPMN profile 不匹配、网关引用不存在、默认路径冲突、Saga 缺补偿、数据引用不存在、非数据节点 ER 绑定。

### Decision 8: Agent 读取结构化语义层

现有 Agent context 保持 `text + documents` 响应兼容，并为每个节点与连线输出：

- 稳定 `nodeKey/edgeKey`；
- 内部 BPMN 身份；
- 归一化后的 `bpmnSemantic`；
- 数据节点合法 `erRefs`；
- 与该元素相关的质量问题。

网关分支和连线条件使用稳定 key 互相关联。Agent 不读取旧通用备注、业务语义 Profile 或非数据节点遗留 ER 绑定，也不直接查询业务数据库来猜图标含义。

Rationale: X6 快照适合渲染，不适合作为 Agent 业务语义源；结构化投影可搜索、可验证且能稳定生成测试用例。

## Risks / Trade-offs

- [Risk] 12 类节点和 3 类连线的表单较多，重复 UI 代码会快速膨胀。→ Mitigation: 使用共享数组编辑器、引用选择器、中文枚举控件和类型分发容器，但保留每类字段的显式 schema。
- [Risk] `bpmn_semantic_json` 与 `title/label` 可能不一致。→ Mitigation: 所有创建、编辑、保存、Yjs 和恢复路径统一调用名称同步 helper，后端保存时以专属名称重建缓存。
- [Risk] 旧图只有通用备注，迁移后部分信息不会自动进入新字段。→ Mitigation: 仅安全迁移名称；旧列保留供审计和回滚，不做可能产生错误语义的自动映射。
- [Risk] 网关引用 edge key 在组件实例化时需要重映射。→ Mitigation: 发布与放置阶段建立 component edge key 到 instance edge key 的映射，再重写语义中的分支引用。
- [Risk] Yjs 对整个 JSON 对象进行替换可能导致同一元素并发编辑覆盖。→ Mitigation: 至少按 node/edge key 增量同步；同一元素字段级并发是否进一步拆分 Y.Map 由实现阶段验证，不能回退为全图覆盖。
- [Risk] 旧非数据节点 ER 绑定仍留在数据库。→ Mitigation: 新 UI、写入和 Agent 投影全部过滤；物理清理留给单独迁移。
- [Risk] 中间事件字段包含“是否中断”，但当前无边界事件。→ Mitigation: 仅表达该中间事件对当前流程等待/抛出行为的影响，不提供挂载活动或边界位置字段。

## Migration Plan

1. 增加四张结构化表的 `bpmn_semantic_json` JSONB 列和注释，不删除旧列。
2. 建立 TypeScript 判别联合、中文映射、空模型、归一化、名称同步和质量检查。
3. 建立 Python 领域模型/归一化/质量检查，并接入 DTO、保存、组件发布与放置、协作物化和历史恢复。
4. 替换业务流程编辑器与泳道组件编辑器的非 Task 节点和连线面板，隐藏旧字段、内部 BPMN profile 和业务语义 Profile。
5. 收紧 ER 绑定：仅四类数据节点读写和显示；更新差量操作、发布/放置与恢复路径。
6. 更新 X6、API 和 Yjs 数据投影，保证专属名称、JSON 和兼容显示缓存一致。
7. 更新 Agent context 与质量问题输出，增加基于稳定 key 的网关分支、路径条件、事务补偿和数据 ER 语义。
8. 通过前后端单元测试、构建、API、浏览器、双客户端协作、组件发布/放置和历史恢复验证。

Rollback：旧列和内部 BPMN profile 均保留，可回滚应用代码；新增 JSONB 列保留不会影响旧版本。回滚不会把新结构化字段反向拼接到旧备注字段。

## Open Questions

无。元素范围、名称同步、旧列兼容、字段语言和 ER 绑定边界均已确认。
