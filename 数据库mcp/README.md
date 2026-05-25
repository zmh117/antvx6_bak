# PostgreSQL 只读 MCP

让 Agent 通过 MCP 协议**只读**访问 PostgreSQL，专注于"快速理解一个陌生数据库"：schema、表、列、外键关系、注释、抽样。**任何写操作都会被拒绝**。

文件：`server_postgres.py`（参考自 `server_oracle.py`，已删除 Redis、多厂区路由等无关功能，仅保留 PG 只读能力）。

## 工具列表

| 工具                                         | 用途                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `pg_database_overview`                       | 数据库 / 版本 / 各 schema 对象计数                |
| `pg_list_schemas`                            | 列出所有用户 schema                               |
| `pg_list_tables(schema, include_views)`      | 列出 schema 下的表/视图（含注释、估算行数、大小） |
| `pg_get_table_info(table_name, schema)`      | 表结构：列、PK、FK、UNIQUE、CHECK、索引、注释     |
| `pg_list_relations(schema)`                  | 整个 schema 的外键关系，用于一次性还原 ER         |
| `pg_search_objects(keyword, schema)`         | 按关键字搜表名/列名/注释                          |
| `pg_sample_table(table_name, schema, limit)` | 抽样前 N 行                                       |
| `pg_query(sql, max_rows)`                    | 通用只读 SELECT                                   |
| `pg_explain(sql, analyze)`                   | EXPLAIN (FORMAT JSON) 查询计划                    |

## 安全模型（纵深防御）

1. **SQL 应用层校验**
   - 仅允许 `SELECT / WITH / TABLE / VALUES / SHOW / EXPLAIN` 开头；
   - 黑名单：`INSERT / UPDATE / DELETE / MERGE / DROP / ALTER / CREATE / TRUNCATE / GRANT / REVOKE / COPY / VACUUM / CALL / DO / COMMENT / NOTIFY / BEGIN / SET / RESET / PREPARE / REFRESH / LOAD ...`；
   - 关键字扫描会先剥离字符串字面量、`-- / /* */` 注释与 `$tag$ ... $tag$` 美元引用；
   - 拒绝内部分号（防多语句）。
2. **数据库事务层**：每次查询前 `SET TRANSACTION READ ONLY`，即使绕过应用层校验，PostgreSQL 也会拒绝写入。
3. **资源层**：`SET LOCAL statement_timeout` 限制单条 SQL 执行时间；`max_rows` 限制返回行数；`fetchmany(limit+1)` 用于判断是否截断。
4. **标识符注入**：`pg_sample_table` 等动态拼接 schema/table 名的工具一律使用 `psycopg.sql.Identifier` 转义。

## 环境变量

从脚本同级或项目根的 `.env` 自动加载：

```env
# 二选一：DATABASE_URL 优先
DATABASE_URL=postgresql://user:pwd@host:5432/db

# 或使用以下变量拼装
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=antvx6
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# 可选
PG_MAX_ROWS=200                # 单次查询最大返回行数
PG_STATEMENT_TIMEOUT_MS=10000  # 单条 SQL 超时（毫秒）
PG_SQL_MAX_LENGTH=10000        # SQL 长度上限（字符）
```

> 当前仓库的 `.env` 已经包含 `POSTGRES_*`，开箱即用。

## 安装

```powershell
pip install -r 数据库mcp/requirements.txt
```

## 在 Cursor 中注册

`.cursor/mcp.json`（仓库或用户级均可）：

```json
{
  "mcpServers": {
    "pg_explore": {
      "command": "python",
      "args": [
        "d:/SynologyDrive/Python_project/antvX6/数据库mcp/server_postgres.py"
      ]
    }
  }
}
```

> Windows 路径建议用正斜杠或转义反斜杠。如果使用虚拟环境，把 `command` 换成对应的 `python.exe` 全路径。

## 推荐 Agent 使用顺序

1. `pg_database_overview` → 看库总体；
2. `pg_list_tables(schema=...)` → 锁定 schema 内的对象；
3. `pg_list_relations(schema=...)` → 还原表与表之间的外键关系；
4. 对感兴趣的表 `pg_get_table_info(...)` + `pg_sample_table(...)` → 看结构 + 真实数据；
5. 需要复杂查询时 `pg_query(...)`，性能问题用 `pg_explain(...)`。

## 实现说明（关键陷阱）

- **`SET TRANSACTION READ ONLY` 必须是事务的第一条语句**：所以代码中先 `conn.transaction()` 再 `cur.execute("SET TRANSACTION READ ONLY")`，再放任何业务 SQL。
- **CTE 写入绕过**：`WITH x AS (DELETE FROM t) SELECT 1` 这种语法即使应用层放过去，也会被 `READ ONLY` 事务层拒绝。
- **JSON 序列化**：`Decimal/UUID/datetime/date/time/timedelta/bytes/memoryview/set` 已在 `_json_default` 中兜底；`bytea` 优先尝试 UTF-8 解码失败时退化为 `<bytes:N>`。
- **schema/表名注入**：`pg_sample_table` 用 `psycopg.sql.Identifier`，不会被恶意表名注入。
- **`reltuples` 准确性**：估算行数依赖 `ANALYZE`；从未 ANALYZE 的表可能为 `-1`。需要精确数量请用 `SELECT COUNT(*)`。
