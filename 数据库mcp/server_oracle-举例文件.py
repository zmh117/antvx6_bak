from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

# Cursor / IDE 启动 MCP 时 cwd 往往不是项目根，必须按脚本位置加载 .env
_PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(_PROJECT_ROOT / ".env")

import json
import logging
import sys
from datetime import datetime
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from mes.config import PlantCode, Target, default_schema_for, get_settings
from mes.oracle_conn import get_connection, get_default_connection
from mes.plant_rules import (
    normalize_plant,
    redis_key_namespace_hint,
    table_prefix,
    validate_workshop,
)
from mes.result_json import rows_to_dicts
from mes.sql_safety import is_safe_select, strip_trailing_semicolon

logging.basicConfig(level=logging.WARNING)

mcp = FastMCP("my_db_bot")


def _respond(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _parse_target(s: str) -> Target:
    t = s.strip().lower()
    if t not in ("cloud", "edge"):
        raise ValueError("target 必须是 cloud 或 edge")
    return t  # type: ignore[return-value]


def _mes_redis_client(plant: str, redis_plane: str):
    """
    统一创建 RedisCluster（mes.redis_client / redis-py 5+）。
    避免各工具重复 import 与参数解析不一致。
    """
    from mes.redis_client import get_redis_cluster

    p = normalize_plant(plant)  # type: ignore[arg-type]
    plane = _parse_target(redis_plane)
    rc = get_redis_cluster(p, plane)  # type: ignore[arg-type]
    return rc, p, plane


def _run_oracle(
    plant_code: PlantCode,
    target: Target,
    workshop: str,
    sql: str,
    max_rows: int | None,
) -> dict[str, Any]:
    settings = get_settings()
    limit = max_rows if max_rows is not None else settings.query_max_rows
    sql_clean = strip_trailing_semicolon(sql)
    ok, err = is_safe_select(sql_clean, settings.sql_max_length)
    if not ok:
        return {
            "ok": False,
            "error": err,
            "plant": plant_code,
            "workshop": workshop,
            "target": target,
            "row_count": 0,
            "truncated": False,
            "data": [],
        }

    conn = get_connection(plant_code, target)
    cur = conn.cursor()
    try:
        cur.execute(sql_clean)
        if cur.description is None:
            return {
                "ok": False,
                "error": "无法获取结果列信息",
                "plant": plant_code,
                "workshop": workshop,
                "target": target,
                "row_count": 0,
                "truncated": False,
                "data": [],
            }
        cols = [d[0] for d in cur.description]
        rows: list[Any] = []
        while len(rows) < limit + 1:
            batch = cur.fetchmany(limit + 1 - len(rows))
            if not batch:
                break
            rows.extend(batch)
        truncated = len(rows) > limit
        rows = rows[:limit]
        data = rows_to_dicts(cols, rows)
        return {
            "ok": True,
            "plant": plant_code,
            "workshop": workshop,
            "target": target,
            "default_schema": default_schema_for(plant_code, target),
            "table_prefix": table_prefix(plant_code, workshop),
            "row_count": len(data),
            "truncated": truncated,
            "data": data,
            "error": None,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "plant": plant_code,
            "workshop": workshop,
            "target": target,
            "row_count": 0,
            "truncated": False,
            "data": [],
        }
    finally:
        cur.close()
        conn.close()


# --- MCP 工具：MES 路由 ---


@mcp.tool()
def mes_schema_hint(plant: str, workshop: str, target: str) -> str:
    """
    返回当前厂区/车间在 Oracle 的默认 schema、表名前缀、Redis key 命名示例。
    target: cloud（云端库）或 edge（边端库）；Redis 平面另用 redis_plane。
    """
    try:
        p = normalize_plant(plant)  # type: ignore[assignment]
        ws = validate_workshop(p, workshop)
        t = _parse_target(target)
        pc: PlantCode = p  # type: ignore[assignment]
        return _respond(
            {
                "ok": True,
                "plant": p,
                "workshop": ws,
                "target": t,
                "default_oracle_schema": default_schema_for(pc, t),
                "table_prefix": table_prefix(p, ws),
                "example_table": f"{default_schema_for(pc, t)}.{table_prefix(p, ws)}_EBR_ALARM_MAN",
                "redis_key_example_edge": redis_key_namespace_hint(p, ws),
                "redis_plane_note": "云端缓存用 redis_plane=cloud；厂区边端 Redis 用 redis_plane=edge",
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": str(e)})


@mcp.tool()
def mes_oracle_query(
    plant: str,
    workshop: str,
    target: str,
    sql: str,
    max_rows: Optional[int] = None,
) -> str:
    """
    在指定厂区/车间上下文下执行只读 Oracle 查询（仅 SELECT）。
    target: cloud 或 edge。请在 sql 中使用完整 schema.table 或同实例内多 schema JOIN。
    """
    try:
        p = normalize_plant(plant)
        ws = validate_workshop(p, workshop)
        t = _parse_target(target)
        out = _run_oracle(p, t, ws, sql, max_rows)  # type: ignore[arg-type]
        return _respond(out)
    except Exception as e:
        return _respond(
            {
                "ok": False,
                "error": str(e),
                "row_count": 0,
                "truncated": False,
                "data": [],
            }
        )


@mcp.tool()
def mes_list_tables(plant: str, workshop: str, target: str, schema: str = "") -> str:
    """列出指定 schema 下的表名；schema 为空时使用该厂区在 cloud/edge 的默认 schema。"""
    try:
        p = normalize_plant(plant)
        ws = validate_workshop(p, workshop)
        t = _parse_target(target)
        pc: PlantCode = p  # type: ignore[assignment]
        owner = schema.strip() or default_schema_for(pc, t)
        conn = get_connection(pc, t)
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT table_name FROM all_tables WHERE owner = :1 ORDER BY table_name",
                [owner],
            )
            names = [r[0] for r in cur.fetchall()]
            return _respond(
                {
                    "ok": True,
                    "plant": p,
                    "workshop": ws,
                    "target": t,
                    "schema": owner,
                    "tables": names,
                    "count": len(names),
                }
            )
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        return _respond({"ok": False, "error": str(e), "tables": []})


@mcp.tool()
def mes_get_table_info(plant: str, workshop: str, target: str, table_name: str, schema: str = "") -> str:
    """
    在指定厂区 Oracle（cloud/edge）下查看表结构。table_name 可为 TABLE 或 OWNER.TABLE；
    仅 TABLE 时 owner 取 schema 参数，schema 为空则用该厂区默认 schema。
    """
    try:
        p = normalize_plant(plant)
        ws = validate_workshop(p, workshop)
        t = _parse_target(target)
        pc: PlantCode = p  # type: ignore[assignment]
        conn = get_connection(pc, t)
        cur = conn.cursor()
        if "." in table_name:
            owner, tnm = table_name.split(".", 1)
            owner, tnm = owner.strip(), tnm.strip()
        else:
            owner = schema.strip() or default_schema_for(pc, t)
            tnm = table_name.strip()
        try:
            cur.execute(
                """
                SELECT 1 FROM all_tables
                WHERE owner = :1 AND UPPER(table_name) = UPPER(:2)
                """,
                (owner, tnm),
            )
            if cur.fetchone() is None:
                return _respond(
                    {
                        "ok": False,
                        "error": f"表不存在或无权限: {owner}.{tnm}",
                        "plant": p,
                        "workshop": ws,
                        "target": t,
                    }
                )
            cur.execute(
                """
                SELECT atc.column_name, atc.data_type, atc.data_length,
                       atc.data_precision, atc.data_scale, atc.nullable,
                       (SELECT COUNT(*) FROM all_cons_columns ucc
                        JOIN all_constraints uc
                          ON ucc.constraint_name = uc.constraint_name AND ucc.owner = uc.owner
                        WHERE ucc.table_name = atc.table_name
                          AND ucc.column_name = atc.column_name
                          AND uc.table_name = atc.table_name AND uc.owner = atc.owner
                          AND uc.constraint_type = 'P') AS is_pk,
                       acc.comments
                FROM all_tab_columns atc
                LEFT JOIN all_col_comments acc
                  ON atc.owner = acc.owner AND atc.table_name = acc.table_name
                 AND atc.column_name = acc.column_name
                WHERE atc.owner = :1 AND UPPER(atc.table_name) = UPPER(:2)
                ORDER BY atc.column_id
                """,
                (owner, tnm),
            )
            cols = cur.fetchall()
            lines = [
                f"表名: {owner}.{tnm}",
                f"厂区: {p} 车间: {ws} target: {t}",
                "-" * 80,
                f"{'列名':<22} {'类型':<28} {'可空':<6} {'主键':<6} {'注释'}",
                "-" * 80,
            ]
            for c in cols:
                cn, dt, dl, dp, ds, nul, pk, comm = c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]
                if dt in ("VARCHAR2", "CHAR", "NVARCHAR2", "NCHAR"):
                    dtd = f"{dt}({dl})"
                elif dt in ("NUMBER", "NUMERIC") and dp is not None and ds is not None:
                    dtd = f"{dt}({dp},{ds})"
                elif dt in ("NUMBER", "NUMERIC") and dp is not None:
                    dtd = f"{dt}({dp})"
                else:
                    dtd = str(dt)
                # 与 get_table_info 一致：可空列 Y=允许空 显示「否」表示非 NOT NULL 约束语义沿用原工具
                nullable_disp = "否" if nul == "Y" else "是"
                pk_disp = "是" if pk > 0 else "否"
                lines.append(
                    f"{cn:<22} {dtd:<28} {nullable_disp:<6} {pk_disp:<6} {comm or '无'}"
                )
            return _respond(
                {
                    "ok": True,
                    "plant": p,
                    "workshop": ws,
                    "target": t,
                    "owner": owner,
                    "table": tnm,
                    "detail": "\n".join(lines),
                }
            )
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        return _respond({"ok": False, "error": str(e)})


@mcp.tool()
def mes_redis_get(plant: str, redis_plane: str, key: str) -> str:
    """Redis STRING GET。redis_plane: cloud 或 edge。"""
    try:
        rc, p, plane = _mes_redis_client(plant, redis_plane)
        v = rc.get(key)
        return _respond(
            {
                "ok": True,
                "plant": p,
                "redis_plane": plane,
                "key": key,
                "value": v,
                "truncated": False,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": str(e), "key": key, "value": None})


@mcp.tool()
def mes_redis_hgetall(plant: str, redis_plane: str, key: str) -> str:
    """Redis HASH HGETALL。"""
    try:
        rc, p, plane = _mes_redis_client(plant, redis_plane)
        h = rc.hgetall(key)
        return _respond(
            {
                "ok": True,
                "plant": p,
                "redis_plane": plane,
                "key": key,
                "value": h,
                "field_count": len(h) if h else 0,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": str(e), "key": key, "value": None})


@mcp.tool()
def mes_redis_scan(
    plant: str,
    redis_plane: str,
    match_pattern: str,
    count_hint: int = 100,
    max_keys: int = 200,
) -> str:
    """
    使用 SCAN 按模式列举 key（禁止 KEYS）。match_pattern 支持 glob，如 cr999.crmes.*。
    """
    try:
        rc, p, plane = _mes_redis_client(plant, redis_plane)
        settings = get_settings()
        cap = min(max(1, max_keys), max(1, settings.query_max_rows))
        keys: list[str] = []
        truncated = False
        # RedisCluster.scan 返回的游标为 dict，不能手写循环；用 scan_iter 兼容单机与集群
        for k in rc.scan_iter(
            match=match_pattern, count=max(10, count_hint)
        ):
            keys.append(k)
            if len(keys) >= cap:
                truncated = True
                break
        return _respond(
            {
                "ok": True,
                "plant": p,
                "redis_plane": plane,
                "match": match_pattern,
                "keys": keys,
                "key_count": len(keys),
                "truncated": truncated,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": str(e), "keys": []})


@mcp.tool()
def mes_context_query(
    plant: str,
    workshop: str,
    oracle_target: str,
    sql: str,
    redis_plane: str,
    redis_op: str = "none",
    redis_key: str = "",
    redis_match: str = "",
    max_rows: Optional[int] = None,
    scan_max_keys: int = 100,
) -> str:
    """
    组合：Oracle 只读查询 + 可选 Redis 只读操作。
    redis_op: none | get | hgetall | scan。scan 时使用 redis_match；get/hgetall 使用 redis_key。
    """
    try:
        p = normalize_plant(plant)
        ws = validate_workshop(p, workshop)
        ot = _parse_target(oracle_target)
        oracle_part = _run_oracle(p, ot, ws, sql, max_rows)  # type: ignore[arg-type]

        rp = _parse_target(redis_plane)
        redis_part: dict[str, Any] = {"skipped": True}
        op = redis_op.strip().lower()

        if op == "none":
            redis_part = {"skipped": True, "reason": "redis_op=none"}
        elif op == "get":
            if not redis_key:
                redis_part = {"ok": False, "error": "redis_key 必填"}
            else:
                rc, _, _ = _mes_redis_client(plant, redis_plane)
                redis_part = {
                    "ok": True,
                    "op": "get",
                    "key": redis_key,
                    "value": rc.get(redis_key),
                }
        elif op == "hgetall":
            if not redis_key:
                redis_part = {"ok": False, "error": "redis_key 必填"}
            else:
                rc, _, _ = _mes_redis_client(plant, redis_plane)
                h = rc.hgetall(redis_key)
                redis_part = {
                    "ok": True,
                    "op": "hgetall",
                    "key": redis_key,
                    "value": h,
                    "field_count": len(h) if h else 0,
                }
        elif op == "scan":
            if not redis_match:
                redis_part = {"ok": False, "error": "redis_match 必填"}
            else:
                rc, _, _ = _mes_redis_client(plant, redis_plane)
                keys: list[str] = []
                cap = min(max(1, scan_max_keys), get_settings().query_max_rows)
                truncated = False
                for k in rc.scan_iter(match=redis_match, count=100):
                    keys.append(k)
                    if len(keys) >= cap:
                        truncated = True
                        break
                redis_part = {
                    "ok": True,
                    "op": "scan",
                    "match": redis_match,
                    "keys": keys,
                    "key_count": len(keys),
                    "truncated": truncated,
                }
        else:
            redis_part = {"ok": False, "error": f"未知 redis_op: {redis_op}"}

        return _respond(
            {
                "ok": bool(oracle_part.get("ok")),
                "plant": p,
                "workshop": ws,
                "oracle_target": ot,
                "redis_plane": rp,
                "oracle": oracle_part,
                "redis": redis_part,
            }
        )
    except Exception as e:
        return _respond({"ok": False, "error": str(e)})


# --- 兼容旧工具（使用 MES_DEFAULT_* 与 ORACLE_* 环境变量）---


@mcp.tool()
def list_tables() -> str:
    """列出当前默认连接用户下的表（user_tables）。默认连接由 MES_DEFAULT_PLANT / MES_DEFAULT_TARGET 决定。"""
    conn = get_default_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT table_name FROM user_tables ORDER BY table_name")
        tables = [r[0] for r in cur.fetchall()]
        return f"数据库中的表: {tables}"
    except Exception as e:
        return f"错误: {str(e)}"
    finally:
        cur.close()
        conn.close()


@mcp.tool()
def query_data(sql_query: str) -> str:
    """在默认厂区/车间（环境变量 MES_DEFAULT_*）下执行 SELECT。返回 JSON。"""
    s = get_settings()
    try:
        p = normalize_plant(s.default_plant)
        ws = validate_workshop(p, s.default_workshop)
        t = _parse_target(s.default_target)
    except Exception as e:
        return f"错误: {e}"
    out = _run_oracle(p, t, ws, sql_query, None)  # type: ignore[arg-type]
    if not out["ok"]:
        return f"查询错误: {out.get('error')}"
    if not out["data"]:
        return "查询结果为空"
    return json.dumps(out["data"], ensure_ascii=False, indent=2)


@mcp.tool()
def get_table_info(table_name: str) -> str:
    """获取表结构（默认连接）。表名可不带 schema，将在可见 schema 中解析。"""
    conn = get_default_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT owner, table_name
            FROM all_tables
            WHERE UPPER(table_name) = UPPER(:1)
            ORDER BY CASE WHEN owner = USER THEN 0 ELSE 1 END, owner
            """,
            (table_name,),
        )
        table_exists = cursor.fetchone()
        if not table_exists:
            return f"表 {table_name} 不存在或没有访问权限"

        owner = table_exists[0]
        table_name_db = table_exists[1]

        cursor.execute(
            """
            SELECT
                atc.column_name,
                atc.data_type,
                atc.data_length,
                atc.data_precision,
                atc.data_scale,
                atc.nullable,
                (SELECT COUNT(*)
                 FROM all_cons_columns ucc
                 JOIN all_constraints uc ON ucc.constraint_name = uc.constraint_name
                                       AND ucc.owner = uc.owner
                 WHERE ucc.table_name = atc.table_name
                   AND ucc.column_name = atc.column_name
                   AND uc.table_name = atc.table_name
                   AND uc.owner = atc.owner
                   AND uc.constraint_type = 'P') as is_primary_key,
                acc.comments as column_comment
            FROM all_tab_columns atc
            LEFT JOIN all_col_comments acc
                ON atc.owner = acc.owner
                AND atc.table_name = acc.table_name
                AND atc.column_name = acc.column_name
            WHERE UPPER(atc.table_name) = UPPER(:1)
              AND atc.owner = :2
            ORDER BY atc.column_id
            """,
            (table_name, owner),
        )
        columns = cursor.fetchall()
        if not columns:
            return f"表 {table_name} 没有列信息"

        cursor.execute(
            """
            SELECT comments
            FROM all_tab_comments
            WHERE UPPER(table_name) = UPPER(:1)
              AND owner = :2
            """,
            (table_name, owner),
        )
        table_comment_result = cursor.fetchone()
        table_comment = table_comment_result[0] if table_comment_result else "无注释"

        result_lines = [
            f"表名: {owner}.{table_name_db}",
            f"表注释: {table_comment}",
            "-" * 80,
            f"{'列名':<20} {'数据类型':<25} {'可空':<6} {'主键':<6} {'注释'}",
            "-" * 80,
        ]

        for col in columns:
            col_name = col[0]
            data_type = col[1]
            data_length = col[2]
            data_precision = col[3]
            data_scale = col[4]
            if data_type in ("VARCHAR2", "CHAR", "NVARCHAR2", "NCHAR"):
                data_type_display = f"{data_type}({data_length})"
            elif data_type in ("NUMBER", "NUMERIC"):
                if data_precision is not None and data_scale is not None:
                    data_type_display = f"{data_type}({data_precision},{data_scale})"
                elif data_precision is not None:
                    data_type_display = f"{data_type}({data_precision})"
                else:
                    data_type_display = data_type
            else:
                data_type_display = data_type
            nullable = col[5]
            not_null = "否" if nullable == "Y" else "是"
            is_primary_key = "是" if col[6] > 0 else "否"
            column_comment = col[7] if col[7] else "无注释"
            result_lines.append(
                f"{col_name:<20} {data_type_display:<25} {not_null:<6} {is_primary_key:<6} {column_comment}"
            )

        cursor.execute(
            """
            SELECT
                ui.index_name,
                uic.column_name,
                ui.uniqueness,
                ui.index_type
            FROM all_indexes ui
            JOIN all_ind_columns uic ON ui.index_name = uic.index_name
                                     AND ui.table_owner = uic.table_owner
                                     AND ui.table_name = uic.table_name
            WHERE UPPER(ui.table_name) = UPPER(:1)
              AND ui.table_owner = :2
              AND ui.index_type = 'NORMAL'
            ORDER BY ui.index_name, uic.column_position
            """,
            (table_name, owner),
        )
        indexes = cursor.fetchall()
        if indexes:
            result_lines.extend(["\n索引信息:", "-" * 80, f"{'索引名':<25} {'列名':<20} {'类型':<10} {'索引类型'}", "-" * 80])
            for idx in indexes:
                index_name, column_name, uniq, index_type = idx[0], idx[1], idx[2], idx[3]
                uniqueness = "唯一" if uniq == "UNIQUE" else "非唯一"
                result_lines.append(f"{index_name:<25} {column_name:<20} {uniqueness:<10} {index_type}")

        cursor.execute(
            """
            SELECT
                uc.constraint_name,
                uc.constraint_type,
                ucc.column_name,
                uc.search_condition,
                uc.r_constraint_name
            FROM all_constraints uc
            JOIN all_cons_columns ucc ON uc.constraint_name = ucc.constraint_name
                                      AND uc.owner = ucc.owner
            WHERE UPPER(uc.table_name) = UPPER(:1)
              AND uc.owner = :2
              AND uc.constraint_type IN ('C', 'R', 'U')
            ORDER BY uc.constraint_type, uc.constraint_name, ucc.position
            """,
            (table_name, owner),
        )
        constraints = cursor.fetchall()
        if constraints:
            result_lines.extend(["\n约束信息:", "-" * 80])
            constraint_type_map = {"P": "主键", "R": "外键", "U": "唯一约束", "C": "检查约束"}
            for con in constraints:
                constraint_name = con[0]
                constraint_type = constraint_type_map.get(con[1], con[1])
                column_name = con[2]
                check_condition = con[3] if con[3] else ""
                ref_constraint = con[4] if con[4] else ""
                if constraint_type == "外键":
                    constraint_info = f"{constraint_name} ({column_name}) -> {ref_constraint}"
                elif constraint_type == "检查约束":
                    constraint_info = f"{constraint_name} ({column_name}): {check_condition}"
                else:
                    constraint_info = f"{constraint_name} ({column_name})"
                result_lines.append(f"{constraint_type:<10} {constraint_info}")

        return "\n".join(result_lines)
    except Exception as e:
        return f"查询表结构时发生错误: {e}"
    finally:
        cursor.close()
        conn.close()


@mcp.tool()
def convert_timestamp(timestamp: int, format_str: Optional[str] = None) -> str:
    """将 Unix 时间戳（秒）转为可读字符串。极大值可表示无有效期（与原逻辑一致）。"""
    if format_str is None:
        format_str = "%Y-%m-%d %H:%M:%S"
    if timestamp >= 32503651200:
        return "没有有效期"
    dt = datetime.fromtimestamp(timestamp)
    return dt.strftime(format_str)


def main() -> None:
    try:
        print("正在启动 MCP 服务器...", file=sys.stderr)
        mcp.run(transport="stdio")
    except Exception as e:
        print(f"服务器启动失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()