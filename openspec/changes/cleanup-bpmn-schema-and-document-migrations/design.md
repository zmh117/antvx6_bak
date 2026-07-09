## Context

业务流程模型经历了 MES 字段、业务语义 Profile、流程容器、Task Web 测试模型和非 Task BPMN 专属语义多轮演进。当前有效数据源已经明确：

- Task：`task_ui_json`
- 12 类非 Task 节点和 3 类连线：`bpmn_semantic_json`
- 数据节点：`business_flow_node_er_ref` 与 `swimlane_component_node_er_ref`
- 图形与兼容定位：`title/label`、`node_type/edge_type`、BPMN profile、布局和样式字段

但是旧字段仍贯穿 DTO、SQL、X6 cell data、Yjs、历史和 Agent Context。直接删列会导致运行时 SQL 错误，也可能由旧快照或 Yjs 状态重新写回。因此本变更是数据库结构、持久化数据和应用契约的同步收敛。

## Goals / Non-Goals

**Goals:**

- 保留 `001-018` migration 历史，通过新增 019/020 得到唯一最终 schema。
- 删除明确废弃的列、索引、业务语义 Profile 表及全部应用读写代码。
- 清理快照、历史操作和协作文档中的遗留键。
- 为所有最终应用表和字段补齐中文 PostgreSQL 注释。
- 证明空库安装和存量升级得到相同结构。

**Non-Goals:**

- 不删除 `title/label`、`node_type/edge_type` 或 `properties_json`。
- 不改变当前 13 个 BPMN 节点和 3 类连线工具箱集合。
- 不改变 Task UI、非 Task BPMN 专属语义或 ER 多字段绑定字段模型。
- 不重写或压缩 `001-018` migration 文件。
- 不尝试保留被删除字段中的历史业务值。

## Decisions

### 1. 采用追加式 019/020，不重写历史

019 负责数据清洗和结构删除，020 只负责最终 schema 注释。两者分离后，结构失败与注释缺失可以独立定位，020 也可安全重复执行。

替代方案是合并或修改旧 migration。该方案无法可靠升级已运行数据库，并会让新旧环境执行路径不一致，因此不采用。

### 2. 先删除应用依赖，再执行数据库删列

实现顺序采用“字段使用矩阵 → 前后端契约收敛 → 历史/Yjs 清洗 → 数据库删列 → 注释和验证”。代码层不得保留“总是写 null/空对象”的兼容字段，否则删列后仍会生成无效 SQL 或协作 patch。

### 3. 明确保留兼容缓存和类型判别字段

`title/label` 继续作为画布显示与旧名称 fallback 缓存；`node_type/edge_type` 继续服务 X6、差量和跨泳道边类型；BPMN profile 字段继续判别节点图形与连接规则。它们不是本轮废弃对象。

### 4. 019 递归清理 JSON 并隔离旧协作状态

019 使用幂等 PostgreSQL JSONB 清理函数，递归删除 snake_case/camelCase 遗留键，覆盖：

- `swimlane_component_version.canvas_json/semantic_json`
- `business_flow_snapshot.canvas_json/semantic_json`
- `business_flow_change_op.patch_json/inverse_patch_json`

Yjs 二进制状态不在 SQL 中逐字段重写。019 删除 `BUSINESS_FLOW` 和 `SWIMLANE_COMPONENT_DRAFT` 对应协作文档/更新，并递增 `business_flow.collab_revision`，由当前结构重新建立权威文档。

### 5. 业务语义 Profile 完整删除

删除 `business_semantic_profile` 表、四张节点/连线表的 Profile 三字段、前后端 profile 类型/helper/质量规则和 Agent 投影。当前 `bpmn_semantic_json` 已承担非 Task 和连线语义，Task 使用 `task_ui_json`，不再保留第二套可选语义来源。

### 6. 020 显式覆盖最终表和字段

020 使用显式 `COMMENT ON TABLE/COLUMN`，注释目标以 019 后的 schema 清单为准。测试通过 `pg_description`、`pg_class` 和 `pg_attribute` 计算覆盖率，排除 PostgreSQL 系统表、扩展对象和已删除字段。

不采用运行时自动生成泛化注释，因为泛化描述无法表达字段取值、外键目标和生命周期。

### 7. Migration 启动器使用显式有序清单

保留 001 的空库条件和 014/015 的历史兼容分支，但将后续执行顺序整理为可审计的有序清单/阶段，明确 019 必须先于 020。不得简单按目录 glob 执行，以免样例 SQL 或未来未完成文件被误执行。

## Risks / Trade-offs

- [删列造成历史值不可恢复] → 部署前要求备份；019 不提供数据级 down migration，只提供结构重建说明。
- [遗漏代码引用导致运行时 SQL 错误] → 使用字段使用矩阵和全仓库禁止词扫描，并覆盖保存、发布、放置、协作、恢复和 Agent 路径。
- [旧 Yjs 状态重新写入遗留键] → 删除相关协作文档并递增 `collab_revision`。
- [递归 JSON 清理误删同名业务字段] → 仅清理已确认的结构键，并使用包含当前语义、Task UI、ER 和布局数据的 fixture 做保留断言。
- [020 注释随未来 migration 漂移] → 增加 schema 注释覆盖测试；未来新增表或字段必须同步补充注释。
- [新旧数据库最终结构不一致] → 分别执行空库全量和 018 存量升级测试，并比较规范化 schema 清单。

## Migration Plan

1. 生成最终字段保留/删除矩阵，并以测试固定。
2. 删除前后端、X6、Yjs、历史和 Agent 对废弃字段的读写。
3. 在测试数据库构造 018 结构及遗留 JSON/Yjs fixture，备份验证数据。
4. 执行 019：清理 JSON、删除旧协作文档、递增 revision、删除索引/表/列并记录 migration state。
5. 执行 020：为最终全部应用表和字段写入中文注释。
6. 执行空库与存量升级 schema 对比、API 往返、历史恢复、组件发布放置、协作重连和 Agent Context 测试。
7. 部署前创建数据库备份；若失败，恢复备份并回退应用版本。由于字段值被永久删除，不承诺自动数据回滚。

## Open Questions

无。删除范围和追加式 019/020 策略已确认。
