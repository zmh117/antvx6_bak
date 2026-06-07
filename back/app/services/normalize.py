"""Normalize X6 canvas JSON + legacy table array into structured payloads."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from app.schemas.graph import (
    CanvasSnapshotPayload,
    ColumnPayload,
    EnumValuePayload,
    NormalizedGraphPayload,
    RelationPayload,
    TablePayload,
)
from app.services.cardinality import relationship_to_cardinality

PORT_RE = re.compile(r"^fld-([LR])-(.+)$")


def field_key(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


def parse_port_column(port_id: str | None) -> str | None:
    if not port_id:
        return None
    m = PORT_RE.match(port_id)
    if not m:
        return None
    return m.group(2)


def lookup_field_name(fields: list[dict[str, Any]], port_key_suffix: str) -> str | None:
    for f in fields:
        if field_key(f.get("name", "")) == port_key_suffix:
            return f.get("name")
    return None


def is_empty_enum(entry: dict[str, Any]) -> bool:
    value = (entry.get("value") or "").strip()
    label = (entry.get("label") or "").strip()
    return not value and not label


def is_valid_table_key(table_key: str) -> bool:
    """Relation keys look like ``posts.status__users.id`` — not tables."""
    return bool(table_key) and "__" not in table_key


def is_table_cell(cell: dict[str, Any]) -> bool:
    if cell.get("source") or cell.get("target"):
        return False
    if cell.get("shape") == "er-table":
        return True
    data = cell.get("data") or {}
    return isinstance(data.get("fields"), list)


def is_edge_cell(cell: dict[str, Any]) -> bool:
    if cell.get("shape") == "er-relationship":
        return True
    return bool(cell.get("source") and cell.get("target"))


def normalize_column_role(role: str | None) -> str | None:
    """兼容旧值 foreign_ref → query_link（逻辑查询关联，非物理外键）。"""
    if role == "foreign_ref":
        return "query_link"
    return role


def infer_column_role(field: dict[str, Any]) -> str | None:
    name = (field.get("name") or "").lower()
    key_type = field.get("keyType")
    explicit = normalize_column_role(field.get("columnRole"))
    if explicit:
        return explicit
    if key_type == "primary" or name == "id":
        return "id"
    if key_type == "unique":
        return "unknown"
    if key_type == "relation" or field.get("ref"):
        return "query_link"
    if field.get("enumValues"):
        return "enum"
    if "status" in name:
        return "status"
    if name.endswith("_at") or "time" in name or "date" in name:
        return "time"
    if "amount" in name or "price" in name:
        return "amount"
    return None


def build_relation_key(
    source_table: str,
    source_column: str,
    target_table: str,
    target_column: str,
) -> str:
    return f"{source_table}.{source_column}__{target_table}.{target_column}"


def normalize_edge_relation(
    edge: dict[str, Any],
    tables_by_key: dict[str, dict[str, Any]],
) -> RelationPayload | None:
    data = edge.get("data") or {}
    source = edge.get("source") or {}
    target = edge.get("target") or {}

    source_table = data.get("sourceTable") or source.get("cell")
    target_table = data.get("targetTable") or target.get("cell")
    if not source_table or not target_table:
        return None

    source_port = source.get("port")
    target_port = target.get("port")
    source_col_key = parse_port_column(source_port)
    target_col_key = parse_port_column(target_port)
    if not source_col_key or not target_col_key:
        return None

    src_fields = tables_by_key.get(str(source_table), {}).get("fields") or []
    tgt_fields = tables_by_key.get(str(target_table), {}).get("fields") or []
    source_column = data.get("sourceColumn") or lookup_field_name(src_fields, source_col_key)
    target_column = data.get("targetColumn") or lookup_field_name(tgt_fields, target_col_key)
    if not source_column or not target_column:
        return None

    sp = PORT_RE.match(source_port or "")
    tp = PORT_RE.match(target_port or "")
    if sp and tp:
        if sp.group(1) == "L" and tp.group(1) == "R":
            source_table, target_table = target_table, source_table
            source_column, target_column = target_column, source_column

    relationship = data.get("relationship") or data.get("type") or "1:1"
    match_operator = data.get("matchOperator") or data.get("match_operator") or "eq"
    relation_key = data.get("relationKey") or build_relation_key(
        str(source_table), str(source_column), str(target_table), str(target_column)
    )
    join_condition = data.get("joinCondition") or (
        f"{source_table}.{source_column} = {target_table}.{target_column}"
        if match_operator == "eq"
        else None
    )

    return RelationPayload(
        relation_key=relation_key,
        source_table_key=str(source_table),
        source_column_key=str(source_column),
        target_table_key=str(target_table),
        target_column_key=str(target_column),
        relation_type=data.get("relationType") or "identifier_match",
        match_operator=match_operator,
        relationship=relationship,
        cardinality=data.get("cardinality") or relationship_to_cardinality(relationship),
        relation_name=data.get("relationName"),
        description=data.get("description"),
        join_condition=join_condition,
        direction=data.get("direction") or "source_to_target",
        confidence=float(data.get("confidence") or 1.0),
        source=data.get("source") or "manual",
        verified=bool(data.get("verified") or False),
        tags=data.get("tags") or [],
        raw_edge=edge,
    )


def normalize_from_canvas(
    graph_id: UUID,
    x6_json: dict[str, Any],
    *,
    base_version: int | None = None,
    client_id: str | None = None,
) -> NormalizedGraphPayload:
    cells = x6_json.get("cells") or []
    nodes = [c for c in cells if is_table_cell(c)]
    edges_raw = [c for c in cells if is_edge_cell(c)]

    if not nodes and "nodes" in x6_json:
        nodes = [c for c in (x6_json.get("nodes") or []) if is_table_cell(c)]
    if not edges_raw and "edges" in x6_json:
        edges_raw = [c for c in (x6_json.get("edges") or []) if is_edge_cell(c)]

    snapshot = CanvasSnapshotPayload(nodes=nodes, edges=edges_raw)
    tables_by_key: dict[str, dict[str, Any]] = {}
    table_payloads: list[TablePayload] = []
    column_payloads: list[ColumnPayload] = []
    enum_payloads: list[EnumValuePayload] = []

    for node in nodes:
        table_key = str(node.get("id") or "")
        if not table_key or not is_valid_table_key(table_key):
            continue
        data = node.get("data") or {}
        if not data.get("id"):
            data = {**data, "id": table_key, "name": data.get("name") or table_key}
        tables_by_key[table_key] = data

        pos = node.get("position") or {}
        x = pos.get("x") if isinstance(pos, dict) else node.get("x")
        y = pos.get("y") if isinstance(pos, dict) else node.get("y")
        size = node.get("size") or {}
        width = size.get("width") if isinstance(size, dict) else node.get("width")
        height = size.get("height") if isinstance(size, dict) else node.get("height")

        table_payloads.append(
            TablePayload(
                table_key=table_key,
                table_name=data.get("name") or table_key,
                business_name=data.get("businessName"),
                description=data.get("description"),
                business_domain=data.get("businessDomain"),
                table_type=data.get("tableType") or "business",
                importance=int(data.get("importance") or 3),
                tags=data.get("tags") or [],
                comment=data.get("comment"),
                x=float(x) if x is not None else None,
                y=float(y) if y is not None else None,
                width=float(width) if width is not None else None,
                height=float(height) if height is not None else None,
                raw_data=data,
            )
        )

        fields = data.get("fields") or []
        for idx, field in enumerate(fields):
            col_name = field.get("name")
            if not col_name:
                continue
            enums = field.get("enumValues") or []
            valid_enums = [e for e in enums if not is_empty_enum(e)]
            column_payloads.append(
                ColumnPayload(
                    table_key=table_key,
                    column_key=col_name,
                    column_name=col_name,
                    data_type=field.get("type"),
                    business_name=field.get("businessName"),
                    description=field.get("description"),
                    comment=field.get("comment"),
                    default_value=(
                        str(field["defaultValue"])
                        if field.get("defaultValue") is not None
                        else None
                    ),
                    is_primary_key=field.get("keyType") == "primary",
                    is_unique=field.get("keyType") == "unique",
                    key_type=field.get("keyType"),
                    column_role=infer_column_role(field),
                    enum_enabled=len(valid_enums) > 0,
                    sort_order=idx,
                    tags=field.get("tags") or [],
                    raw_data=field,
                )
            )
            for eidx, ev in enumerate(valid_enums):
                enum_payloads.append(
                    EnumValuePayload(
                        table_key=table_key,
                        column_key=col_name,
                        value=str(ev.get("value", "")),
                        label=str(ev.get("label") or ev.get("value") or ""),
                        description=ev.get("description"),
                        sort_order=int(ev.get("sortOrder") if ev.get("sortOrder") is not None else eidx),
                        raw_data=ev,
                    )
                )

    relations: list[RelationPayload] = []
    seen_keys: set[str] = set()
    for edge in edges_raw:
        rel = normalize_edge_relation(edge, tables_by_key)
        if not rel or rel.relation_key in seen_keys:
            continue
        seen_keys.add(rel.relation_key)
        relations.append(rel)

    legacy = [
        {
            "id": t.table_key,
            "name": t.table_name,
            "businessName": t.business_name,
            "description": t.description,
            "businessDomain": t.business_domain,
            "tableType": t.table_type,
            "importance": t.importance,
            "tags": t.tags,
            "comment": t.comment,
            "fields": tables_by_key[t.table_key].get("fields") or [],
            "layout": (
                {"x": t.x, "y": t.y}
                if t.x is not None and t.y is not None
                else None
            ),
        }
        for t in table_payloads
    ]

    return NormalizedGraphPayload(
        graph_id=graph_id,
        base_version=base_version,
        client_id=client_id,
        tables=table_payloads,
        columns=column_payloads,
        enums=enum_payloads,
        relations=relations,
        business_paths=[],
        snapshot=snapshot,
        legacy_tables=legacy,
    )


def normalize_legacy_tables_array(
    graph_id: UUID,
    tables: list[dict[str, Any]],
    *,
    snapshot: CanvasSnapshotPayload | None = None,
    base_version: int | None = None,
) -> NormalizedGraphPayload:
    """Convert legacy ``[{ id, name, fields, layout }]`` array."""
    fake_nodes = []
    fake_edges = []
    for t in tables:
        tid = str(t.get("id") or "")
        layout = t.get("layout") or {}
        fake_nodes.append(
            {
                "id": tid,
                "shape": "er-table",
                "x": layout.get("x", 0),
                "y": layout.get("y", 0),
                "data": t,
            }
        )
        for field in t.get("fields") or []:
            if field.get("keyType") not in ("relation", "foreign"):
                continue
            ref = field.get("ref")
            refs = ref if isinstance(ref, list) else ([ref] if ref else [])
            for r in refs:
                if not r:
                    continue
                rel_type = r.get("relationship") or "1:1"
                match_operator = r.get("matchOperator") or "eq"
                target_table = r.get("table")
                target_field = r.get("field")
                if not target_table or not target_field:
                    continue
                rk = r.get("relationKey") or build_relation_key(
                    tid, field["name"], target_table, target_field
                )
                fake_edges.append(
                    {
                        "id": rk,
                        "shape": "er-relationship",
                        "source": {"cell": tid, "port": f"fld-R-{field_key(field['name'])}"},
                        "target": {
                            "cell": target_table,
                            "port": f"fld-L-{field_key(target_field)}",
                        },
                        "data": {
                            "relationKey": rk,
                            "relationType": r.get("relationType") or "identifier_match",
                            "matchOperator": match_operator,
                            "relationship": rel_type,
                            "relationName": r.get("relationName"),
                            "description": r.get("description"),
                            "sourceTable": tid,
                            "sourceColumn": field["name"],
                            "targetTable": target_table,
                            "targetColumn": target_field,
                            "joinCondition": (
                                f"{tid}.{field['name']} = {target_table}.{target_field}"
                                if match_operator == "eq"
                                else None
                            ),
                            "verified": bool(r.get("verified") or False),
                            "tags": r.get("tags") or [],
                        },
                    }
                )

    x6 = {"nodes": fake_nodes, "edges": fake_edges}
    payload = normalize_from_canvas(graph_id, x6, base_version=base_version)
    payload.legacy_tables = tables

    if snapshot:
        from app.services.canvas_sync import (
            apply_snapshot_positions,
            relations_from_snapshot_edges,
        )

        apply_snapshot_positions(payload, snapshot.nodes)
        if snapshot.edges:
            payload.relations = relations_from_snapshot_edges(payload, snapshot.edges)
        payload.snapshot = snapshot

    return payload
