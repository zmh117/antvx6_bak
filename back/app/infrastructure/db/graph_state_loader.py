"""从 Postgres 加载图结构化状态（供 diff / merge 使用）。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.domain.er.models import GraphState


def load_graph_state(cur: psycopg.Cursor, graph_id: UUID) -> GraphState:
    cur.execute(
        """
        SELECT table_key, table_name, business_name, description, business_domain,
               table_type, importance, tags, comment, x, y, width, height, raw_data
        FROM er_table WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    tables = {r["table_key"]: dict(r) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT table_key, column_key, column_name, data_type, business_name, description,
               comment, default_value, nullable, is_primary_key, is_unique, is_indexed,
               key_type, column_role, enum_enabled, sort_order, tags, raw_data
        FROM er_column WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    columns = {
        f"{r['table_key']}::{r['column_key']}": dict(r) for r in cur.fetchall()
    }

    cur.execute(
        """
        SELECT table_key, column_key, value, label, description, sort_order, enabled, raw_data
        FROM er_column_enum_value WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    enums = {
        f"{r['table_key']}::{r['column_key']}::{r['value']}": dict(r)
        for r in cur.fetchall()
    }

    cur.execute(
        """
        SELECT relation_key, source_table_key, source_column_key, target_table_key,
               target_column_key, relation_type, match_operator, relationship, cardinality, relation_name,
               description, join_condition, direction, confidence, source, verified, tags, raw_edge
        FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    relations = {r["relation_key"]: dict(r) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT path_key, name, intent, description, business_domain, tags, table_keys,
               relation_keys, path_json, confidence
        FROM er_business_path WHERE graph_id = %s AND deleted_at IS NULL
        """,
        (graph_id,),
    )
    business_paths = {r["path_key"]: dict(r) for r in cur.fetchall()}

    cur.execute(
        "SELECT x6_json, business_json FROM er_graph_snapshot WHERE graph_id = %s",
        (graph_id,),
    )
    snap = cur.fetchone()
    x6_json = snap["x6_json"] if snap else {"nodes": [], "edges": []}
    business_json = snap["business_json"] if snap and snap["business_json"] else []

    return GraphState(
        tables=tables,
        columns=columns,
        enums=enums,
        relations=relations,
        business_paths=business_paths,
        x6_json=x6_json,
        business_json=business_json,
    )


def graph_state_to_dict(state: GraphState) -> dict[str, Any]:
    """兼容旧代码期望的 dict 结构。"""
    return {
        "tables": state.tables,
        "columns": state.columns,
        "enums": state.enums,
        "relations": state.relations,
        "business_paths": state.business_paths,
        "x6_json": state.x6_json,
        "business_json": state.business_json,
    }
