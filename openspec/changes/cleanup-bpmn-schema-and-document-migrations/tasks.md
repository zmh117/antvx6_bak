## 1. 最终 Schema 与使用矩阵

- [ ] 1.1 从 `001-018` migration 和 PostgreSQL catalog 生成当前应用表、字段、约束、索引清单。
- [x] 1.2 固化节点表、连线表、业务语义 Profile 表和流程容器索引的删除矩阵，并增加测试断言删除范围。
- [x] 1.3 固化 `title/label`、`node_type/edge_type`、BPMN 判别字段、`properties_json`、`task_ui_json`、`bpmn_semantic_json` 和 ER 引用的保留矩阵。
- [x] 1.4 全仓库审计 snake_case、camelCase 和 JSON 嵌套形式的废弃字段读写位置，覆盖前端、后端、历史、协作和 Agent。
- [x] 1.5 增加禁止词扫描测试，确保完成后应用代码不再引用被删除字段。

## 2. 前端契约清理

- [x] 2.1 从业务流程实体类型、组件类型、X6 cell data 和本地 draft 中删除旧通用节点字段。
- [x] 2.2 从前端类型和 API 映射中删除业务语义 Profile 三字段及 `semanticProfile` helper/export。
- [x] 2.3 从前端类型和 API 映射中删除流程容器字段、父子层级 helper 和遗留容器清理逻辑。
- [x] 2.4 从节点类型中删除 `bpmnCallActivityRef`，同时保持当前 13 节点工具箱和 BPMN profile 映射不变。
- [x] 2.5 从连线类型和 API 映射中删除 `conditionText`、`dataContract`、`bpmnMessageName` 和 `bpmnConditionExpression`。
- [x] 2.6 更新 X6 节点/连线创建、读取、渲染和 draft 序列化，只携带最终字段集合。
- [x] 2.7 更新 `buildBusinessFlowOps` 和选中态读取，停止生成废弃字段 patch。
- [x] 2.8 更新泳道组件编辑、发布请求和业务流程编辑保存请求，证明 Task、非 Task、连线和 ER 多字段绑定行为不变。

## 3. 后端 DTO 与领域清理

- [x] 3.1 从组件节点、组件连线、业务节点和业务连线 Pydantic DTO 删除全部废弃字段。
- [x] 3.2 从业务流程实体和 repository row mapping 删除全部废弃字段。
- [x] 3.3 删除业务语义 Profile 领域模块、质量规则、API helper 和数据库 seed 依赖。
- [x] 3.4 删除流程容器领域 helper、质量规则、父子校验和旧图容器迁移逻辑。
- [x] 3.5 删除 Call Activity 引用处理，并确认当前 Transaction 的 `bpmn_subprocess_kind=TRANSACTION` 判别仍可用。
- [x] 3.6 更新业务流程保存、物化、恢复及组件保存/发布/放置 SQL，使查询列、占位符和参数严格匹配最终 schema。
- [x] 3.7 更新领域测试，证明 Task 使用 `task_ui_json`、非 Task 与连线使用 `bpmn_semantic_json`，数据节点 ER 多字段绑定保持可用。

## 4. Yjs、历史与 Agent 收敛

- [x] 4.1 更新 Yjs 节点/连线写入和读取，停止同步废弃字段并保持按稳定 key 的增量更新。
- [x] 4.2 更新协作 patch 物化与全量重建，拒绝旧客户端提交的废弃字段。
- [x] 4.3 更新组件 `canvas_json/semantic_json` 和业务流程 snapshot/checksum 边界，只序列化最终字段集合。
- [x] 4.4 更新历史 change op 和 inverse patch 构建，删除废弃字段并保持版本恢复一致。
- [x] 4.5 更新 Agent Context repository 查询，移除已删除数据库列。
- [x] 4.6 更新 Agent Context 文本与结构化 projection，完全移除 Profile、流程容器、旧通用备注和重复连线语义来源。
- [ ] 4.7 增加 Yjs、历史恢复和 Agent Context 测试，覆盖旧键过滤及当前语义保留。

## 5. 019 破坏性清理 Migration

