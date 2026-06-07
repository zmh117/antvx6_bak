"""计算 DB 状态与目标 payload 之间的实体级 diff。"""

from __future__ import annotations

from typing import Any

from app.domain.er.canvas_utils import canvas_node_table_ids
from app.domain.er.models import CanvasSnapshot, GraphChanges, GraphPayload, GraphState


def _row_equal(a: dict[str, Any], b: dict[str, Any], fields: list[str]) -> bool:
    for f in fields:
        if f.endswith("_data") or f == "raw_edge":
            continue
        if a.get(f) != b.get(f):
            return False
    return True


def compute_graph_diff(old_state: GraphState, payload: GraphPayload) -> GraphChanges:
    changes = GraphChanges()
    if payload.snapshot.nodes or payload.snapshot.edges:
        changes.snapshot = CanvasSnapshot(
            nodes=list(payload.snapshot.nodes),
            edges=list(payload.snapshot.edges),
        )

    new_tables = {t.table_key: t.to_row() for t in payload.tables}
    for key, row in new_tables.items():
        if key not in old_state.tables:
            changes.tables.added.append(row)
        elif not _row_equal(
            old_state.tables[key],
            row,
            [
                "table_name",
                "business_name",
                "description",
                "business_domain",
                "table_type",
                "importance",
                "tags",
                "comment",
                "x",
                "y",
                "width",
                "height",
            ],
        ):
            changes.tables.updated.append(row)
    for key in old_state.tables:
        if key not in new_tables:
            changes.tables.deleted.append(key)

    new_columns = {c.composite_key(): c.to_row() for c in payload.columns}
    col_fields = [
        "column_name",
        "data_type",
        "business_name",
        "description",
        "comment",
        "default_value",
        "nullable",
        "is_primary_key",
        "is_unique",
        "is_indexed",
        "key_type",
        "column_role",
        "enum_enabled",
        "sort_order",
        "tags",
    ]
    for key, row in new_columns.items():
        if key not in old_state.columns:
            changes.columns.added.append(row)
        elif not _row_equal(old_state.columns[key], row, col_fields):
            changes.columns.updated.append(row)
    for key in old_state.columns:
        if key not in new_columns:
            changes.columns.deleted.append(key)

    new_enums = {
        f"{e.table_key}::{e.column_key}::{e.value}": e.to_row() for e in payload.enums
    }
    for key, row in new_enums.items():
        if key not in old_state.enums:
            changes.enums.added.append(row)
        elif not _row_equal(
            old_state.enums[key], row, ["label", "description", "sort_order", "enabled"]
        ):
            changes.enums.updated.append(row)
    for key in old_state.enums:
        if key not in new_enums:
            changes.enums.deleted.append(key)

    new_relations = {r.relation_key: r.to_row() for r in payload.relations}
    rel_fields = [
        "source_table_key",
        "source_column_key",
        "target_table_key",
        "target_column_key",
        "relation_type",
        "match_operator",
        "relationship",
        "relation_name",
        "join_condition",
        "description",
        "verified",
        "tags",
    ]
    for key, row in new_relations.items():
        if key not in old_state.relations:
            changes.relations.added.append(row)
        elif not _row_equal(old_state.relations[key], row, rel_fields):
            changes.relations.updated.append(row)
    for key in old_state.relations:
        if key not in new_relations:
            changes.relations.deleted.append(key)

    new_paths = {p.path_key: p.to_row() for p in payload.business_paths}
    path_fields = [
        "name",
        "intent",
        "description",
        "business_domain",
        "tags",
        "table_keys",
        "relation_keys",
        "path_json",
        "confidence",
    ]
    for key, row in new_paths.items():
        if key not in old_state.business_paths:
            changes.business_paths.added.append(row)
        elif not _row_equal(old_state.business_paths[key], row, path_fields):
            changes.business_paths.updated.append(row)
    for key in old_state.business_paths:
        if key not in new_paths:
            changes.business_paths.deleted.append(key)

    return changes


def compute_canvas_graph_diff(old_state: GraphState, payload: GraphPayload) -> GraphChanges:
    """画布保存：限制删除范围，避免误删未出现在画布上的表。"""
    changes = compute_graph_diff(old_state, payload)

    old_x6 = old_state.x6_json or {}
    old_canvas_ids = canvas_node_table_ids(old_x6.get("nodes") or [])
    new_canvas_ids = (
        canvas_node_table_ids(payload.snapshot.nodes)
        if payload.snapshot.nodes
        else {t.table_key for t in payload.tables}
    )

    allowed_table_deletes = old_canvas_ids - new_canvas_ids
    changes.tables.deleted = [k for k in changes.tables.deleted if k in allowed_table_deletes]

    changes.columns.deleted = [
        k for k in changes.columns.deleted if k.split("::", 1)[0] in new_canvas_ids
    ]
    changes.enums.deleted = [
        k
        for k in changes.enums.deleted
        if (k.split("::", 1)[0] if "::" in k else k) in new_canvas_ids
    ]
    return changes


def changes_summary(changes: GraphChanges) -> dict[str, int]:
    return {
        "tables_added": len(changes.tables.added),
        "tables_updated": len(changes.tables.updated),
        "tables_deleted": len(changes.tables.deleted),
        "columns_added": len(changes.columns.added),
        "columns_updated": len(changes.columns.updated),
        "columns_deleted": len(changes.columns.deleted),
        "enums_added": len(changes.enums.added),
        "enums_updated": len(changes.enums.updated),
        "enums_deleted": len(changes.enums.deleted),
        "relations_added": len(changes.relations.added),
        "relations_updated": len(changes.relations.updated),
        "relations_deleted": len(changes.relations.deleted),
        "business_paths_added": len(changes.business_paths.added),
        "business_paths_updated": len(changes.business_paths.updated),
        "business_paths_deleted": len(changes.business_paths.deleted),
    }
