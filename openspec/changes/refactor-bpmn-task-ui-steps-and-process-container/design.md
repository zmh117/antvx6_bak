## Context

当前业务流程图已经采用双层模型：X6 画布负责渲染和交互，结构化表负责保存 BPMN 语义、ER 绑定、历史、恢复、协作物化和 Agent context。BPMN 工具箱已经收敛到通用节点集合，`front/src/entities/business-flow/model/bpmn.ts` 是前端 BPMN 工具箱和 Profile 的主要入口，后端 `back/app/domain/business_flow/bpmn.py` 负责 BPMN 节点/边校验。

当前节点字段 `title / description / actor / businessRule / inputSummary / outputSummary` 对人类备注足够，但对 Web 系统测试用例生成不够结构化。Agent 需要知道 Task 操作哪个页面、按什么顺序操作哪些 UI 元素、输入什么值、预期页面或数据状态如何变化。用户明确要求 Task 支持 Page 与 UI Steps，但 UI Steps 不包含 Locator。

另一个结构性问题是 SubProcess 与 Call Activity 在工具箱中分散为两个元素，但用户希望它们在建模体验中合并为一个可展开的流程容器。该容器拖到业务图中后应显示为一个框，允许其他元素拖入内部，并允许容器内部节点连接到外部节点。

## Goals / Non-Goals

**Goals:**

- 为通用 BPMN Task 增加结构化 Web 测试上下文：页面、UI Steps、预期结果、断言和负向用例提示。
- 明确 UI Steps 不包含 Locator；未来自动化代码定位应由独立页面组件目录或 Page Object 能力解决。
- 将新建 SubProcess 与 Call Activity 建模入口合并为一个流程容器元素。
- 流程容器支持 `embedded` 与 `reusableCall` 两种模式，`reusableCall` 可记录被调用流程引用。
- 流程容器支持内部节点、内部连线、容器内外跨边界连线。
- 将 Task UI 上下文和容器父子关系结构化持久化，并贯穿组件模板、业务图实例、差量保存、Yjs 协作、历史恢复和 Agent context。
- 保持 BPMN 与业务/测试语义分层：BPMN 字段描述流程语法，Task UI Steps 和容器配置描述用例生成语义。

**Non-Goals:**

- 不在本变更中实现 Locator、Playwright 代码生成或页面组件目录管理。
- 不自动迁移历史 Call Activity 为流程容器；旧图只需要兼容打开和保存。
- 不恢复 MES 专用节点；制造语义仍由业务语义 Profile 承载。
- 不重写整套业务图存储架构；继续沿用现有 DTO、ops、materialize、history、restore 路径。
- 不要求第一版支持任意深度容器嵌套；第一版可限制为单层流程容器，避免 X6 父子关系和路径推导复杂度失控。

## Decisions

### Decision 1: Task UI 上下文放入类型专属语义字段

Task 的页面与 UI Steps 属于 Task 类型专属语义，不应继续追加成一组散落的平铺列。建议在节点结构中增加一个独立 JSON 字段或放入明确命名的 `properties_json.taskUi` 子对象，并在 TypeScript/Python 中提供强类型校验。

推荐结构：

```json
{
  "page": {
    "pageName": "订单创建页",
    "routePattern": "/orders/create",
    "moduleName": "订单"
  },
  "uiSteps": [
    {
      "id": "step_submit_quantity",
      "stepNo": 1,
      "elementType": "Input",
      "elementName": "商品数量",
      "actionType": "input",
      "value": 2,
      "businessMeaning": "指定购买数量",
      "expectedResult": "数量字段显示 2",
      "negativeTestHints": ["数量为空", "数量为 0", "数量超过库存"]
    }
  ],
  "expectedResults": ["生成订单"],
  "assertions": ["订单列表出现新订单"]
}
```

Rationale: Task UI 上下文用于测试生成，和 BPMN 的 `bpmnElementType = TASK` 不同层。独立结构能减少对旧通用字段的破坏，也能让 Agent context 精确投影。

Alternatives considered:

- 新增大量列，例如 `page_name`、`route_pattern`、`ui_steps_json`。这利于查询，但会扩大迁移面。首版以 JSON 结构更适合快速迭代。
- 把字段放入 `semantic_payload_json`。这会和领域 Profile 混在一起；Task UI Steps 是测试生成上下文，不应绑定到某个业务领域 Profile。

### Decision 2: UI Steps 不存 Locator

UI Step 必须记录 `elementType`、`elementName`、`actionType`、`value`、`expectedResult` 等信息，但不记录 Locator。

Rationale: 用户明确不要 Locator。流程图的职责是表达业务和测试意图，不是维护页面自动化定位细节。Locator 后续应通过页面组件目录、Page Object 或测试工程映射来解决。

### Decision 3: 新建流程容器统一为 ProcessContainer

工具箱层面将 SubProcess 与 Call Activity 合并为一个“流程容器”。底层建议使用一个统一的 BPMN 元素建模方式，并通过容器配置区分模式：

```json
{
  "containerMode": "embedded",
  "calledProcessRef": null
}
```

或：

```json
{
  "containerMode": "reusableCall",
  "calledProcessRef": "business_flow_payment",
  "calledProcessVersion": "latest"
}
```

Rationale: 用户目标是一个可容纳内部节点的统一框。将容器行为统一后，X6 拖拽、保存、历史和 Agent context 不需要分别处理 SubProcess 与 Call Activity 两套交互。

Alternatives considered:

