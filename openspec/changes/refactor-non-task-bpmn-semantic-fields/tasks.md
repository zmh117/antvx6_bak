## 1. Baseline And Compatibility

- [x] 1.1 核对当前 12 个非 Task 节点和 Sequence、Message、Association 连线在业务流程编辑器、泳道组件编辑器、X6、API、Yjs、历史和 Agent context 中的完整读写路径。
- [x] 1.2 固化 BPMN profile 到 `semanticType` 的唯一映射，并增加测试证明当前工具箱节点和连线集合不变。
- [x] 1.3 明确旧字段策略：`description / actor / business_rule / input_summary / output_summary` 停止作为非 Task 语义读写，`title / label` 仅作为专属名称的显示缓存。
- [x] 1.4 核对 Task Web 测试模型边界，确保本变更不修改 `task_ui_json` 的字段、表单、校验和 Agent projection。
- [x] 1.5 核对现有业务语义 Profile 残留入口，列出需要从非 Task 节点和连线面板移除但不得误删内部 BPMN profile 的位置。

## 2. Database And API Contract

- [x] 2.1 新增幂等迁移，为 `swimlane_component_node`、`swimlane_component_edge`、`business_flow_node`、`business_flow_edge` 增加 `bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb`。
- [x] 2.2 为新增列添加中文数据库注释，并确保迁移不删除或改写旧通用字段、BPMN profile 字段和旧历史数据。
- [x] 2.3 更新组件节点、组件连线、流程节点、流程连线 DTO，使用 `bpmnSemanticJson` 暴露新模型并保持现有 API 命名风格。
- [x] 2.4 更新数据库 repository/query/row mapping，使新增 JSON 在列表、详情、保存、发布、放置、物化和恢复路径中可读写。
- [x] 2.5 更新画布快照、语义快照、change op 和 checksum 的序列化边界，保证 `bpmnSemanticJson` 被纳入一致性比较。
- [x] 2.6 增加迁移回滚或兼容验证，证明旧版本代码可忽略新增 JSONB 列且旧列仍存在。

## 3. Frontend Semantic Model

- [x] 3.1 在前端定义 `schemaVersion`、15 个 `semanticType` 和对应 TypeScript 判别联合，覆盖 12 个节点与 3 类连线。
- [x] 3.2 定义开始事件、中间事件、结束事件和事务的字段类型、受控枚举及空模型。
- [x] 3.3 定义排他、包容、并行、复杂网关的字段类型、分支引用结构、受控枚举及空模型。
- [x] 3.4 定义数据对象、数据输入、数据输出、数据存储的字段类型、受控枚举及空模型。
- [x] 3.5 定义 Sequence、Message、Association 连线的字段类型、受控枚举及空模型。
- [x] 3.6 实现 BPMN profile 到 `semanticType` 的映射、按类型归一化、未知字段清洗和旧 `title/label` 名称 fallback。
- [x] 3.7 实现专属名称读取与同步 helper，使 `eventName / transactionName / decisionName / gatewayName / dataName / flowName / messageName / associationName` 驱动画布文字。
- [x] 3.8 建立所有英文枚举到中文标签的集中映射，确保表单、选择项和质量提示不直接显示英文业务词。
- [x] 3.9 实现前端质量检查，覆盖缺名称、必填字段、非法枚举、类型不匹配、Saga 补偿、网关引用和默认路径冲突。
- [x] 3.10 增加前端模型测试，覆盖 15 种类型的空模型、归一化、中文映射、名称 fallback、未知字段过滤和类型隔离。

## 4. Backend Domain Model

