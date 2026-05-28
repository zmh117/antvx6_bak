# ER 业务字段 Web 编辑计划

## Summary
- 在现有 ER 画布上增加“表 / 字段 / 关系”的业务属性编辑侧栏，只开放业务语义字段，不开放物理结构、审计、版本、删除、原始 JSON 等系统字段。
- 保存仍走现有 `sync/canvas` 链路：前端更新 X6 node/edge data，后端从完整画布 payload 计算实体级 diff，写 `er_change_log` 和 checkpoint，支持历史恢复。
- 设计保持 DDD 边界：业务规则和可编辑字段定义放在 ER entity/model 层；React 组件只负责交互；后端继续由 Domain diff + Repository 落库；不引入绕过领域模型的直接表单写库 API。
- 为后续 Yjs 预留：业务编辑落在 X6 node/edge data 上，未来可映射到 Yjs shared document；TanStack Query 只做 HTTP server state，不承载协同状态。

## Editable Fields
- `er_table` 可编辑：
  - `business_name`
  - `description`
  - `business_domain`
  - `table_type`
  - `importance`
  - `tags`
  - `comment`
- `er_column` 可编辑：
  - `business_name`
  - `description`
  - `comment`
  - `column_role`
  - `tags`
  - 枚举字典：`er_column_enum_value.value / label / description / sort_order`
- `er_relation` 可编辑：
  - `relation_name`
  - `description`
  - `relation_type`
  - `relationship`
  - `verified`
  - `tags`
- 明确不在 Web 表单编辑：
  - 主键/租户/稳定键：`id`、`graph_id`、`table_key`、`column_key`、`relation_key`
  - 物理结构：`table_name`、`column_name`、`data_type`、`nullable`、`is_primary_key`、`is_unique`、`is_indexed`
  - 连线端点：`source_table_key/source_column_key/target_table_key/target_column_key`
  - 派生/系统字段：`key_type`、`enum_enabled`、`sort_order`、`join_condition`、`direction`、`confidence`、`source`
  - 存储/审计字段：`raw_data`、`raw_edge`、`version`、`created_by/updated_by`、`created_at/updated_at`、`deleted_at`
- `relationship` 保留现有点击边切换逻辑，同时在关系面板里提供下拉/分段控件，两者写同一份 edge data。

## Key Changes
- 前端 ER model：
  - 扩展 `TableField`：加入 `tags?: string[]`，继续保留 `businessName`、`description`、`columnRole`、`comment`、`enumValues`。
  - 扩展 relation/table 加载类型，确保结构化 `tables/columns/relations` 的业务字段覆盖 `raw_data` 中的旧值。
  - 新增“可编辑字段定义”和选项常量，例如 table type、column role、relation type、relationship，放在 `entities/er-graph/model`，供 UI 和保存逻辑复用。
- 前端交互：
  - 将现有 `FieldEnumPanel` 升级为字段业务属性面板：顶部显示只读物理信息，下面编辑业务名称、说明、注释、角色、标签、枚举。
  - 新增表业务属性面板：通过表头编辑按钮打开，不改变节点拖拽和字段点击逻辑。
  - 新增关系业务属性面板：保留单击边切换 `relationship`；通过边 hover 的编辑按钮或双击边打开详情面板。
  - 所有输入使用 400ms 防抖保存；失焦/关闭面板/pagehide 时 flush，避免刷新前丢数据。
- 前端保存：
  - 字段、表、关系面板都只 patch 当前 X6 cell data，然后调用现有 `schedulePersistRef.current(false, true)` 或等价机制。
  - `buildNormalizedSyncBody` 继续从 graph data 生成 `tables/columns/enums/relations`，补齐新增业务字段。
  - 保存成功后 invalidate graph history 和 agent-context Query cache。
- 后端/DDD：
  - 不新增直接编辑 `er_table/er_column/er_relation` 的 CRUD endpoint。
  - 复用 `GraphSyncService.sync_payload -> ErGraph.plan_changes -> apply_changes`。
  - 如需微调 diff，仅在 `domain/er/diff.py` 增加业务字段比较项：`table.tags/comment/business_domain/table_type/importance`、`column.tags/business_name/description/column_role/comment`、`relation.relation_type/relation_name/description/relationship/verified/tags`。
  - 保持 checkpoint 包含最新 `legacy_tables` 和 `x6_json`，确保历史恢复能恢复业务字段。

## Test Plan
- 前端构建：
  - `npm run build --prefix front`
- 后端静态检查：
  - `back/.venv/bin/python -m py_compile` 针对改动的后端文件。
- 浏览器验证：
  - 打开 `http://localhost:5173/`。
  - 编辑字段业务名称、说明、注释、角色、标签、枚举，刷新后仍存在。
  - 编辑表业务名称、业务域、类型、重要性、标签，刷新后仍存在。
  - 单击边仍能切换基数；双击/编辑按钮打开关系面板，编辑名称、说明、类型、verified，刷新后仍存在。
  - 打开历史记录，确认每次业务字段编辑产生 checkpoint 和实体 diff。
  - 恢复历史 checkpoint 后，表/字段/关系业务字段回到对应历史状态。
- API 验证：
  - `GET /api/graphs/{id}` 返回新增业务字段。
  - `GET /api/graphs/{id}/agent-context` 包含更新后的业务名称、说明、标签、关系说明。
  - 验证未开放字段不会被表单修改。

## Assumptions
- “业务字段可编辑”指业务语义、说明、分类、标签、枚举和人工确认信息；物理结构字段仍由数据库导入/分析流程维护。
- v1 不做真正的 PATCH-only 语义保存，因为当前历史恢复依赖 checkpoint snapshot；继续用 canvas sync 保证恢复一致性。
- Yjs 后续接入时，表/字段/关系业务属性会作为 shared graph data 的一部分同步，不使用 TanStack Query 承载实时协同状态。
