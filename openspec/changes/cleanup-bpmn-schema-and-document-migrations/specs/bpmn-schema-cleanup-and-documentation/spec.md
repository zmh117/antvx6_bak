## ADDED Requirements

### Requirement: BPMN 表只保留当前模型所需字段
系统 SHALL 将泳道组件节点、泳道组件连线、业务流程节点和业务流程连线收敛到当前 BPMN 模型，并永久删除已经没有有效业务入口的字段。

节点表 `swimlane_component_node` 与 `business_flow_node` SHALL 删除：

- `description`
- `actor`
- `business_rule`
- `input_summary`
- `output_summary`
- `semantic_profile_key`
- `semantic_profile_version`
- `semantic_payload_json`
- `process_container_json`
- `container_node_key`
- `bpmn_call_activity_ref`

连线表 `swimlane_component_edge` 与 `business_flow_edge` SHALL 删除：

- `condition_text`
- `data_contract_json`
- `semantic_profile_key`
- `semantic_profile_version`
- `semantic_payload_json`
- `bpmn_message_name`
- `bpmn_condition_expression`

系统 SHALL 删除 `business_semantic_profile` 表及流程容器索引。

系统 MUST 保留 `title`、`label`、`node_type`、`edge_type`、BPMN 类型判别字段、`properties_json`、`task_ui_json`、`bpmn_semantic_json` 和 ER 引用结构。

#### Scenario: 存量数据库完成字段收敛
- **WHEN** 存量数据库执行 `019_bpmn_schema_cleanup.sql`
- **THEN** 所有列出的废弃字段、业务语义 Profile 表和流程容器索引均不存在
- **AND** 当前 BPMN、Task UI、ER 引用及显示缓存字段仍存在

#### Scenario: 新数据库得到相同最终结构
- **WHEN** 空数据库依次执行 `001-020` migration
- **THEN** BPMN 相关表的最终字段集合与升级后的存量数据库一致

### Requirement: 应用代码不得继续读写被删除字段
前端、后端、API、X6、差量、Yjs、组件发布与放置、历史恢复及 Agent Context SHALL 从类型和执行路径中删除废弃字段，不得通过空值兼容继续发送或投影这些字段。

#### Scenario: 保存当前 BPMN 图
- **WHEN** 用户保存包含 Task、非 Task 节点、三类连线和 ER 多字段绑定的业务图
- **THEN** API 与数据库写入只包含最终字段集合
- **AND** 不访问任何已删除列

#### Scenario: Agent 读取业务图
- **WHEN** Agent Context 读取升级后的业务图
- **THEN** Task 使用 `task_ui_json`
- **AND** 非 Task 节点和连线使用 `bpmn_semantic_json`
- **AND** Agent 输出中不存在业务语义 Profile、流程容器或旧通用备注投影

### Requirement: 019 migration 必须清理所有持久化遗留键
`019_bpmn_schema_cleanup.sql` SHALL 在删列前清理组件画布、组件语义、业务流程快照、历史变更操作和协作状态中的旧字段键，包含 snake_case 与 camelCase 形式。

清理范围 MUST 包含旧通用节点字段、业务语义 Profile 字段、流程容器字段和被新连线语义替代的字段。系统 SHALL 删除受影响的业务流程和泳道组件协作文档，并为业务流程递增 `collab_revision`，防止旧 Yjs 文档重新写回已删除字段。

#### Scenario: 历史快照包含遗留键
- **WHEN** 019 migration 遇到包含废弃键的 `canvas_json`、`semantic_json`、`patch_json` 或 `inverse_patch_json`
- **THEN** migration 递归删除废弃键并保留当前 BPMN、Task UI、ER 引用和布局数据

#### Scenario: 协作文档可能回写旧字段
- **WHEN** 019 migration 完成结构清理
- **THEN** BPMN 业务图和泳道组件草稿的旧协作文档被清除
- **AND** 业务图协作版本递增

### Requirement: Migration 历史保持追加式
系统 SHALL 保留 `001-018` 文件及其执行语义，不得通过修改已执行 migration 来伪造最终结构。数据库启动器 SHALL 在原有迁移后执行 `019_bpmn_schema_cleanup.sql` 和 `020_schema_comments.sql`。

#### Scenario: 已执行旧 migration 的环境升级
- **WHEN** 数据库已经执行过 `001-018`
- **THEN** 启动器只需追加执行 019 和 020 即可完成升级

#### Scenario: migration 重复执行
- **WHEN** 应用再次启动并重复运行 migration
- **THEN** 019 和 020 不报错、不重复破坏数据且最终结构保持不变

### Requirement: 全部应用表和字段必须有中文说明
`020_schema_comments.sql` SHALL 为 `001-019` 创建并最终保留的每个应用表及其每个字段设置非空中文 `COMMENT`。注释 MUST 说明业务含义；状态、类型、JSON、外键、版本、时间和软删除字段还 MUST 说明关键取值、引用目标或生命周期用途。

#### Scenario: 注释覆盖率审计
- **WHEN** 从 PostgreSQL 系统目录查询当前应用表和字段说明
- **THEN** 每个应用表均有非空中文说明
- **AND** 每个字段均有非空中文说明

#### Scenario: 被删除对象不再出现在注释脚本
- **WHEN** 审计 020 的注释目标
- **THEN** 脚本不再为已删除表、字段或索引建立说明

### Requirement: 清理必须经过新旧数据库双路径验证
实现 SHALL 提供自动化数据库验证，分别覆盖空库全量执行与基于 018 结构的存量升级，并验证字段集合、约束、索引、注释覆盖率和关键 BPMN 往返行为。

#### Scenario: 空库验证
- **WHEN** 测试在空 PostgreSQL 数据库执行完整 migration
- **THEN** 所有 migration 成功
- **AND** 最终 schema、注释和 BPMN 保存读取测试通过

#### Scenario: 存量升级验证
- **WHEN** 测试构造含遗留字段、历史 JSON 和协作状态的 018 数据库并执行 019/020
- **THEN** 遗留结构和数据键被清理
- **AND** 当前 Task、非 Task、连线、ER 绑定、历史恢复与 Agent Context 功能保持可用
