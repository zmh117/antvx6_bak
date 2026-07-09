## 1. Baseline And Compatibility

- [x] 1.1 梳理当前 Task 字段流转路径：业务图节点、泳道组件节点、X6 cell data、Yjs 文档、历史恢复、Agent context。
- [x] 1.2 明确旧字段兼容策略：数据库字段暂不删除，Task 用户语义不再依赖 `description / actor / business_rule / input_summary / output_summary`。
- [x] 1.3 明确画布标签策略：`task_ui_json.taskName` 驱动节点显示名，底层 `title` 仅作为兼容缓存。
- [x] 1.4 确认 Task 不再展示 ER 绑定入口，旧 ER 绑定数据只做兼容保留。
- [x] 1.5 确认内部 BPMN profile 继续用于渲染和校验，但 Task 属性面板不再暴露 BPMN 节点和 BPMN 节点类型字段。

## 2. Frontend Task Model

- [x] 2.1 扩展 `TaskUiContext` 类型，增加任务名称、任务类型、执行角色、业务目的、业务规则、前置条件、后置结果、输入数据、输出数据、Mock 需求。
- [x] 2.2 扩展页面信息类型，支持页面名称、URL、所属模块，并保持旧 `routePattern` 兼容归一化。
- [x] 2.3 扩展 `TaskUiOperationStep` 类型，增加元素定位说明、值来源、是否必填、预期状态、是否截图、等待条件和元素专属属性。
- [x] 2.4 定义受控元素类型：右键菜单、按钮、复选框、数据表格、日期选择器、输入框、标签、单选按钮组、下拉选择、文本域。
- [x] 2.5 定义受控动作类型：点击、双击、右键点击、输入、清空、勾选、取消勾选、切换、选择、选择日期、选择日期范围、搜索、筛选、排序、选择行、断言可见、断言文本、断言值、断言单元格、选择菜单项。
- [x] 2.6 增加英文枚举到中文显示文案的映射，确保属性面板不直接显示英文控件类型或动作名。
- [x] 2.7 更新 `normalizeTaskUiContext`，支持旧数据 fallback、新字段默认值、步骤排序和元素专属字段归一化。
- [x] 2.8 更新前端质量检查，校验任务名称、页面名称、UI 步骤、元素名称、动作类型、元素动作组合和预期结果。

## 3. Task Property Panels

- [x] 3.1 重构 `TaskUiContextFields` 为完整 Task 属性表单，按基础信息、页面信息、UI 操作步骤、断言与预期展示中文字段。
- [x] 3.2 在 UI 操作步骤中支持添加、删除、重排和编辑步骤。
- [x] 3.3 根据元素类型动态展示按钮、输入框、文本域、下拉选择、单选按钮组、复选框、日期选择器、数据表格、右键菜单、标签的专属字段。
- [x] 3.4 删除 Task 属性面板中的旧字段：标题、描述、角色、业务规则、输入摘要、输出摘要。
- [x] 3.5 删除 Task 属性面板中的 BPMN 节点和 BPMN 节点类型编辑区；非 Task 节点按现有规则保留必要 BPMN 编辑能力。
- [x] 3.6 删除 Task 属性面板中的 ER 字段绑定入口；非 Task 节点是否展示 ER 绑定按现有业务规则处理。
- [x] 3.7 在业务流程编辑器中接入新 Task 表单，并让任务名称实时更新画布节点标签。
- [x] 3.8 在泳道组件编辑器中接入同一套新 Task 表单，并让组件 Task 保存后可被业务图实例继承。

## 4. X6, Draft, Collaboration, And History

- [x] 4.1 更新新建 Task 节点默认数据，初始化新的 `taskUiJson` 空结构并停止写入旧 Task 备注字段。
- [x] 4.2 更新 `readSelectedBusinessCell` 和组件编辑器选中态，Task 选择态从 `taskUiJson` 读取新模型。
- [x] 4.3 更新 X6 节点 draft 生成和保存，确保 `taskUiJson.taskName` 与节点 label / `title` 兼容缓存同步。
- [x] 4.4 更新业务图差量构建，检测完整 `taskUiJson` 变化并生成节点更新 op。
- [x] 4.5 更新 Yjs 写入、读取和 patch 合成，保留新 Task 模型并避免旧字段覆盖新字段。
- [x] 4.6 更新历史 checkpoint 和 restore 路径，恢复后 Task 模型、步骤顺序和画布标签一致。
- [x] 4.7 验证旧图无 `task_ui_json` 时能用旧 `title` 回填任务名称并正常打开保存。

## 5. Backend Contract And Domain Validation

- [x] 5.1 更新后端业务图 DTO，允许 `task_ui_json` 承载新 Task 模型，旧数据库列继续保留。
- [x] 5.2 更新后端 Task UI helper，归一化新模型并兼容旧 `page.routePattern` / 旧空结构。
- [x] 5.3 更新后端质量问题：缺任务名称、缺页面名称、缺 UI 步骤、步骤字段不完整、元素类型不受控、动作类型不受控、元素动作组合不合法。
- [x] 5.4 增加元素专属字段的轻量结构校验，例如 Select options、DataTable columns/assertionRules、ContextMenu menuItems。
- [x] 5.5 确保保存、发布泳道组件、放置组件、业务图增量变更、协作物化和历史恢复都不丢失 `task_ui_json`。
- [x] 5.6 确保后端不把旧 ER 绑定作为 Task Web 测试模型的一部分输出。

## 6. Agent Context Projection

- [x] 6.1 更新 Agent context 查询和组装逻辑，Task 输出基础信息、页面信息、UI 操作步骤、输入数据、输出数据、预期结果、断言和 Mock 需求。
- [x] 6.2 保持 `text + documents` 兼容，同时在结构化 businessFlowContext 中输出新 Task 模型。
- [x] 6.3 Agent context 不再使用旧描述、角色、业务规则、输入摘要、输出摘要作为 Task Web 测试语义来源。
- [x] 6.4 Agent context 不再把 Task 的旧 ER 绑定输出为测试字段绑定。
- [x] 6.5 Agent context 输出 Task 建模质量问题，帮助后续用例生成判断数据是否完整。

## 7. Verification

- [x] 7.1 运行 `npm run build --prefix front`，确认前端类型和构建通过。
- [x] 7.2 运行后端编译或测试，确认 DTO、领域 helper 和 Agent context 路径无语法错误。
- [x] 7.3 增加或更新前端测试，覆盖 Task 表单中文字段、UI Steps、元素动作组合和动态专属字段。
- [x] 7.4 增加或更新后端测试，覆盖 Task 模型归一化、质量问题、旧字段兼容和 Agent context 输出。
- [ ] 7.5 浏览器验证业务图：创建 Task、填写页面信息和 UI 操作步骤、保存、刷新、历史恢复。
- [ ] 7.6 浏览器验证泳道组件：编辑组件 Task、发布组件、放置到业务图后 Task 模型仍存在。
- [ ] 7.7 协作验证：两个客户端编辑不同 Task 或同一 Task 的不同步骤时，保存结果不覆盖无关数据。
- [ ] 7.8 验证旧图：只有旧 `title`、旧备注字段或旧 ER 绑定的 Task 可以打开，且新面板不暴露旧字段。
- [x] 7.9 运行 `openspec validate refactor-bpmn-task-web-test-model --strict`。