- 继续保留两个工具箱项，只让它们共享样式和容器能力。这样兼容性较好，但建模体验仍然分裂。
- 彻底删除 `CALL_ACTIVITY` 枚举。风险较高，旧图兼容成本大。建议新建不再使用独立 Call Activity，旧图只做兼容读取。

### Decision 4: 容器父子关系必须结构化持久化

流程容器内部节点不能只依赖 X6 JSON 的 parent 关系。节点记录需要增加容器父键：

```text
business_flow_node.container_node_key nullable
swimlane_component_node.container_node_key nullable
```

如果节点位于流程容器内：

- `lane_instance_id` 仍表示它所属的泳道。
- `container_node_key` 表示它的直接流程容器父节点。
- 坐标保存为相对容器的位置。

如果节点位于泳道顶层：

- `container_node_key = null`
- 坐标保存为相对泳道的位置。

Rationale: Agent context、历史恢复、组件发布/放置和协作物化都需要稳定父子关系。只存 X6 parent 会让结构化语义和画布状态脱节。

### Decision 5: 容器内外跨边界连线允许存在并标记作用域

用户明确允许容器内部节点连接到外部节点。边不需要新增复杂端点类型，但应在结构化投影中计算或保存边作用域：

```text
insideContainer
crossContainerBoundary
topLevel
```

Rationale: Agent 生成用例时必须知道一条边是否跨越流程容器边界。跨边界边不是错误，但它代表内部流程步骤与外部流程步骤之间存在显式交接。

### Decision 6: X6 使用嵌入关系表达容器内部节点

当前泳道已经通过 X6 `lane.addChild(node)` 表达父子关系。流程容器可以沿用 X6 嵌入模型：

```text
Lane
└─ ProcessContainer
   ├─ Task
   ├─ Gateway
   └─ Data Store
```

拖拽规则：

- 节点拖入容器时，设置 X6 parent 为容器，写入 `containerNodeKey`，并转换相对坐标。
- 节点拖出容器时，X6 parent 回到泳道，清空 `containerNodeKey`，并转换相对坐标。
- 拖动容器时，内部节点视觉上随容器移动。
- 删除有子节点的容器时默认阻断或要求二次确认，不静默丢弃内部节点。

Rationale: 与现有泳道嵌入模型一致，减少新的交互概念。但实现必须注意 X6 的 parent 只能有一个，因此内部节点的直接 parent 应为流程容器，泳道归属通过 `laneInstanceId` 保留在数据层。

### Decision 7: Agent context 输出 Task UI 与容器层级

`GET /api/graphs/{graph_id}/agent-context` 继续保持 `text + documents` 兼容，同时在结构化 `businessFlowContext` 中增加：

- `taskUi.page`
- `taskUi.uiSteps`
- `taskUi.expectedResults`
- `taskUi.assertions`
- `containers`
- `containerNodeKey`
- `edgeScope`

Rationale: Agent 应通过后端上下文 API 读取结构化数据，不直接解析图标、截图、X6 JSON 或数据库。

## Risks / Trade-offs

- [Risk] 容器嵌套改变 X6 parent/child 关系，可能影响泳道自动扩展和拖拽手感。→ Mitigation: 第一版限制单层容器；复用并扩展现有 `fitLaneToChildren`，新增容器级 fit 函数并做浏览器验证。
- [Risk] 容器内外跨边界连线会增加路径抽取复杂度。→ Mitigation: 首版允许连线并标记 `edgeScope`，Agent context 不强行把跨边界边重写成特殊 BPMN 语法。
- [Risk] Task UI Steps JSON 太自由，Agent 输出质量不稳定。→ Mitigation: 前后端都校验 `elementType/actionType` 组合、`stepNo` 顺序和必填字段，并返回质量问题。
- [Risk] 不自动迁移旧 Call Activity 会让旧图和新图存在两种形态。→ Mitigation: 旧 `CALL_ACTIVITY` 保持兼容读取和保存；新建工具箱只提供流程容器。
- [Risk] 把 Task UI 上下文放在 JSON 中不利于 SQL 查询。→ Mitigation: 首版优先满足建模和 Agent context；后续如需统计控件覆盖率，再抽取索引表。

## Migration Plan

1. 新增迁移，为业务图节点和泳道组件节点增加 `container_node_key`；为 Task UI 上下文选择稳定 JSON 存储边界。
2. 保留旧 `CALL_ACTIVITY` 数据可读可保存，不做自动迁移；新工具箱不再提供独立 Call Activity。
3. 前端类型、API normalization、X6 cell data、Yjs 文档读写、差量 ops 全链路透传 Task UI 与容器字段。
4. 后端 DTO、校验、materialize、组件发布/放置、历史恢复同步支持新增字段。
5. Agent context 增加 Task UI、containers、edgeScope 和质量问题。
6. 验证新图、旧图、组件模板、协作、历史恢复和 Agent context。

Rollback 策略：新增字段保持 nullable / default 空结构；若前端能力回退，旧图仍可按顶层节点打开。数据库迁移不删除旧字段，不进行破坏性旧 Call Activity 转换。

## Open Questions

- 第一版是否允许流程容器嵌套流程容器？建议暂不允许，后续按实际建模需求扩展。
- Task UI Steps 的断言是否需要区分页面断言、接口断言和数据库断言？建议第一版用通用 `assertions` 文本数组，后续再结构化。
- `reusableCall` 的 `calledProcessRef` 是引用业务流程图、泳道组件，还是外部流程标识？建议第一版作为文本/选择引用预留，后续接入选择器。
