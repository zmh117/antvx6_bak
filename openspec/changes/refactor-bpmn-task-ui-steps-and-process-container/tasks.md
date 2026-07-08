## 1. Baseline And Model Boundary

- [x] 1.1 确认当前 BPMN Task、SubProcess、Call Activity、泳道组件、业务图实例、Yjs、历史恢复和 Agent context 的真实字段流转路径
- [x] 1.2 定义 Task UI context 的 TypeScript 类型，包括 page、uiSteps、expectedResults、assertions，明确不包含 Locator
- [x] 1.3 定义 UI elementType 与 actionType 的受控枚举和合法组合
- [x] 1.4 定义 ProcessContainer 类型边界，包括 containerMode、calledProcessRef、calledProcessVersion、containerNodeKey 和 edgeScope
- [x] 1.5 明确旧 CALL_ACTIVITY 兼容策略：可读可保存，不做自动迁移，新工具箱不再新增独立 Call Activity

## 2. Persistence And API Contract

- [x] 2.1 新增数据库迁移，为 `business_flow_node` 和 `swimlane_component_node` 增加 `container_node_key`
- [x] 2.2 确定 Task UI context 的持久化位置并实现迁移默认值，保持旧图默认空结构
- [x] 2.3 更新后端 Pydantic DTO，支持 Task UI context 与 containerNodeKey 的读写
- [x] 2.4 更新业务图节点查询、响应、ADD/UPDATE ops、协作 materialize、组件放置和历史恢复 SQL 路径
- [x] 2.5 更新泳道组件保存、发布、读取路径，确保组件模板可保存 Task UI context 和流程容器层级
- [x] 2.6 保持旧图兼容，旧 CALL_ACTIVITY、无 Task UI context、无 containerNodeKey 的图仍可打开和保存

## 3. BPMN Domain Validation

- [x] 3.1 更新前端 BPMN 工具箱，合并 SubProcess 与 Call Activity 为一个流程容器新建入口
- [x] 3.2 更新后端 BPMN 校验，允许新建流程容器模式并兼容旧 CALL_ACTIVITY
- [x] 3.3 增加 Task UI context 校验：stepNo 顺序、必填字段、elementType/actionType 合法组合
- [x] 3.4 增加流程容器校验：容器父级存在、禁止超过支持深度、禁止循环父子关系
- [x] 3.5 增加建模质量问题：Task 缺 page、Task 缺 UI Steps、空容器、reusableCall 缺 calledProcessRef
- [x] 3.6 保留既有 BPMN 数据节点只能使用 Association 连线的强校验

## 4. Frontend Task UI Editing

- [x] 4.1 更新业务图前端类型、API normalization、本地草稿和 X6 cell data，透传 Task UI context
- [x] 4.2 在业务图 Task 属性面板新增 Page 编辑区
- [x] 4.3 在业务图 Task 属性面板新增 UI Steps 列表，支持添加、删除、排序和编辑步骤
- [x] 4.4 UI Steps 表单根据 elementType/actionType 展示值、选项、预期结果和负向用例提示，不展示 Locator 字段
- [x] 4.5 在泳道组件编辑器中支持相同 Task Page/UI Steps 编辑能力
- [x] 4.6 在属性面板展示 Task UI context 的非阻断质量提示

## 5. Frontend ProcessContainer Canvas Behavior

- [x] 5.1 更新 X6 节点 shape/markup，流程容器显示为可容纳内部元素的框
- [x] 5.2 实现节点拖入流程容器，设置 parent、containerNodeKey 和相对容器坐标
- [x] 5.3 实现节点拖出流程容器，恢复到泳道 parent、清空 containerNodeKey 并转换相对泳道坐标
- [x] 5.4 实现流程容器移动时内部节点视觉和数据语义保持一致
- [x] 5.5 实现容器尺寸适配内部节点，避免内部节点被裁切或拖拽后布局异常
- [x] 5.6 支持容器内部节点与外部节点连线，并在前端计算或保留 edgeScope 所需上下文
- [x] 5.7 更新删除逻辑，删除有内部节点的流程容器时阻断或二次确认
- [x] 5.8 在泳道组件编辑器中支持流程容器内部节点建模

## 6. Collaboration, Diff, And Restore

- [x] 6.1 更新 `buildBusinessFlowOps`，检测 Task UI context 和 containerNodeKey 变化
- [x] 6.2 更新 Yjs 写入和读取，增量同步 Task UI context、containerNodeKey 和容器相关节点位置
- [x] 6.3 更新 X6 canvas draft 生成，保存容器内部节点的相对坐标和父子关系
- [x] 6.4 更新业务图 materialize，确保协作状态落库后容器层级和 Task UI context 不丢失
- [x] 6.5 更新历史 checkpoint 和 restore，恢复后容器层级、内部节点、跨边界边和 Task UI context 一致
- [ ] 6.6 验证两个协作者同时编辑不同 Task/UI Steps 或拖动容器内部节点时不会覆盖无关数据

## 7. Agent Context Projection

- [x] 7.1 扩展 `agent_context_repository` 查询 Task UI context、containerNodeKey 和流程容器配置
- [x] 7.2 扩展 `agent_context_service`，输出 `taskUi.page`、`taskUi.uiSteps`、`expectedResults` 和 `assertions`
- [x] 7.3 在 structured businessFlowContext 中输出 containers 列表、childStepKeys 和 containerMode
- [x] 7.4 为边输出 edgeScope：topLevel、insideContainer、crossContainerBoundary
- [x] 7.5 将 Task UI context 和流程容器质量问题输出给 Agent，保持 `text + documents` 向后兼容
- [x] 7.6 增加 Agent context 示例，覆盖提交表单 Task、DataTable 断言、流程容器内部步骤和跨边界连线

## 8. Verification

- [ ] 8.1 运行后端迁移和回滚检查，确认新增字段默认值和旧图兼容
- [ ] 8.2 增加后端测试：Task UI context 校验、容器父子关系、跨边界边、组件放置、历史恢复、Agent context 输出
- [x] 8.3 增加前端类型/构建测试，覆盖 Task UI Steps 表单和流程容器工具箱
- [ ] 8.4 浏览器验证业务图：创建 Task UI Steps、保存、刷新、恢复历史、Agent context 可读
- [ ] 8.5 浏览器验证流程容器：拖入节点、拖出节点、容器内连线、跨容器连线、删除保护
- [ ] 8.6 协作验证：两个客户端编辑 Task UI Steps 和容器内部节点，状态一致且无全图重置
- [ ] 8.7 验证旧 CALL_ACTIVITY 图可打开、保存，不触发自动迁移
- [ ] 8.8 运行 `npm run build --prefix front`、后端编译/测试和 `openspec validate refactor-bpmn-task-ui-steps-and-process-container --strict`
