"""
PostgreSQL 只读 MCP 服务器
=========================

目标：让 Agent 快速理解一个陌生的 PostgreSQL 数据库（schema、表、列、外键、注释、抽样），
并支持只读 SELECT 查询。**任何写操作都会被拒绝**。

安全设计（纵深防御）
--------------------
1. 应用层 SQL 校验：白名单起始词（SELECT/WITH/TABLE/VALUES/SHOW/EXPLAIN），
   黑名单关键字（INSERT/UPDATE/DELETE/DROP/ALTER/...），禁止内部分号。
2. 数据库层：每次查询都包在 ``BEGIN; SET TRANSACTION READ ONLY`` 事务中，
   即便绕过应用层校验，PostgreSQL 也会拒绝写入。
3. 资源层：``SET LOCAL statement_timeout`` 限制单条 SQL 执行时间，``max_rows`` 限制返回行数。
4. 标识符注入：动态拼接的 schema/table 名一律用 ``psycopg.sql.Identifier`` 转义。

环境变量（从脚本同级或上级目录的 ``.env`` 读取）
------------------------------------------------
- ``DATABASE_URL`` 优先；否则使用 ``POSTGRES_USER`` / ``POSTGRES_PASSWORD`` /
  ``POSTGRES_HOST`` / ``POSTGRES_PORT`` / ``POSTGRES_DB`` 拼接。
- ``PG_MAX_ROWS``（默认 200）：单次查询返回行数上限。
- ``PG_STATEMENT_TIMEOUT_MS``（默认 10000）：单条 SQL 超时毫秒。
- ``PG_SQL_MAX_LENGTH``（默认 10000）：SQL 长度上限。
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator, Optional
from uuid import UUID

from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent
for _candidate in (_SCRIPT_DIR / ".env", _SCRIPT_DIR.parent / ".env"):
    if _candidate.exists():
        load_dotenv(_candidate)
        break

import psycopg
from psycopg import sql as psql
from psycopg.rows import dict_row

from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.WARNING)

mcp = FastMCP("pg_explore")


# --------------------------------------------------------------------------- #
# 配置
# --------------------------------------------------------------------------- #

DEFAULT_MAX_ROWS = max(1, int(os.getenv("PG_MAX_ROWS", "200")))
DEFAULT_TIMEOUT_MS = max(100, int(os.getenv("PG_STATEMENT_TIMEOUT_MS", "10000")))
SQL_MAX_LENGTH = max(100, int(os.getenv("PG_SQL_MAX_LENGTH", "10000")))


def _build_dsn() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "postgres")
    auth = f"{user}:{password}" if password else user
    return f"postgresql://{auth}@{host}:{port}/{db}"


# --------------------------------------------------------------------------- #
# SQL 安全校验
# --------------------------------------------------------------------------- #

_ALLOWED_LEADING = re.compile(
    r"^\s*(?:WITH|SELECT|TABLE|VALUES|SHOW|EXPLAIN)\b", re.IGNORECASE
)

# 任何能改数据 / 改 schema / 改会话 / 改权限的关键字一律拒绝。
# 注：BEGIN/COMMIT/ROLLBACK/SAVEPOINT/SET 也被拒绝，事务由本服务器内部控制。
_FORBIDDEN_KEYWORDS = (
    "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT",
    "DROP", "ALTER", "CREATE", "TRUNCATE", "RENAME", "REPLACE",
    "GRANT", "REVOKE",
    "COPY", "VACUUM", "ANALYZE", "REINDEX", "CLUSTER",
    "LOCK", "CALL", "DO",
    "COMMENT",
    "NOTIFY", "LISTEN", "UNLISTEN",
    "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE",
    "SET", "RESET", "DISCARD", "PREPARE", "DEALLOCATE",
    "REFRESH", "IMPORT", "LOAD",
)

_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT = re.compile(r"--[^\n]*")
# PostgreSQL 美元引用：$$ ... $$（裸）与 $tag$ ... $tag$（带标签）。
# 拆成两个正则是因为反向引用 \1 在标签为空时无法匹配。
_DOLLAR_QUOTE_TAGGED = re.compile(r"\$([A-Za-z_]\w*)\$.*?\$\1\$", re.DOTALL)
_DOLLAR_QUOTE_BARE = re.compile(r"\$\$.*?\$\$", re.DOTALL)
_STRING_LITERAL = re.compile(r"'(?:''|[^'])*'", re.DOTALL)


def _strip_comments_and_strings(sql: str) -> str:
    """
    去除 ``/* */``、``--``、字符串字面量、``$tag$ ... $tag$`` 与 ``$$ ... $$`` 美元引用。
    这样后续的关键字扫描不会被字符串内容污染。
    """
    sql = _BLOCK_COMMENT.sub(" ", sql)
    sql = _LINE_COMMENT.sub(" ", sql)
    sql = _DOLLAR_QUOTE_TAGGED.sub(" ", sql)
    sql = _DOLLAR_QUOTE_BARE.sub(" ", sql)
    sql = _STRING_LITERAL.sub(" ", sql)
    return sql


def is_safe_select(sql: str, max_length: int = SQL_MAX_LENGTH) -> tuple[bool, Optional[str]]:
    """检查 SQL 是否为只读语句。返回 (ok, error)。"""
    s = (sql or "").strip()
    if not s:
        return False, "SQL 为空"
    if len(s) > max_length:
        return False, f"SQL 超过最大长度 {max_length}"

    s_no_tail = s.rstrip()
    while s_no_tail.endswith(";"):
        s_no_tail = s_no_tail[:-1].rstrip()

    cleaned = _strip_comments_and_strings(s_no_tail)
    if ";" in cleaned:
        return False, "SQL 不允许出现内部分号（多语句）"

    if not _ALLOWED_LEADING.match(cleaned):
        return False, "仅允许以 SELECT / WITH / TABLE / VALUES / SHOW / EXPLAIN 开头的只读语句"

    upper = cleaned.upper()
    for kw in _FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{kw}\b", upper):
            return False, f"SQL 包含禁用关键字: {kw}"

    return True, None


def _strip_trailing_semicolon(sql: str) -> str:
    s = sql.rstrip()
    while s.endswith(";"):
        s = s[:-1].rstrip()
    return s


# --------------------------------------------------------------------------- #
# 连接 / 只读事务
# --------------------------------------------------------------------------- #

@contextmanager
def _readonly_cursor(timeout_ms: Optional[int] = None) -> Iterator[psycopg.Cursor]:
    """
    打开一个 ``READ ONLY`` 事务并 ``yield`` cursor。
    退出时一律 ROLLBACK（只读事务无需 COMMIT）。
    """
    conn = psycopg.connect(_build_dsn(), row_factory=dict_row, autocommit=True)
    try:
        with conn.transaction():
            with conn.cursor() as cur:
                # 必须是事务内第一条语句
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute(
                    psql.SQL("SET LOCAL statement_timeout = {}").format(
                        psql.Literal(int(timeout_ms or DEFAULT_TIMEOUT_MS))
                    )
                )
                yield cur
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# JSON 序列化
# --------------------------------------------------------------------------- #

def _json_default(o: Any) -> Any:
    if isinstance(o, (datetime, date, time)):
        return o.isoformat()
    if isinstance(o, timedelta):
        return str(o)
    if isinstance(o, Decimal):
        return str(o)
    if isinstance(o, UUID):
        return str(o)
    if isinstance(o, (bytes, bytearray, memoryview)):
        b = bytes(o)
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return f"<bytes:{len(b)}>"
    if isinstance(o, set):
        return list(o)
    return str(o)


def _respond(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default)


# --------------------------------------------------------------------------- #
# 内部：通用只读查询
# --------------------------------------------------------------------------- #

def _run_select(sql: str, max_rows: Optional[int]) -> dict[str, Any]:
    limit = int(max_rows) if max_rows is not None else DEFAULT_MAX_ROWS
    if limit <= 0:
        limit = DEFAULT_MAX_ROWS

    sql_clean = _strip_trailing_semicolon(sql)
    ok, err = is_safe_select(sql_clean)
    if not ok:
        return {
            "ok": False,
            "error": err,
            "row_count": 0,
            "truncated": False,
            "data": [],
        }

    try:
        with _readonly_cursor() as cur:
            cur.execute(sql_clean)
            if cur.description is None:
                return {
                    "ok": False,
                    "error": "该语句没有结果集",
                    "row_count": 0,
                    "truncated": False,
                    "data": [],
                }
            cols = [d.name for d in cur.description]
            rows = cur.fetchmany(limit + 1)
            truncated = len(rows) > limit
            rows = rows[:limit]
            return {
                "ok": True,
                "columns": cols,
                "row_count": len(rows),
                "truncated": truncated,
                "data": list(rows),
                "error": None,
            }
    except Exception as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "row_count": 0,
            "truncated": False,
            "data": [],
        }


def _split_qualified(table_name: str, default_schema: str) -> tuple[str, str]:
    """把 ``schema.table`` 或 ``table`` 切成 (schema, table)。允许带双引号。"""
    name = (table_name or "").strip()
    if "." in name:
        s, t = name.split(".", 1)
        return s.strip().strip('"'), t.strip().strip('"')
    return (default_schema or "public").strip(), name.strip().strip('"')


# --------------------------------------------------------------------------- #
# MCP 工具
# --------------------------------------------------------------------------- #

@mcp.tool()
def pg_database_overview() -> str:
    """
    返回当前 PostgreSQL 数据库概览：库名、版本、用户，以及每个非系统 schema 下的
    表 / 视图 / 物化视图 / 分区表 / 外部表数量。

    Agent 第一次接触陌生数据库时，应优先调用此工具。
    """
    try:
        with _readonly_cursor() as cur:
            cur.execute(
                "SELECT current_database() AS database, "
                "version() AS version, "
                "current_user AS user"
            )
            head = cur.fetchone() or {}
            cur.execute(
                """
                SELECT
                    n.nspname AS schema,
                    COUNT(*) FILTER (WHERE c.relkind = 'r') AS tables,
                    COUNT(*) FILTER (WHERE c.relkind = 'p') AS partitioned_tables,
                    COUNT(*) FILTER (WHERE c.relkind = 'v') AS views,
                    COUNT(*) FILTER (WHERE c.relkind = 'm') AS matviews,
                    COUNT(*) FILTER (WHERE c.relkind = 'f') AS foreign_tables
                FROM pg_namespace n
                LEFT JOIN pg_class c
                       ON c.relnamespace = n.oid
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%%'
                  AND n.nspname NOT LIKE 'pg_temp%%'
                GROUP BY n.nspname
                ORDER BY n.nspname
                """
            )
            schemas = list(cur.fetchall())
        return _respond({"ok": True, **head, "schemas": schemas})
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}"})


@mcp.tool()
def pg_list_schemas() -> str:
    """列出当前数据库下的所有用户 schema（含 owner、comment）。"""
    try:
        with _readonly_cursor() as cur:
            cur.execute(
                """
                SELECT n.nspname AS schema,
                       pg_get_userbyid(n.nspowner) AS owner,
                       obj_description(n.oid, 'pg_namespace') AS comment
                FROM pg_namespace n
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%%'
                  AND n.nspname NOT LIKE 'pg_temp%%'
                ORDER BY n.nspname
                """
            )
            schemas = list(cur.fetchall())
        return _respond({"ok": True, "schemas": schemas, "count": len(schemas)})
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}", "schemas": []})


@mcp.tool()
def pg_list_tables(schema: str = "public", include_views: bool = True) -> str:
    """
    列出指定 schema 下的对象。``include_views=True`` 时同时返回视图、物化视图、外部表。

    返回字段：name / kind / size / estimated_rows / comment。
    其中 ``estimated_rows`` 来自 ``pg_class.reltuples``（统计信息，可能为 -1 表示从未 ANALYZE）。
    """
    sch = (schema or "public").strip() or "public"
    kinds = ("r", "p", "v", "m", "f") if include_views else ("r", "p")
    try:
        with _readonly_cursor() as cur:
            cur.execute(
                """
                SELECT c.relname AS name,
                       CASE c.relkind
                            WHEN 'r' THEN 'table'
                            WHEN 'p' THEN 'partitioned_table'
                            WHEN 'v' THEN 'view'
                            WHEN 'm' THEN 'matview'
                            WHEN 'f' THEN 'foreign_table'
                       END AS kind,
                       pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
                       c.reltuples::bigint AS estimated_rows,
                       obj_description(c.oid, 'pg_class') AS comment
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relkind = ANY(%s)
                ORDER BY c.relname
                """,
                (sch, list(kinds)),
            )
            tables = list(cur.fetchall())
        return _respond(
            {
                "ok": True,
                "schema": sch,
                "tables": tables,
                "count": len(tables),
            }
        )
    except Exception as e:
        return _respond(
            {
                "ok": False,
                "error": f"{type(e).__name__}: {e}",
                "schema": sch,
                "tables": [],
            }
        )


@mcp.tool()
def pg_get_table_info(table_name: str, schema: str = "") -> str:
    """
    查看表（或视图、物化视图、外部表）的完整结构。

    ``table_name`` 可写为 ``TABLE`` 或 ``SCHEMA.TABLE``；只写 ``TABLE`` 时使用 ``schema`` 参数（默认 public）。

    返回：列、主键、外键、唯一约束、检查约束、索引、表/列注释、估算行数、占用大小。
    """
    try:
        owner, tnm = _split_qualified(table_name, schema)
        with _readonly_cursor() as cur:
            cur.execute(
                """
                SELECT c.oid, c.relkind,
                       pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
                       c.reltuples::bigint AS estimated_rows,
                       obj_description(c.oid, 'pg_class') AS comment
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relname = %s
                  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                """,
                (owner, tnm),
            )
            tbl = cur.fetchone()
            if tbl is None:
                return _respond(
                    {
                        "ok": False,
                        "error": f"表 / 视图不存在或无权限: {owner}.{tnm}",
                        "hint": "调用 pg_list_tables(schema=...) 先确认 schema 与对象名",
                    }
                )
            oid = tbl["oid"]
            kind_map = {
                "r": "table",
                "p": "partitioned_table",
                "v": "view",
                "m": "matview",
                "f": "foreign_table",
            }
            kind = kind_map.get(tbl["relkind"], tbl["relkind"])

            cur.execute(
                """
                SELECT a.attname AS name,
                       pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
                       NOT a.attnotnull AS nullable,
                       pg_get_expr(d.adbin, d.adrelid) AS "default",
                       a.attnum AS position,
                       col_description(a.attrelid, a.attnum) AS comment,
                       a.attidentity AS identity,
                       a.attgenerated AS generated
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d
                       ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = %s
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                ORDER BY a.attnum
                """,
                (oid,),
            )
            columns = list(cur.fetchall())

            cur.execute(
                """
                SELECT con.conname AS name,
                       con.contype AS contype,
                       pg_get_constraintdef(con.oid, true) AS definition,
                       (SELECT array_agg(att.attname ORDER BY u.ord)
                          FROM unnest(con.conkey) WITH ORDINALITY u(attnum, ord)
                          JOIN pg_attribute att
                            ON att.attrelid = con.conrelid AND att.attnum = u.attnum
                       ) AS columns,
                       CASE WHEN con.contype = 'f' THEN
                            (SELECT n2.nspname || '.' || c2.relname
                               FROM pg_class c2
                               JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
                              WHERE c2.oid = con.confrelid)
                       END AS references_table,
                       CASE WHEN con.contype = 'f' THEN
                            (SELECT array_agg(att.attname ORDER BY u.ord)
                               FROM unnest(con.confkey) WITH ORDINALITY u(attnum, ord)
                               JOIN pg_attribute att
                                 ON att.attrelid = con.confrelid AND att.attnum = u.attnum)
                       END AS references_columns
                FROM pg_constraint con
                WHERE con.conrelid = %s
                ORDER BY con.contype, con.conname
                """,
                (oid,),
            )
            primary_key: Optional[dict[str, Any]] = None
            foreign_keys: list[dict[str, Any]] = []
            unique_keys: list[dict[str, Any]] = []
            checks: list[dict[str, Any]] = []
            for c in cur.fetchall():
                t = c["contype"]
                if t == "p":
                    primary_key = {"name": c["name"], "columns": c["columns"]}
                elif t == "f":
                    foreign_keys.append(
                        {
                            "name": c["name"],
                            "columns": c["columns"],
                            "references_table": c["references_table"],
                            "references_columns": c["references_columns"],
                            "definition": c["definition"],
                        }
                    )
                elif t == "u":
                    unique_keys.append({"name": c["name"], "columns": c["columns"]})
                elif t == "c":
                    checks.append({"name": c["name"], "definition": c["definition"]})

            cur.execute(
                """
                SELECT i.relname AS name,
                       ix.indisunique AS is_unique,
                       ix.indisprimary AS is_primary,
                       pg_get_indexdef(ix.indexrelid) AS definition
                FROM pg_index ix
                JOIN pg_class i ON i.oid = ix.indexrelid
                WHERE ix.indrelid = %s
                ORDER BY i.relname
                """,
                (oid,),
            )
            indexes = list(cur.fetchall())

        return _respond(
            {
                "ok": True,
                "schema": owner,
                "table": tnm,
                "kind": kind,
                "comment": tbl["comment"],
                "size": tbl["size"],
                "estimated_rows": tbl["estimated_rows"],
                "columns": columns,
                "primary_key": primary_key,
                "foreign_keys": foreign_keys,
                "unique_keys": unique_keys,
                "checks": checks,
                "indexes": indexes,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}"})


@mcp.tool()
def pg_list_relations(schema: str = "public") -> str:
    """
    列出 schema 内所有外键关系：``src_table.cols  ->  ref_table.cols``。

    用于 Agent 一次性看清楚整张库的实体关系图（ER）。
    """
    sch = (schema or "public").strip() or "public"
    try:
        with _readonly_cursor() as cur:
            cur.execute(
                """
                SELECT
                    n.nspname  AS src_schema,
                    c.relname  AS src_table,
                    (SELECT array_agg(att.attname ORDER BY u.ord)
                       FROM unnest(con.conkey) WITH ORDINALITY u(attnum, ord)
                       JOIN pg_attribute att
                         ON att.attrelid = con.conrelid AND att.attnum = u.attnum
                    ) AS src_columns,
                    nf.nspname AS ref_schema,
                    cf.relname AS ref_table,
                    (SELECT array_agg(att.attname ORDER BY u.ord)
                       FROM unnest(con.confkey) WITH ORDINALITY u(attnum, ord)
                       JOIN pg_attribute att
                         ON att.attrelid = con.confrelid AND att.attnum = u.attnum
                    ) AS ref_columns,
                    con.conname AS constraint_name,
                    pg_get_constraintdef(con.oid, true) AS definition
                FROM pg_constraint con
                JOIN pg_class c ON c.oid = con.conrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_class cf ON cf.oid = con.confrelid
                JOIN pg_namespace nf ON nf.oid = cf.relnamespace
                WHERE con.contype = 'f' AND n.nspname = %s
                ORDER BY c.relname, con.conname
                """,
                (sch,),
            )
            rels = list(cur.fetchall())
        return _respond(
            {"ok": True, "schema": sch, "relations": rels, "count": len(rels)}
        )
    except Exception as e:
        return _respond(
            {"ok": False, "error": f"{type(e).__name__}: {e}", "relations": []}
        )


@mcp.tool()
def pg_search_objects(keyword: str, schema: str = "") -> str:
    """
    按关键字（不区分大小写）搜索表/视图与列：匹配名称或注释。``schema`` 留空则搜索全部用户 schema。
    """
    kw = (keyword or "").strip()
    if not kw:
        return _respond({"ok": False, "error": "keyword 不能为空"})
    like = f"%{kw}%"
    sch = (schema or "").strip()

    table_params: list[Any] = [like, like]
    column_params: list[Any] = [like, like]
    table_filter = ""
    column_filter = ""
    if sch:
        table_filter = "AND n.nspname = %s"
        column_filter = "AND n.nspname = %s"
        table_params.append(sch)
        column_params.append(sch)

    try:
        with _readonly_cursor() as cur:
            cur.execute(
                f"""
                SELECT n.nspname AS schema,
                       c.relname AS name,
                       CASE c.relkind
                            WHEN 'r' THEN 'table'
                            WHEN 'p' THEN 'partitioned_table'
                            WHEN 'v' THEN 'view'
                            WHEN 'm' THEN 'matview'
                            WHEN 'f' THEN 'foreign_table'
                       END AS kind,
                       obj_description(c.oid, 'pg_class') AS comment
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_%%'
                  AND (c.relname ILIKE %s
                       OR obj_description(c.oid, 'pg_class') ILIKE %s)
                  {table_filter}
                ORDER BY n.nspname, c.relname
                LIMIT 100
                """,
                table_params,
            )
            tables = list(cur.fetchall())

            cur.execute(
                f"""
                SELECT n.nspname AS schema,
                       c.relname AS "table",
                       a.attname AS "column",
                       pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
                       col_description(a.attrelid, a.attnum) AS comment
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE a.attnum > 0
                  AND NOT a.attisdropped
                  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_%%'
                  AND (a.attname ILIKE %s
                       OR col_description(a.attrelid, a.attnum) ILIKE %s)
                  {column_filter}
                ORDER BY n.nspname, c.relname, a.attnum
                LIMIT 200
                """,
                column_params,
            )
            columns = list(cur.fetchall())

        return _respond(
            {
                "ok": True,
                "keyword": kw,
                "schema_filter": sch or None,
                "tables": tables,
                "columns": columns,
                "table_count": len(tables),
                "column_count": len(columns),
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}"})


@mcp.tool()
def pg_sample_table(table_name: str, schema: str = "", limit: int = 5) -> str:
    """
    对指定表抽样前 N 行（默认 5，上限 ``PG_MAX_ROWS``）。

    ``table_name`` 可为 ``TABLE`` 或 ``SCHEMA.TABLE``。

    标识符使用安全转义，杜绝注入。
    """
    try:
        owner, tnm = _split_qualified(table_name, schema)
        n = max(1, min(int(limit or 5), DEFAULT_MAX_ROWS))
        stmt = psql.SQL("SELECT * FROM {}.{} LIMIT {}").format(
            psql.Identifier(owner),
            psql.Identifier(tnm),
            psql.Literal(n),
        )
        with _readonly_cursor() as cur:
            cur.execute(stmt)
            cols = [d.name for d in cur.description] if cur.description else []
            rows = list(cur.fetchall())
        return _respond(
            {
                "ok": True,
                "schema": owner,
                "table": tnm,
                "columns": cols,
                "row_count": len(rows),
                "data": rows,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}"})


@mcp.tool()
def pg_query(sql: str, max_rows: Optional[int] = None) -> str:
    """
    执行只读 SELECT 查询，返回 JSON 行集。

    约束：
    - SQL 必须以 SELECT / WITH / TABLE / VALUES / SHOW / EXPLAIN 开头；
    - 不允许出现 INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE / GRANT / COPY / DO / CALL 等关键字；
    - 不允许内部分号（多语句）；
    - 数据库层面同样运行在 ``READ ONLY`` 事务中，越权写入会被 PostgreSQL 拒绝；
    - ``max_rows`` 默认 ``PG_MAX_ROWS``（环境变量，缺省 200）；返回字段 ``truncated`` 提示是否被截断。
    """
    return _respond(_run_select(sql, max_rows))


@mcp.tool()
def pg_explain(sql: str, analyze: bool = False) -> str:
    """
    返回 ``EXPLAIN [ANALYZE] (FORMAT JSON)`` 计划。
    ``analyze=True`` 会真正执行查询（仍在 READ ONLY 事务中），可用于评估索引/统计信息。
    """
    inner = _strip_trailing_semicolon(sql or "")
    ok, err = is_safe_select(inner)
    if not ok:
        return _respond({"ok": False, "error": err})
    prefix = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " if analyze else "EXPLAIN (FORMAT JSON) "
    try:
        with _readonly_cursor() as cur:
            cur.execute(prefix + inner)
            row = cur.fetchone()
            plan = None
            if row:
                first = next(iter(row.values()))
                plan = first[0] if isinstance(first, list) and first else first
        return _respond({"ok": True, "analyze": analyze, "plan": plan})
    except Exception as e:
        return _respond({"ok": False, "error": f"{type(e).__name__}: {e}"})


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #

def main() -> None:
    try:
        print("正在启动 PostgreSQL 只读 MCP 服务器...", file=sys.stderr)
        mcp.run(transport="stdio")
    except Exception as e:
        print(f"服务器启动失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
