## Why

当前任务以外的 BPMN 节点仍共用“标题、描述、角色、业务规则、输入摘要、输出摘要”和可编辑 BPMN profile，无法准确表达事件触发、事务补偿、网关分支、数据生命周期与连线路径条件。需要按现有 BPMN 类型建立专属结构化语义，使业务人员用中文准确建模，并让 Agent 直接读取稳定数据生成正常、异常、边界和补偿测试用例。

## What Changes

- **BREAKING**：当前工具箱 12 个非 Task 节点的属性面板不再暴露旧通用字段：标题、描述、角色、业务规则、输入摘要、输出摘要、BPMN 节点、BPMN 节点类型。
- 开始事件、中间事件、结束事件、事务、排他网关、包容网关、并行网关、复杂网关、数据对象、数据输入、数据输出、数据存储分别使用专属结构化字段。
- 每类节点提供中文专属名称字段，并实时同步画布文字；底层 `title` 仅保留为显示兼容缓存，不再作为业务语义来源。
- Sequence、Message、Association 三类连线改为类型专属语义面板，结构化保存路径类型、条件、消息、关联含义、测试场景和预期结果；内部 BPMN edge profile 继续用于渲染与校验，但不再作为用户字段暴露。
- 前端字段名、分组名、枚举选项与质量提示全部使用中文；TypeScript、Python、API、Yjs 和 JSON 存储继续使用稳定英文 key。
- 仅数据对象、数据输入、数据输出、数据存储允许展示和写入 ER 绑定；其他非 Task 节点和全部连线不展示、不新增、不投影 ER 绑定。
- 新增专用 JSONB 语义载体，并在前后端领域层按元素类型强类型归一化和校验；不复用已废弃的“业务语义 Profile”作为新模型入口。
- 数据库旧通用字段、BPMN profile 字段和历史数据本次不做破坏性删除；新 UI、保存语义和 Agent context 停止依赖旧字段。
- 新语义贯穿业务流程图、泳道组件、X6 快照、差量保存、Yjs 协作、发布与放置、历史恢复、质量检查和 Agent context。
- 不新增边界事件、Rule、Pool、Lane、子流程或调用活动，不改变当前工具箱节点集合。

## Capabilities

### New Capabilities

- `bpmn-non-task-semantic-model`: 定义当前 12 个非 Task BPMN 节点及 Sequence、Message、Association 连线的类型专属业务语义、中文属性面板、ER 绑定边界、持久化兼容、质量校验和 Agent 读取规则。

### Modified Capabilities

- 无。

## Impact

- 前端领域模型与归一化：`front/src/entities/business-flow/model`。
- 前端属性面板：业务流程编辑器、泳道组件编辑器、节点与连线专属字段组件。
- X6 与状态链路：cell data、画布快照、节点/连线 draft、差量操作、Yjs 文档、组件发布与实例化、历史恢复。
- 后端领域与接口：business-flow DTO、类型专属语义归一化、校验、保存、物化和恢复路径。
- Agent context：非 Task 节点和连线改为结构化 BPMN 业务语义输出，并过滤旧通用字段及非法 ER 绑定。
- 数据库：为组件节点、组件连线、流程节点、流程连线增加 JSONB 语义列；保留旧列，不执行破坏性删除。
