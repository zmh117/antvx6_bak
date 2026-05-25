"""Load graph from PostgreSQL into API response."""

from __future__ import annotations

from uuid import UUID

import psycopg

from typing import Any

from app.schemas.graph import (
    CanvasSnapshotPayload,
    ColumnPayload,
    EnumValuePayload,
    GraphLoadResponse,
    GraphMetaResponse,
    RelationPayload,
    TablePayload,
    BusinessPathPayload,
)
from app.services.normalize import is_edge_cell, is_table_cell, is_valid_table_key


def _merge_legacy_tables(
    business_json: list[Any],
    table_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge ``business_json`` with ``er_table.raw_data`` so missing tables (e.g. profiles) return."""
    by_id: dict[str, dict[str, Any]] = {}

    if isinstance(business_json, list):
        for item in business_json:
            if not isinstance(item, dict):
                continue
            tid = str(item.get("id") or "")
            if tid and is_valid_table_key(tid) and isinstance(item.get("fields"), list):
                by_id[tid] = item

    for row in table_rows:
        tid = str(row.get("table_key") or "")
        if not is_valid_table_key(tid):
            continue
        raw = row.get("raw_data") or {}
        fields = raw.get("fields") if isinstance(raw, dict) else None
        if not isinstance(fields, list) or not fields:
            continue
        layout = raw.get("layout") if isinstance(raw, dict) else None
        if layout is None and row.get("x") is not None and row.get("y") is not None:
            layout = {"x": float(row["x"]), "y": float(row["y"])}
        merged = {
            "id": tid,
            "name": (raw.get("name") if isinstance(raw, dict) else None) or row.get("table_name") or tid,
            "fields": fields,
            "layout": layout,
        }
        prev = by_id.get(tid)
        if prev:
            if layout is not None:
                prev["layout"] = layout
            continue
        by_id[tid] = {**raw, **merged} if isinstance(raw, dict) else merged

    return list(by_id.values())


def _apply_columns_enums_to_legacy(
    legacy: list[dict[str, Any]],
    columns: list[ColumnPayload],
    enums: list[EnumValuePayload],
) -> list[dict[str, Any]]:
    """用 er_column / er_column_enum_value 回填 comment、enumValues（侧栏与刷新展示以库为准）。"""
    enum_by_col: dict[str, list[dict[str, Any]]] = {}
    for ev in enums:
        key = f"{ev.table_key}::{ev.column_key}"
        enum_by_col.setdefault(key, []).append(
            {
                "value": ev.value,
                "label": ev.label,
                "description": ev.description,
                "_sort": ev.sort_order,
            }
        )
    for items in enum_by_col.values():
        items.sort(key=lambda x: (x.get("_sort", 0), str(x.get("value", ""))))
        for item in items:
            item.pop("_sort", None)

    col_by_key = {f"{c.table_key}::{c.column_key}": c for c in columns}

    out: list[dict[str, Any]] = []
    for table in legacy:
        if not isinstance(table, dict):
            continue
        tid = str(table.get("id") or "")
        fields = table.get("fields")
        if not isinstance(fields, list):
            out.append(table)
            continue
        new_fields: list[dict[str, Any]] = []
        for field in fields:
            if not isinstance(field, dict):
                new_fields.append(field)
                continue
            name = str(field.get("name") or "")
            ck = f"{tid}::{name}"
            col = col_by_key.get(ck)
            merged_field = dict(field)
            if col is not None:
                if col.comment:
                    merged_field["comment"] = col.comment
                elif col.comment is None and "comment" in merged_field:
                    pass
                if col.data_type:
                    merged_field["type"] = col.data_type
                if col.default_value is not None:
                    merged_field["defaultValue"] = col.default_value
            col_enums = enum_by_col.get(ck)
            if col_enums:
                merged_field["enumValues"] = col_enums
            elif col is not None and not col.enum_enabled:
                merged_field.pop("enumValues", None)
            new_fields.append(merged_field)
        out.append({**table, "fields": new_fields})
    return out


def load_graph(conn: psycopg.Connection, graph_id: UUID) -> GraphLoadResponse:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, business_domain, version, status FROM er_graph WHERE id = %s",
            (graph_id,),
        )
        g = cur.fetchone()
        if not g:
            raise ValueError(f"graph not found: {graph_id}")

        cur.execute(
            "SELECT x6_json, business_json FROM er_graph_snapshot WHERE graph_id = %s",
            (graph_id,),
        )
        snap = cur.fetchone()
        x6 = snap["x6_json"] if snap else {"nodes": [], "edges": []}
        legacy = snap["business_json"] if snap and snap["business_json"] else []

        snap_nodes = [n for n in (x6.get("nodes") or []) if is_table_cell(n)]
        snap_edges = [e for e in (x6.get("edges") or []) if is_edge_cell(e)]
        snapshot = CanvasSnapshotPayload(nodes=snap_nodes, edges=snap_edges)

        cur.execute(
            """
            SELECT table_key, table_name, business_name, description, business_domain,
                   table_type, importance, tags, comment, x, y, width, height, raw_data
            FROM er_table WHERE graph_id = %s AND deleted_at IS NULL ORDER BY table_key
            """,
            (graph_id,),
        )
        table_rows = cur.fetchall()
        tables = [TablePayload(**{**dict(r), "raw_data": r["raw_data"] or {}}) for r in table_rows]
        cur.execute(
            """
            SELECT table_key, column_key, column_name, data_type, business_name, description,
                   comment, default_value, nullable, is_primary_key, is_unique, is_indexed,
                   key_type, column_role, enum_enabled, sort_order, tags, raw_data
            FROM er_column WHERE graph_id = %s AND deleted_at IS NULL
            ORDER BY table_key, sort_order
            """,
            (graph_id,),
        )
        columns = [ColumnPayload(**{**dict(r), "raw_data": r["raw_data"] or {}}) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT table_key, column_key, value, label, description, sort_order, enabled, raw_data
            FROM er_column_enum_value WHERE graph_id = %s AND deleted_at IS NULL
            ORDER BY table_key, column_key, sort_order
            """,
            (graph_id,),
        )
        enums = [EnumValuePayload(**{**dict(r), "raw_data": r["raw_data"] or {}}) for r in cur.fetchall()]

        legacy = _merge_legacy_tables(legacy, table_rows)
        legacy = _apply_columns_enums_to_legacy(legacy, columns, enums)

        cur.execute(
            """
            SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
                   relation_type, relationship, cardinality, relation_name, description, join_condition,
                   direction, confidence, source, verified, tags, raw_edge
            FROM er_relation WHERE graph_id = %s AND deleted_at IS NULL ORDER BY relation_key
            """,
            (graph_id,),
        )
        relations = [
            RelationPayload(
                **{
                    **dict(r),
                    "confidence": float(r["confidence"]),
                    "verified": bool(r["verified"]),
                    "raw_edge": r["raw_edge"] or {},
                }
            )
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT path_key, name, intent, description, business_domain, tags, table_keys,
                   relation_keys, path_json, confidence
            FROM er_business_path WHERE graph_id = %s AND deleted_at IS NULL
            """,
            (graph_id,),
        )
        paths = [
            BusinessPathPayload(
                **{**dict(r), "confidence": float(r["confidence"]), "path_json": r["path_json"] or {}}
            )
            for r in cur.fetchall()
        ]

    return GraphLoadResponse(
        graph=GraphMetaResponse(
            id=g["id"],
            name=g["name"],
            description=g["description"],
            business_domain=g["business_domain"],
            version=g["version"],
            status=g["status"],
        ),
        snapshot=snapshot,
        legacy_tables=legacy,
        tables=tables,
        columns=columns,
        enums=enums,
        relations=relations,
        business_paths=paths,
    )