- [x] 4.1 在 `back/app/domain/business_flow` 建立非 Task BPMN semantic 模块，定义 profile 判别、`schemaVersion` 和 15 种 `semanticType`。
- [x] 4.2 实现事件和事务模型的归一化、受控枚举、默认值和质量检查。
- [x] 4.3 实现四类网关模型的归一化、分支引用校验、默认路径一致性和数量约束质量检查。
- [x] 4.4 实现四类数据模型的归一化、节点引用清洗和质量检查。
- [x] 4.5 实现三类连线模型的归一化、条件/消息/关联字段校验和质量检查。
- [x] 4.6 实现后端专属名称 helper，并在保存时以结构化名称重建 `title/label` 兼容缓存。
- [x] 4.7 在 API 保存、组件发布、组件放置、协作物化和历史恢复入口统一调用领域归一化，禁止 router 内散落类型判断。
- [x] 4.8 对 BPMN profile 与 `semanticType` 不一致的写入执行拒绝或安全归一化，并返回可理解的中文错误或质量问题。
- [x] 4.9 增加后端领域测试，覆盖 15 种类型、旧名称 fallback、类型不匹配、网关引用、Saga 补偿和非法枚举。

## 5. Shared Chinese Property Forms

- [x] 5.1 建立非 Task BPMN 属性面板分发组件，根据固定 BPMN profile 选择唯一专属表单。
- [x] 5.2 建立可复用的中文字符串列表、引用列表、键值选项、条件分支和可排序条目编辑控件。
- [x] 5.3 实现开始事件、中间事件、结束事件专属表单，并按事件定义动态展示适用字段。
- [x] 5.4 实现事务专属表单，覆盖成功条件、取消条件、补偿策略、补偿顺序、一致性、超时和部分成功策略。
- [x] 5.5 实现排他和包容网关表单，从当前实际连线生成分支与默认路径选择项。
- [x] 5.6 实现并行和复杂网关表单，覆盖汇聚模式、分支数量、部分失败、超时和完成条件。
- [x] 5.7 实现数据对象、数据输入、数据输出和数据存储专属表单。
- [x] 5.8 实现 Sequence、Message、Association 连线专属表单，并让连线专属名称实时更新画布标签。
- [x] 5.9 在全部专属表单中接入中文质量提示，指出具体字段、节点或连线，不只显示笼统错误。
- [ ] 5.10 增加前端组件测试，证明不同类型只显示适用中文字段，且不显示旧通用字段、BPMN profile 或业务语义 Profile。

## 6. Business Flow And Swimlane Editors

- [x] 6.1 在业务流程编辑器中以新分发组件替换非 Task 通用节点表单，并移除旧标题、描述、角色、业务规则、输入摘要、输出摘要字段。
- [x] 6.2 在业务流程编辑器中隐藏非 Task 的 `BpmnNodeProfileFields`，保持内部 profile、渲染和连接校验不变。
- [x] 6.3 在业务流程编辑器中替换三类连线属性面板，隐藏 `BpmnEdgeProfileFields` 和业务语义 Profile 编辑入口。
- [x] 6.4 在泳道组件编辑器中完成与业务流程编辑器一致的节点和连线表单替换。
- [x] 6.5 更新选中态读取逻辑，使节点和连线从 `bpmnSemanticJson` 读取专属模型，并为旧图执行名称 fallback。
- [x] 6.6 更新工具箱新建逻辑，为每个非 Task 节点和连线初始化正确的空语义模型及中文默认名称。
- [x] 6.7 验证改变专属名称只更新当前元素和兼容缓存，不触发 BPMN 类型变化或全图重建。

## 7. ER Binding Boundary

- [x] 7.1 建立前后端共享语义一致的 `isDataBpmnElement` 判定，仅识别数据对象、数据输入、数据输出、数据存储。
- [x] 7.2 仅在四类数据节点专属表单展示 `NodeErBindingEditor`，并从事件、事务、网关、Task 和连线面板移除 ER 入口。
- [x] 7.3 更新差量操作构建，禁止非数据节点新增 ER 引用，同时保持数据节点 ER 引用的新增、修改和删除。
- [x] 7.4 更新后端保存和物化校验，拒绝新写入的非数据节点 ER 绑定，并且不把遗留非法绑定投影到新语义。
- [x] 7.5 更新泳道组件发布与放置逻辑，仅复制四类数据节点的 ER 绑定并正确重映射节点 key。
- [x] 7.6 更新历史恢复和旧图兼容，确保合法数据节点绑定不丢失，遗留非数据绑定不重新进入 UI 或 Agent context。
- [x] 7.7 增加前后端测试，覆盖四类数据节点允许绑定及其他全部元素禁止绑定。

