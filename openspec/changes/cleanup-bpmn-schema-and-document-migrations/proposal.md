## Why

当前 BPMN 节点和连线已经形成稳定的 `task_ui_json`、`bpmn_semantic_json` 与 ER 引用模型，但数据库、DTO、Yjs 和历史链路仍保留通用备注、业务语义 Profile、流程容器及重复连线语义字段。这些遗留字段增加了新旧语义冲突、误读和迁移维护成本；同时后期新增表缺少完整中文注释，数据库结构难以审计。

## What Changes

- **BREAKING** 新增 `019_bpmn_schema_cleanup.sql`，删除已废弃的通用节点字段、业务语义 Profile 表及关联字段、流程容器字段和索引、无节点支持的 Call Activity 引用，以及已由 `bpmn_semantic_json` 替代的连线条件、消息和数据契约字段。
- **BREAKING** 删除前后端 DTO、领域模型、API、X6、差量、Yjs、组件发布/放置、历史恢复和 Agent Context 对上述字段的读写与兼容投影。
- 在删列前清理画布 JSON、组件语义、历史快照、变更操作和协作文档中的遗留键；重置受影响协作文档并递增业务图协作版本，防止旧 Yjs 状态回写已删除字段。
- 保留 `title/label` 显示缓存、`node_type/edge_type` 画布与差量兼容字段、BPMN 类型判别字段、`properties_json`、`task_ui_json`、`bpmn_semantic_json` 和 ER 多字段绑定结构。
- 新增 `020_schema_comments.sql`，为当前数据库中的每个业务表和每个字段补齐中文 `COMMENT`，并覆盖 `001-019` 最终结构。
- 保留 `001-018` 迁移历史，不重写已执行 migration；新环境按原顺序执行后再应用 `019/020`，存量环境仅增量执行清理与注释。
- 更新迁移启动器、数据库测试和结构审计，确保删列、约束、索引、注释覆盖率及新旧环境执行结果一致。

## Capabilities

### New Capabilities

- `bpmn-schema-cleanup-and-documentation`: 定义 BPMN 最终持久化字段集合、破坏性遗留数据清理、迁移执行策略和全库中文注释覆盖要求。

### Modified Capabilities

无。

## Impact

- 数据库：`back/migrations/019_bpmn_schema_cleanup.sql`、`020_schema_comments.sql`、迁移启动器及 BPMN/业务流程相关表、约束、索引和历史数据。
- 后端：业务流程与泳道组件 DTO、路由、领域 helper、历史恢复、协作物化、Agent Context repository/service。
- 前端：业务流程类型、API 归一化、X6 cell data、diff、Yjs、组件编辑器与本地 store。
- 兼容性：旧字段及其历史值将被永久删除；旧客户端不得再向 API 或 Yjs 写入这些字段。
