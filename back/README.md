# ER Schema Graph API (FastAPI)

双层持久化：

- **画布层** `er_graph_snapshot.x6_json`：X6 nodes/edges，用于恢复画布
- **语义层** `er_table` / `er_column` / `er_column_enum_value` / `er_relation` / `er_business_path`：Agent 检索与 upsert

## 启动

```bash
# 根目录启动 Postgres
docker compose up -d

cd back
source .venv/bin/activate
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

默认图 ID：`00000000-0000-0000-0000-000000000001`（见 `migrations/001_baseline.sql`）

空库启动时自动执行 `migrations/001_baseline.sql`（含表结构与中文注释）。历史增量迁移在 `migrations/archive/`，不会被启动器执行。在 psql 中查看：

```sql
\d+ er_table
SELECT col_description('er_column'::regclass, ordinal_position)
FROM information_schema.columns WHERE table_name = 'er_column';
```

## 主要接口

| 方法 | 路径                                | 说明                                                                           |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------ |
| GET  | `/api/health`                       | 健康检查                                                                       |
| GET  | `/api/graphs/default/id`            | 默认 graph_id                                                                  |
| GET  | `/api/graphs/{id}`                  | 加载快照 + 结构化数据                                                          |
| POST | `/api/graphs/{id}/sync/canvas`      | 前端提交 x6Json；服务端 diff 后增量写入，并写明细 `er_change_log` + checkpoint |
| POST | `/api/graphs/{id}/sync/changes`     | 直接提交 `changes`（tables/columns/enums/relations 的 added/updated/deleted）  |
| GET  | `/api/graphs/{id}/history`          | 变更历史列表（含可读 summary）                                                 |
| POST | `/api/graphs/{id}/restore`          | 从 checkpoint 恢复，`body: { change_log_id }`                                  |
| POST | `/api/graphs/{id}/normalize`        | 预览 normalize 结果                                                            |
| GET  | `/api/graphs/{id}/agent-context?q=` | Agent 检索文本                                                                 |

### change_log 约定

- **明细**：`change_type` = `upsert` | `delete`；`entity_type` = `table` | `column` | `enum` | `relation`
- **检查点**：`change_type=checkpoint`，`after_data` 含 `legacy_tables`、`x6_json`、`summary`（仅 checkpoint 可恢复）

## 环境变量

使用仓库根目录 `.env`：

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=antvx6
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```
