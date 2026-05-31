"""ER 导入领域策略：覆盖 / 增量的唯一业务规则入口。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.domain.er.models import (
    BusinessPath,
    CanvasSnapshot,
    Column,
    EnumValue,
    GraphPayload,
    GraphState,
    Relation,
    Table,
)
from app.domain.er_import.models import ImportMode, ImportedColumn, ImportedSchema, ImportedTable


NODE_WIDTH = 320
NODE_V_GAP = 120
NODE_H_GAP = 120


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return bool(value)
    return True


def _table_key(name: str) -> str:
    return name.strip()


def _column_key(name: str) -> str:
    return name.strip()


def _key_type(col: ImportedColumn) -> str | None:
    if col.is_primary_key:
        return "primary"
    if col.is_unique:
        return "unique"
    return None


def _legacy_field(col: ImportedColumn) -> dict[str, Any]:
    field: dict[str, Any] = {
        "name": col.column_name,
        "type": col.data_type or "",
    }
    if col.comment:
        field["comment"] = col.comment
    if col.default_value is not None:
        field["defaultValue"] = col.default_value
    key_type = _key_type(col)
    if key_type:
        field["keyType"] = key_type
    return field


def _layout(index: int) -> tuple[float, float]:
    return (
        float((index % 3) * (NODE_WIDTH + NODE_H_GAP)),
        float((index // 3) * (320 + NODE_V_GAP)),
    )


def _layout_key(x: float | None, y: float | None) -> tuple[int, int] | None:
    if x is None or y is None:
        return None
    return (round(float(x) / (NODE_WIDTH + NODE_H_GAP)), round(float(y) / (320 + NODE_V_GAP)))


def _raw_layout(table: Table) -> tuple[float | None, float | None]:
    raw = table.raw_data if isinstance(table.raw_data, dict) else {}
    layout = raw.get("layout") if isinstance(raw.get("layout"), dict) else {}
    x = table.x
    y = table.y
    if x is None and isinstance(layout, dict) and layout.get("x") is not None:
        x = float(layout["x"])
    if y is None and isinstance(layout, dict) and layout.get("y") is not None:
        y = float(layout["y"])
    return x, y


def _sync_table_layout(table: Table, x: float, y: float) -> Table:
    table.x = x
    table.y = y
    raw = dict(table.raw_data or {})
    raw["layout"] = {"x": x, "y": y}
    table.raw_data = raw
    return table


def _next_free_layout(
    occupied: set[tuple[int, int]], start_index: int = 0
) -> tuple[float, float, int]:
    index = max(0, start_index)
    while True:
        x, y = _layout(index)
        key = _layout_key(x, y)
        if key is not None and key not in occupied:
            occupied.add(key)
            return x, y, index + 1
        index += 1


def _legacy_table(table: ImportedTable, index: int) -> dict[str, Any]:
    x, y = _layout(index)
    return {
        "id": _table_key(table.table_name),
        "name": table.table_name,
        "fields": [_legacy_field(col) for col in table.columns],
        "layout": {"x": x, "y": y},
        **({"comment": table.comment} if table.comment else {}),
    }


def _table_from_import(table: ImportedTable, index: int) -> Table:
    x, y = _layout(index)
    legacy = _legacy_table(table, index)
    return Table(
        table_key=_table_key(table.table_name),
        table_name=table.table_name,
        table_type="business",
        importance=3,
        comment=table.comment,
        x=x,
        y=y,
        width=float(NODE_WIDTH),
        raw_data={
            **legacy,
            "imported": True,
            "source": "database_import",
        },
    )


def _column_from_import(table: ImportedTable, col: ImportedColumn) -> Column:
    key_type = _key_type(col)
    return Column(
        table_key=_table_key(table.table_name),
        column_key=_column_key(col.column_name),
        column_name=col.column_name,
        data_type=col.data_type,
        comment=col.comment,
        default_value=col.default_value,
        nullable=col.nullable,
        is_primary_key=col.is_primary_key,
        is_unique=col.is_unique,
        is_indexed=col.is_indexed,
        key_type=key_type,
        column_role="id" if col.is_primary_key else None,
        sort_order=col.sort_order,
        raw_data={
            "name": col.column_name,
            "type": col.data_type,
            "comment": col.comment,
            "defaultValue": col.default_value,
            "keyType": key_type,
            "imported": True,
            "source": "database_import",
        },
    )


def _table_from_state(row: dict[str, Any]) -> Table:
    return Table.from_row(row)


def _column_from_state(row: dict[str, Any]) -> Column:
    return Column.from_row(row)


def _enum_from_state(row: dict[str, Any]) -> EnumValue:
    return EnumValue.from_row(row)


def _relation_from_state(row: dict[str, Any]) -> Relation:
    return Relation.from_row(row)


def _path_from_state(row: dict[str, Any]) -> BusinessPath:
    return BusinessPath.from_row(row)


def _preserve_business_table(existing: Table, imported: Table) -> Table:
    for attr in ("business_name", "description", "business_domain", "table_type", "tags", "comment"):
        old = getattr(existing, attr)
        if _has_value(old):
            setattr(imported, attr, old)
    if _has_value(existing.importance):
        imported.importance = existing.importance
    imported.x = existing.x if existing.x is not None else imported.x
    imported.y = existing.y if existing.y is not None else imported.y
    imported.width = existing.width if existing.width is not None else imported.width
    imported.height = existing.height if existing.height is not None else imported.height
    return imported


def _preserve_business_column(existing: Column, imported: Column) -> Column:
    for attr in ("business_name", "description", "comment", "column_role", "tags"):
        old = getattr(existing, attr)
        if _has_value(old):
            setattr(imported, attr, old)
    imported.enum_enabled = existing.enum_enabled
    return imported


def _snapshot_from_legacy(legacy_tables: list[dict[str, Any]]) -> CanvasSnapshot:
    nodes = []
    for table in legacy_tables:
        layout = table.get("layout") or {}
        fields = table.get("fields") if isinstance(table.get("fields"), list) else []
        height = 72 + max(len(fields), 1) * 30
        nodes.append(
            {
                "id": table["id"],
                "shape": "er-table",
                "x": layout.get("x", 0),
                "y": layout.get("y", 0),
                "width": NODE_WIDTH,
                "height": height,
                "data": table,
            }
        )
    return CanvasSnapshot(nodes=nodes, edges=[])


def _selected_tables(schema: ImportedSchema, selected_table_names: set[str]) -> list[ImportedTable]:
    return [table for table in schema.tables if table.table_name in selected_table_names]


def build_import_payload(
    *,
    graph_id: UUID,
    old_state: GraphState,
    schema: ImportedSchema,
    mode: ImportMode,
    selected_table_names: set[str],
    client_id: str | None = None,
) -> GraphPayload:
    selected = _selected_tables(schema, selected_table_names)

    if mode == ImportMode.OVERWRITE:
        tables = [_table_from_import(table, idx) for idx, table in enumerate(selected)]
        columns = [column for table in selected for column in [_column_from_import(table, c) for c in table.columns]]
        legacy_tables = [_legacy_table(table, idx) for idx, table in enumerate(selected)]
        return GraphPayload(
            graph_id=graph_id,
            client_id=client_id,
            operation_source="manual_save",
            tables=tables,
            columns=columns,
            enums=[],
            relations=[],
            business_paths=[],
            snapshot=_snapshot_from_legacy(legacy_tables),
            legacy_tables=legacy_tables,
        )

    tables_by_key = {key: _table_from_state(row) for key, row in old_state.tables.items()}
    columns_by_key = {key: _column_from_state(row) for key, row in old_state.columns.items()}

    selected_keys = {_table_key(table.table_name) for table in selected}
    occupied: set[tuple[int, int]] = set()
    for key, table in tables_by_key.items():
        if key in selected_keys:
            continue
        pos_key = _layout_key(*_raw_layout(table))
        if pos_key is not None:
            occupied.add(pos_key)

    next_index = len(tables_by_key)
    for table in selected:
        key = _table_key(table.table_name)
        layout_x: float
        layout_y: float
        existing = tables_by_key.get(key)
        existing_key = _layout_key(*_raw_layout(existing)) if existing else None
        if existing is not None and existing_key is not None and existing_key not in occupied:
            occupied.add(existing_key)
            layout_x, layout_y = _raw_layout(existing)
            layout_x = float(layout_x)
            layout_y = float(layout_y)
        else:
            layout_x, layout_y, next_index = _next_free_layout(occupied, next_index)
        imported_table = _sync_table_layout(_table_from_import(table, next_index), layout_x, layout_y)
        if key in tables_by_key:
            imported_table = _preserve_business_table(tables_by_key[key], imported_table)
            imported_table = _sync_table_layout(imported_table, layout_x, layout_y)
        tables_by_key[key] = imported_table

        for col in table.columns:
            column = _column_from_import(table, col)
            ckey = column.composite_key()
            if ckey in columns_by_key:
                column = _preserve_business_column(columns_by_key[ckey], column)
            columns_by_key[ckey] = column

    relations = [_relation_from_state(row) for row in old_state.relations.values()]
    enums = [_enum_from_state(row) for row in old_state.enums.values()]
    business_paths = [_path_from_state(row) for row in old_state.business_paths.values()]
    legacy_tables = [
        {
            "id": table.table_key,
            "name": table.table_name,
            "fields": [
                _legacy_field(
                    ImportedColumn(
                        table_name=col.table_key,
                        column_name=col.column_name,
                        data_type=col.data_type,
                        comment=col.comment,
                        default_value=col.default_value,
                        nullable=col.nullable,
                        is_primary_key=col.is_primary_key,
                        is_unique=col.is_unique,
                        is_indexed=col.is_indexed,
                        sort_order=col.sort_order,
                    )
                )
                for col in sorted(
                    [c for c in columns_by_key.values() if c.table_key == table.table_key],
                    key=lambda c: c.sort_order,
                )
            ],
            "layout": {
                "x": table.x if table.x is not None else 0,
                "y": table.y if table.y is not None else 0,
            },
            **({"comment": table.comment} if table.comment else {}),
        }
        for table in tables_by_key.values()
    ]

    return GraphPayload(
        graph_id=graph_id,
        client_id=client_id,
        operation_source="manual_save",
        tables=list(tables_by_key.values()),
        columns=list(columns_by_key.values()),
        enums=enums,
        relations=relations,
        business_paths=business_paths,
        snapshot=_snapshot_from_legacy(legacy_tables),
        legacy_tables=legacy_tables,
    )
