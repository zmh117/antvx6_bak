"""兼容：委托 domain 层 merge / diff。"""

from __future__ import annotations

from typing import Any

from app.application.mappers import changes_to_dto, payload_from_dto
from app.domain.er.canvas_utils import canvas_node_table_ids, table_id_from_node
from app.domain.er.diff import compute_canvas_graph_diff as _domain_canvas_diff
from app.domain.er.merge import merge_incoming_with_state
from app.domain.er.models import GraphState
from app.schemas.graph import (
    BusinessPathPayload,
    ColumnPayload,
    EnumValuePayload,
    GraphChangesPayload,
    NormalizedGraphPayload,
    RelationPayload,
    TablePayload,
)
from app.services.normalize import is_table_cell, normalize_edge_relation


def _state_from_dict(old_state: dict[str, Any]) -> GraphState:
    return GraphState(
        tables=old_state.get("tables") or {},
        columns=old_state.get("columns") or {},
        enums=old_state.get("enums") or {},
        relations=old_state.get("relations") or {},
        business_paths=old_state.get("business_paths") or {},
        x6_json=old_state.get("x6_json") or {"nodes": [], "edges": []},
        business_json=old_state.get("business_json") or [],
    )


def merge_canvas_payload_with_db(
    old_state: dict[str, Any],
    payload: NormalizedGraphPayload,
) -> NormalizedGraphPayload:
    incoming = payload_from_dto(payload)
    merged = merge_incoming_with_state(incoming, _state_from_dict(old_state))
    payload.tables = [TablePayload(**t.to_row()) for t in merged.tables]
    payload.columns = [ColumnPayload(**c.to_row()) for c in merged.columns]
    payload.enums = [EnumValuePayload(**e.to_row()) for e in merged.enums]
    payload.relations = [RelationPayload(**r.to_row()) for r in merged.relations]
    payload.business_paths = [BusinessPathPayload(**p.to_row()) for p in merged.business_paths]
    payload.legacy_tables = merged.legacy_tables
    return payload


def compute_canvas_graph_diff(
    old_state: dict[str, Any],
    payload: NormalizedGraphPayload,
) -> GraphChangesPayload:
    changes = _domain_canvas_diff(_state_from_dict(old_state), payload_from_dto(payload))
    return changes_to_dto(changes)


def apply_snapshot_positions(
    payload: NormalizedGraphPayload,
    snapshot_nodes: list[dict[str, Any]],
) -> None:
    if not snapshot_nodes:
        return
    by_id = {t.table_key: t for t in payload.tables}
    for node in snapshot_nodes:
        if not is_table_cell(node):
            continue
        tid = table_id_from_node(node)
        if not tid or tid not in by_id:
            continue
        pos = node.get("position") or {}
        x = pos.get("x") if isinstance(pos, dict) else node.get("x")
        y = pos.get("y") if isinstance(pos, dict) else node.get("y")
        if x is not None:
            by_id[tid].x = float(x)
        if y is not None:
            by_id[tid].y = float(y)
        size = node.get("size") or {}
        if isinstance(size, dict):
            if size.get("width") is not None:
                by_id[tid].width = float(size["width"])
            if size.get("height") is not None:
                by_id[tid].height = float(size["height"])


def relations_from_snapshot_edges(
    payload: NormalizedGraphPayload,
    snapshot_edges: list[dict[str, Any]],
) -> list[RelationPayload]:
    tables_by_key = {
        t.table_key: (t.raw_data or {"id": t.table_key, "name": t.table_name, "fields": []})
        for t in payload.tables
    }
    relations: list[RelationPayload] = []
    seen: set[str] = set()
    for edge in snapshot_edges:
        rel = normalize_edge_relation(edge, tables_by_key)
        if not rel or rel.relation_key in seen:
            continue
        seen.add(rel.relation_key)
        relations.append(rel)
    return relations


__all__ = [
    "canvas_node_table_ids",
    "merge_canvas_payload_with_db",
    "compute_canvas_graph_diff",
    "apply_snapshot_positions",
    "relations_from_snapshot_edges",
]