## 8. X6, Diff, Collaboration, And History

- [x] 8.1 更新 X6 cell data、节点/连线 draft 和 API normalization，完整携带 `bpmnSemanticJson`。
- [x] 8.2 更新业务图创建与保存，使专属名称、X6 label、`title/label` 缓存和 JSON 在同一写入中保持一致。
- [x] 8.3 更新 `buildBusinessFlowOps`，检测节点和连线语义 JSON 差异并生成最小增量 op。
- [x] 8.4 更新 Yjs 节点/连线写入、读取和 patch 合成，至少按稳定 node/edge key 增量同步，禁止回退为全图覆盖。
- [x] 8.5 验证同一元素不同字段的并发行为；如对象级替换会覆盖无关字段，则将语义拆为字段级 Y.Map 或实现可验证的字段级 merge。
- [x] 8.6 更新泳道组件发布、版本读取和放置，建立组件 edge key 到实例 edge key 映射并重写网关分支引用。
- [x] 8.7 更新历史 checkpoint、snapshot、checksum 和 restore，使语义 JSON、专属名称、网关引用及合法 ER 绑定完整恢复。
- [ ] 8.8 验证恢复或全量重建后的协作 revision 与权威状态一致，旧 Yjs 文档不得覆盖恢复后的新语义。
- [ ] 8.9 增加差量、Yjs、发布/放置和历史恢复测试，覆盖节点字段、连线字段、分支引用和名称同步。

## 9. Agent Context And Quality Projection

- [x] 9.1 更新 Agent context repository 查询，读取节点和连线的 `bpmn_semantic_json`。
- [x] 9.2 更新 Agent context 组装，为每个非 Task 节点输出稳定 node key、BPMN 身份、归一化 `bpmnSemantic` 和质量问题。
- [x] 9.3 为每条连线输出稳定 edge key、端点、类型专属语义和质量问题，并保持网关分支引用可关联。
- [x] 9.4 仅为四类数据节点输出 ER 表字段引用，过滤 Task、事件、事务、网关和连线的遗留绑定。
- [x] 9.5 停止将旧描述、角色、业务规则、输入摘要、输出摘要和通用业务语义 Profile 作为非 Task Agent 语义来源。
- [x] 9.6 保持现有 `text + documents` 响应兼容，并在文本摘要中使用中文专属名称和关键结构化语义。
- [x] 9.7 增加 Agent context 测试，覆盖事件触发、网关条件、默认路径、事务补偿、数据 ER 引用、连线场景和旧字段过滤。

## 10. End-To-End Verification

- [x] 10.1 运行 `npm run build --prefix front` 并修复全部 TypeScript 与构建错误。
- [ ] 10.2 运行前端单元测试，确认 15 种模型、表单分发、名称同步、质量提示和 ER 边界通过。
- [ ] 10.3 运行后端编译和测试，确认迁移、DTO、领域归一化、保存、恢复与 Agent context 通过。
- [ ] 10.4 浏览器验证业务流程图：逐类创建 12 个非 Task 节点与 3 类连线，编辑中文字段、保存、刷新后数据和画布文字一致。
- [ ] 10.5 浏览器验证旧图：旧名称可回填，旧通用字段、内部 BPMN profile 和业务语义 Profile 不在新面板暴露。
- [ ] 10.6 浏览器验证数据节点 ER 绑定可保存恢复，所有其他元素无 ER 入口且 Agent 不输出遗留绑定。
- [ ] 10.7 浏览器验证泳道组件编辑、发布和放置，专属语义与网关 edge key 引用正确映射到实例。
- [ ] 10.8 双客户端验证不同元素及同一元素不同字段的协作编辑，不覆盖无关修改。
- [ ] 10.9 验证历史 checkpoint 与恢复，确认语义 JSON、画布名称、连线条件、网关引用和数据 ER 绑定一致。
- [ ] 10.10 调用 Agent context 接口，确认 Agent 可从结构化数据识别正常、异常、边界和补偿测试依据，无需读取数据库或画布截图。
- [x] 10.11 运行 `openspec validate refactor-non-task-bpmn-semantic-fields --strict`。
