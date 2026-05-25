"""画布 payload 与 DB 状态合并。"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.domain.er.canvas_utils import is_valid_table_key
from app.domain.er.models import (
    BusinessPath,
    Column,
    EnumValue,
    GraphPayload,
    GraphState,
    Table,
)


def merge_incoming_with_state(incoming: GraphPayload, old_state: GraphState) -> GraphPayload:
    """保留 DB 中客户端未提交的部分，避免画布局部保存误删。"""
    payload = deepcopy(incoming)
    present_tables = {t.table_key for t in payload.tables}
    present_cols = {c.composite_key() for c in payload.columns}
    present_enums = {
        f"{e.table_key}::{e.column_key}::{e.value}" for e in payload.enums
    }
    present_paths = {p.path_key for p in payload.business_paths}

    for key, row in old_state.tables.items():
        if key not in present_tables:
            payload.tables.append(Table.from_row(row))

    for key, row in old_state.columns.items():
        if key not in present_cols:
            payload.columns.append(Column.from_row(row))

    client_enum_cols = {f"{e.table_key}::{e.column_key}" for e in payload.enums}
    cols_enum_disabled = {
        f"{c.table_key}::{c.column_key}" for c in payload.columns if not c.enum_enabled
    }
    for key, row in old_state.enums.items():
        if key in present_enums:
            continue
        col_key = f"{row['table_key']}::{row['column_key']}"
        if col_key in client_enum_cols or col_key in cols_enum_disabled:
            continue
        payload.enums.append(EnumValue.from_row(row))

    # 客户端未提交 business_paths 时保留 DB 路径（canvas sync 通常为空）
    for key, row in old_state.business_paths.items():
        if key not in present_paths:
            payload.business_paths.append(BusinessPath.from_row(row))

    legacy_by_id: dict[str, dict[str, Any]] = {}
    for item in payload.legacy_tables or []:
        if isinstance(item, dict) and item.get("id"):
            legacy_by_id[str(item["id"])] = item
    for item in old_state.business_json:
        if not isinstance(item, dict):
            continue
        tid = str(item.get("id") or "")
        if tid and is_valid_table_key(tid) and tid not in legacy_by_id:
            legacy_by_id[tid] = item
    payload.legacy_tables = list(legacy_by_id.values())
    _enrich_legacy_table_fields(payload)
    return payload


def _enrich_legacy_table_fields(payload: GraphPayload) -> None:
    cols_by_table: dict[str, list[Column]] = {}
    for col in payload.columns:
        cols_by_table.setdefault(col.table_key, []).append(col)

    enums_by_col: dict[str, list[dict[str, Any]]] = {}
    for ev in payload.enums:
        ck = f"{ev.table_key}::{ev.column_key}"
        enums_by_col.setdefault(ck, []).append(
            {"value": ev.value, "label": ev.label, "description": ev.description}
        )
    for items in enums_by_col.values():
        items.sort(key=lambda x: str(x.get("value", "")))

    legacy = payload.legacy_tables or []
    for item in legacy:
        if not isinstance(item, dict):
            continue
        tid = str(item.get("id") or "")
        cols = cols_by_table.get(tid)
        if not cols:
            continue
        cols.sort(key=lambda c: c.sort_order)
        fields: list[dict[str, Any]] = []
        for col in cols:
            raw = col.raw_data if isinstance(col.raw_data, dict) else {}
            field: dict[str, Any] = {
                "name": col.column_name,
                "type": col.data_type,
                "keyType": col.key_type,
                "comment": col.comment,
                "defaultValue": col.default_value,
                **{
                    k: v
                    for k, v in raw.items()
                    if k not in ("name", "type", "comment", "enumValues")
                },
            }
            if col.comment:
                field["comment"] = col.comment
            col_enums = enums_by_col.get(f"{tid}::{col.column_name}")
            if col_enums:
                field["enumValues"] = col_enums
            elif col.enum_enabled:
                field["enumValues"] = raw.get("enumValues") or []
            fields.append(field)
        if len(fields) >= len(item.get("fields") or []):
            item["fields"] = fields
    payload.legacy_tables = legacy
