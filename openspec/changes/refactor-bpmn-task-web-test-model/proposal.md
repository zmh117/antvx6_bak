## Why

当前“任务”节点仍以通用备注字段为主，无法准确表达 Web 系统测试用例生成所需的页面、控件、操作、输入、预期结果和断言。需要把 Task 从“业务描述框”升级为“业务语义 + UI 操作步骤列表”的结构化模型，让后续 Agent 能直接读取图数据生成更准确的测试用例。

## What Changes

- **BREAKING**：Task 节点属性面板不再暴露旧字段：标题、描述、角色、业务规则、输入摘要、输出摘要、BPMN 节点、BPMN 节点类型、ER 字段绑定。
- Task 节点属性面板改为中文字段分组：基础信息、页面信息、UI 操作步骤、断言与预期。
- Task 新模型包含任务名称、任务类型、执行角色、业务目的、业务规则、前置条件、后置结果、页面名称、URL、所属模块、输入数据、输出数据、预期结果、断言、Mock 需求和 UI 操作步骤。
- UI 操作步骤支持多个步骤，每步独立选择“元素类型”和“操作动作”，不把一个 Task 限制为单一控件操作。
- UI 步骤支持 Button、Input、Textarea、Select、Radio Group、Checkbox、Date Picker、Data Table、Context Menu、Label 等元素类型，并按元素类型展示专属中文配置字段。
- 不引入结构化 `locator` 字段；仅保留中文的“元素定位说明”或“定位依据”作为可选描述，供 AI 理解页面定位依据。
- 前端显示字段全部使用中文；代码和持久化 JSON key 继续使用稳定英文 key，避免破坏协作、历史、后端和 Agent 解析。
- Task 不再绑定 ER 字段；原有 ER 绑定入口不在 Task 属性面板展示，旧绑定数据仅做兼容读取。
- BPMN profile 继续作为内部渲染和校验数据存在，但不再作为 Task 用户可编辑属性暴露。
- 数据库旧列本次不做破坏性删除；新模型落在现有 `task_ui_json` 结构中，旧字段在 Task 保存、协作、历史和 Agent 上下文中逐步停止作为业务语义使用。

## Capabilities

### New Capabilities

- `bpmn-task-web-test-model`: 定义 BPMN Task 面向 Web 系统测试用例生成的结构化业务语义、页面信息、UI 操作步骤、断言、兼容和 Agent 读取规则。

### Modified Capabilities

- 无。

## Impact

- 前端实体模型：`front/src/entities/business-flow/model/types.ts`、`taskUi.ts`、`bpmn.ts`。
- 前端属性面板：业务流程编辑器、泳道组件编辑器、`TaskUiContextFields`、节点选择读取逻辑。
- 前端 X6/协作：节点数据读写、画布快照、Yjs patch/full state、历史恢复兼容。
- 后端 DTO 和领域校验：business-flow schemas、`back/app/domain/business_flow/task_ui.py`、保存/恢复/Agent context 读取路径。
- Agent 上下文：Task 节点输出结构从旧备注字段转为 Web 测试任务模型。
- 数据库：本次优先复用 `task_ui_json`，不删除旧列；如需物理清理旧字段，后续单独提迁移。
