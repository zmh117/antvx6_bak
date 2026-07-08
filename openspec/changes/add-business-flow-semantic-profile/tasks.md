## 1. Baseline And Profile Scope

- [x] 1.1 确认当前业务图、泳道组件、协作物化、历史恢复、Agent context 中节点/边字段的真实读写路径
- [x] 1.2 定义业务语义 Profile 的 TypeScript/Python 类型边界，明确 BPMN 字段与业务语义字段不互相污染
- [x] 1.3 定义首批 Profile：通用业务操作 Profile、MES 生产制造节点 Profile、MES 生产制造边 Profile
- [x] 1.4 定义 MES taxonomy 初版，包括操作类型、业务对象、资源类型、异常类型、质量规则

## 2. Persistence And API Contract

- [x] 2.1 新增 `business_semantic_profile` 注册表或等价持久化结构，并 seed 通用与 MES Profile
- [x] 2.2 为业务图节点、业务图边、泳道组件节点、泳道组件边新增通用语义字段
- [x] 2.3 更新后端 DTO、HTTP schema、repository 查询与保存路径，支持语义字段读写
- [x] 2.4 更新业务图变更 ops、协作 materialize、历史记录、恢复逻辑，确保语义字段不丢失
- [x] 2.5 保持旧图兼容，旧数据默认无 Profile 且仍可打开、保存、恢复

## 3. Domain Validation And Quality Checks

- [x] 3.1 增加 Profile payload schema 校验，非法字段或非法枚举应被规范化或返回明确错误
- [x] 3.2 保留现有 BPMN 校验规则，特别是数据节点只能使用 Association 连线
- [x] 3.3 增加非阻断建模质量检查：任务缺少操作类型、网关出边缺少条件、关键任务缺少 ER 引用、数据节点缺少业务对象等
- [x] 3.4 将质量问题返回给前端编辑器和 Agent context，避免 Agent 把不完整图当成确定事实

## 4. Frontend Modeling Experience

- [x] 4.1 更新业务图前端类型、API normalization、Yjs 序列化与 X6 cell data，透传语义字段
- [x] 4.2 在节点属性面板支持选择 Profile，并根据 Profile schema 编辑业务语义 payload
- [x] 4.3 在边属性面板支持编辑条件、交接、消息、异常等边语义字段
- [x] 4.4 增加建模质量提示 UI，提示但不默认阻断保存
- [x] 4.5 确认 15 个 BPMN 工具箱节点不增加 MES 专用节点，MES 仅作为 Profile 模板出现

## 5. Agent Context Projection

- [x] 5.1 扩展 `agent_context_repository` 查询，读取业务图节点/边语义字段和 Profile 定义
- [x] 5.2 扩展 `agent_context_service`，在自然语言文档之外生成结构化 `businessFlowContext`
- [x] 5.3 在结构化上下文中输出流程、步骤、边、泳道、数据对象、ER 引用、规则、质量问题
- [x] 5.4 增加基础路径抽取：happy path、网关分支、异常路径、关键数据流
- [x] 5.5 保持 `GET /api/graphs/{graph_id}/agent-context?q=` 向后兼容，现有 `text + documents` 不破坏

## 6. Verification

- [ ] 6.1 运行后端迁移与回滚检查，确认新字段和 seed 数据可重复执行
- [ ] 6.2 增加后端单元/集成测试：Profile 校验、节点/边保存、协作物化、历史恢复、Agent context 输出
- [x] 6.3 增加前端类型/构建测试，覆盖节点/边属性编辑和 Yjs 序列化
- [ ] 6.4 用一条 MES 示例流程验证：工单下发、物料称量、投料、质检、放行、异常处理、批记录生成
- [ ] 6.5 验证旧业务图和无 Profile 图仍可打开、保存、恢复、进入 Agent context