- [x] 5.1 创建幂等 `019_bpmn_schema_cleanup.sql` 和对应 `app_migration_state` 标记。
- [x] 5.2 实现递归 JSONB 清理函数，删除 snake_case/camelCase 废弃键但保留 BPMN、Task UI、ER、布局和样式数据。
- [x] 5.3 清理 `swimlane_component_version.canvas_json/semantic_json` 中的遗留键。
- [x] 5.4 清理 `business_flow_snapshot.canvas_json/semantic_json` 与 `business_flow_change_op.patch_json/inverse_patch_json` 中的遗留键。
- [x] 5.5 删除 `BUSINESS_FLOW`、`SWIMLANE_COMPONENT_DRAFT` 协作文档及增量，并递增 `business_flow.collab_revision`。
- [x] 5.6 删除流程容器索引、`business_semantic_profile` 表以及节点和连线删除矩阵中的字段。
- [ ] 5.7 在清理完成后删除临时 SQL 函数，并验证 migration 可重复执行。
- [ ] 5.8 编写基于 018 结构和遗留 fixture 的 migration 测试，验证数据清理、保留字段及不可逆删除结果。

## 6. 020 全库中文注释

- [x] 6.1 创建 `020_schema_comments.sql`，列出 019 后所有应用表并添加中文表说明。
- [x] 6.2 为 ER 图、表、字段、枚举、关系、快照、成员和数据库连接相关字段补齐中文说明。
- [x] 6.3 为产品、泳道组件、组件版本、组件节点/连线及组件 ER 引用全部字段补齐中文说明。
- [x] 6.4 为业务流程、泳道实例、节点、连线、ER 引用、成员、历史批次/操作、快照全部字段补齐中文说明。
- [x] 6.5 为用户、会话、协作文档、协作增量、审计和 migration state 全部字段补齐中文说明。
- [x] 6.6 检查状态、类型、JSON、外键、版本、时间和软删除字段注释，明确关键取值、引用目标或生命周期。
- [ ] 6.7 增加 PostgreSQL catalog 注释覆盖率测试，要求所有应用表和字段说明非空且包含中文。
- [x] 6.8 增加注释目标测试，禁止 020 引用 019 已删除的表和字段。

## 7. Migration 启动器整理

- [x] 7.1 重构 `run_migrations` 为显式有序阶段/清单，保留 001 空库逻辑与 014/015 历史兼容分支。
- [x] 7.2 将 019 固定在 018 之后执行，并将 020 固定在所有结构 migration 之后执行。
- [x] 7.3 确保 migration 启动器不会执行 `samples` 或未登记 SQL 文件。
- [x] 7.4 增加启动器顺序测试，验证空库和存量库均只按预期顺序执行。
- [ ] 7.5 增加 migration 重复启动测试，验证 019/020 幂等且不重复递增协作版本。

## 8. 端到端验证

- [ ] 8.1 在空 PostgreSQL 数据库执行 `001-020`，记录最终表、字段、约束、索引和注释清单。
- [ ] 8.2 在包含 018 结构、旧字段值、历史 JSON 和协作状态的数据库执行 019/020。
- [ ] 8.3 比较空库和存量升级后的规范化 schema，要求结构完全一致。
- [x] 8.4 运行前端构建、前端单元测试、后端编译和后端测试。
- [ ] 8.5 API 验证 Task、12 类非 Task 节点、3 类连线及数据节点多字段 ER 绑定的保存和刷新。
- [ ] 8.6 浏览器验证业务流程编辑、泳道组件保存/发布/放置和旧图打开不访问已删除字段。
- [ ] 8.7 双客户端验证 Yjs 重连后使用新 revision，旧协作文档不回写废弃字段。
- [ ] 8.8 验证历史 checkpoint 与恢复，确认当前语义、画布名称、布局和 ER 引用完整。
- [ ] 8.9 调用 Agent Context，确认只输出 Task UI、BPMN 专属语义、连线语义和合法数据节点 ER 引用。
- [ ] 8.10 运行全仓库废弃字段扫描、`git diff --check` 和 OpenSpec strict validation。
