"""ER 图 Postgres 仓储：增量写入与 change_log。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from app.domain.er.diff import changes_summary
from app.domain.er.models import (
    BusinessPath,
    Column,
    EntityDiff,
    EnumValue,
    GraphChanges,
    GraphPayload,
    Relation,
    Table,
)
from app.services.agent import rebuild_search_documents, run_validation
from app.services.json_util import to_jsonable

_COMPOSITE_SEP = "::"


def _log_change(
    cur: psycopg.Cursor,
    *,
    graph_id: UUID,
    change_type: str,
    entity_type: str,
    entity_key: str,
    before_data: Any,
    after_data: Any,
    client_id: str | None,
    user_id: UUID | str | None = None,
    graph_version: int | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO er_change_log (
            graph_id, change_type, entity_type, entity_key,
            before_data, after_data, client_id, user_id, graph_version
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            graph_id,
            change_type,
            entity_type,
            entity_key,
            Jsonb(to_jsonable(before_data)) if before_data is not None else None,
            Jsonb(to_jsonable(after_data)) if after_data is not None else None,
            client_id,
            str(user_id) if user_id is not None else None,
            graph_version,
        ),
    )


def _entity_key(entity_type: str, row: dict[str, Any]) -> str:
    key = row.get("table_key") or row.get("relation_key") or row.get("path_key")
    if entity_type == "column":
        key = f"{row['table_key']}::{row['column_key']}"
    elif entity_type == "enum":
        key = f"{row['table_key']}::{row['column_key']}::{row['value']}"
    return str(key)


def _log_entity_diffs(
    cur: psycopg.Cursor,
    graph_id: UUID,
    entity_type: str,
    old_map: dict[str, Any],
    diff: EntityDiff,
    client_id: str | None,
    user_id: UUID | str | None,
) -> None:
    for row in diff.added:
        _log_change(
            cur,
            graph_id=graph_id,
            change_type="upsert",
            entity_type=entity_type,
            entity_key=_entity_key(entity_type, row),
            before_data=None,
            after_data=row,
            client_id=client_id,
            user_id=user_id,
        )
    for row in diff.updated:
        key = _entity_key(entity_type, row)
        _log_change(
            cur,
            graph_id=graph_id,
            change_type="upsert",
            entity_type=entity_type,
            entity_key=key,
            before_data=old_map.get(key),
            after_data=row,
            client_id=client_id,
            user_id=user_id,
        )
    for key in diff.deleted:
        _log_change(
            cur,
            graph_id=graph_id,
            change_type="delete",
            entity_type=entity_type,
            entity_key=str(key),
            before_data=old_map.get(str(key)),
            after_data=None,
            client_id=client_id,
            user_id=user_id,
        )


def _upsert_table(cur: psycopg.Cursor, graph_id: UUID, t: Table) -> None:
    cur.execute(
        """
        INSERT INTO er_table (
            graph_id, table_key, table_name, business_name, description,
            business_domain, table_type, importance, tags, comment,
            x, y, width, height, raw_data, updated_at, deleted_at
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL
        )
        ON CONFLICT (graph_id, table_key) DO UPDATE SET
            table_name = EXCLUDED.table_name,
            business_name = EXCLUDED.business_name,
            description = EXCLUDED.description,
            business_domain = EXCLUDED.business_domain,
            table_type = EXCLUDED.table_type,
            importance = EXCLUDED.importance,
            tags = EXCLUDED.tags,
            comment = EXCLUDED.comment,
            x = EXCLUDED.x, y = EXCLUDED.y,
            width = EXCLUDED.width, height = EXCLUDED.height,
            raw_data = EXCLUDED.raw_data,
            version = er_table.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        """,
        (
            graph_id,
            t.table_key,
            t.table_name,
            t.business_name,
            t.description,
            t.business_domain,
            t.table_type,
            t.importance,
            t.tags,
            t.comment,
            t.x,
            t.y,
            t.width,
            t.height,
            Jsonb(t.raw_data),
        ),
    )


def _upsert_column(cur: psycopg.Cursor, graph_id: UUID, c: Column) -> None:
    cur.execute(
        """
        INSERT INTO er_column (
            graph_id, table_key, column_key, column_name, data_type,
            business_name, description, comment, default_value, nullable,
            is_primary_key, is_unique, is_indexed, key_type, column_role,
            enum_enabled, sort_order, tags, raw_data, updated_at, deleted_at
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL
        )
        ON CONFLICT (graph_id, table_key, column_key) DO UPDATE SET
            column_name = EXCLUDED.column_name,
            data_type = EXCLUDED.data_type,
            business_name = EXCLUDED.business_name,
            description = EXCLUDED.description,
            comment = EXCLUDED.comment,
            default_value = EXCLUDED.default_value,
            nullable = EXCLUDED.nullable,
            is_primary_key = EXCLUDED.is_primary_key,
            is_unique = EXCLUDED.is_unique,
            is_indexed = EXCLUDED.is_indexed,
            key_type = EXCLUDED.key_type,
            column_role = EXCLUDED.column_role,
            enum_enabled = EXCLUDED.enum_enabled,
            sort_order = EXCLUDED.sort_order,
            tags = EXCLUDED.tags,
            raw_data = EXCLUDED.raw_data,
            version = er_column.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        """,
        (
            graph_id,
            c.table_key,
            c.column_key,
            c.column_name,
            c.data_type,
            c.business_name,
            c.description,
            c.comment,
            c.default_value,
            c.nullable,
            c.is_primary_key,
            c.is_unique,
            c.is_indexed,
            c.key_type,
            c.column_role,
            c.enum_enabled,
            c.sort_order,
            c.tags,
            Jsonb(c.raw_data),
        ),
    )


def _upsert_enum(cur: psycopg.Cursor, graph_id: UUID, e: EnumValue) -> None:
    cur.execute(
        """
        INSERT INTO er_column_enum_value (
            graph_id, table_key, column_key, value, label, description,
            sort_order, enabled, raw_data, updated_at, deleted_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL)
        ON CONFLICT (graph_id, table_key, column_key, value) DO UPDATE SET
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            enabled = EXCLUDED.enabled,
            raw_data = EXCLUDED.raw_data,
            version = er_column_enum_value.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        """,
        (
            graph_id,
            e.table_key,
            e.column_key,
            e.value,
            e.label,
            e.description,
            e.sort_order,
            e.enabled,
            Jsonb(e.raw_data),
        ),
    )


def _upsert_relation(cur: psycopg.Cursor, graph_id: UUID, r: Relation) -> None:
    cur.execute(
        """
        INSERT INTO er_relation (
            graph_id, relation_key, source_table_key, source_column_key,
            target_table_key, target_column_key, relation_type, relationship,
            match_operator, cardinality, relation_name, description, join_condition, direction,
            confidence, source, verified, tags, raw_edge, updated_at, deleted_at
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL
        )
        ON CONFLICT (graph_id, relation_key) DO UPDATE SET
            source_table_key = EXCLUDED.source_table_key,
            source_column_key = EXCLUDED.source_column_key,
            target_table_key = EXCLUDED.target_table_key,
            target_column_key = EXCLUDED.target_column_key,
            relation_type = EXCLUDED.relation_type,
            relationship = EXCLUDED.relationship,
            match_operator = EXCLUDED.match_operator,
            cardinality = EXCLUDED.cardinality,
            relation_name = EXCLUDED.relation_name,
            description = EXCLUDED.description,
            join_condition = EXCLUDED.join_condition,
            direction = EXCLUDED.direction,
            confidence = EXCLUDED.confidence,
            source = EXCLUDED.source,
            verified = EXCLUDED.verified,
            tags = EXCLUDED.tags,
            raw_edge = EXCLUDED.raw_edge,
            version = er_relation.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        """,
        (
            graph_id,
            r.relation_key,
            r.source_table_key,
            r.source_column_key,
            r.target_table_key,
            r.target_column_key,
            r.relation_type,
            r.relationship,
            r.match_operator,
            r.cardinality,
            r.relation_name,
            r.description,
            r.join_condition,
            r.direction,
            r.confidence,
            r.source,
            r.verified,
            r.tags,
            Jsonb(r.raw_edge),
        ),
    )


def _upsert_business_path(cur: psycopg.Cursor, graph_id: UUID, p: BusinessPath) -> None:
    cur.execute(
        """
        INSERT INTO er_business_path (
            graph_id, path_key, name, intent, description, business_domain,
            tags, table_keys, relation_keys, path_json, confidence,
            updated_at, deleted_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL)
        ON CONFLICT (graph_id, path_key) DO UPDATE SET
            name = EXCLUDED.name,
            intent = EXCLUDED.intent,
            description = EXCLUDED.description,
            business_domain = EXCLUDED.business_domain,
            tags = EXCLUDED.tags,
            table_keys = EXCLUDED.table_keys,
            relation_keys = EXCLUDED.relation_keys,
            path_json = EXCLUDED.path_json,
            confidence = EXCLUDED.confidence,
            version = er_business_path.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        """,
        (
            graph_id,
            p.path_key,
            p.name,
            p.intent,
            p.description,
            p.business_domain,
            p.tags,
            p.table_keys,
            p.relation_keys,
            Jsonb(p.path_json),
            p.confidence,
        ),
    )


def _soft_delete_key(cur: psycopg.Cursor, graph_id: UUID, table: str, key_column: str, key: str) -> None:
    cur.execute(
        f"""
        UPDATE {table}
        SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
        WHERE graph_id = %s AND deleted_at IS NULL AND {key_column} = %s
        """,
        (graph_id, key),
    )


def _soft_delete_column(cur: psycopg.Cursor, graph_id: UUID, composite_key: str) -> None:
    parts = composite_key.split(_COMPOSITE_SEP, 1)
    if len(parts) != 2:
        return
    cur.execute(
        """
        UPDATE er_column SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
        WHERE graph_id = %s AND deleted_at IS NULL AND table_key = %s AND column_key = %s
        """,
        (graph_id, parts[0], parts[1]),
    )


def _soft_delete_enum(cur: psycopg.Cursor, graph_id: UUID, composite_key: str) -> None:
    parts = composite_key.split(_COMPOSITE_SEP, 2)
    if len(parts) != 3:
        return
    cur.execute(
        """
        UPDATE er_column_enum_value SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
        WHERE graph_id = %s AND deleted_at IS NULL
          AND table_key = %s AND column_key = %s AND value = %s
        """,
        (graph_id, parts[0], parts[1], parts[2]),
    )


def _row_table(row: dict[str, Any]) -> Table:
    return Table.from_row(row)


def _row_column(row: dict[str, Any]) -> Column:
    return Column.from_row(row)


def _row_enum(row: dict[str, Any]) -> EnumValue:
    return EnumValue.from_row(row)


def _row_relation(row: dict[str, Any]) -> Relation:
    return Relation.from_row(row)


def _row_business_path(row: dict[str, Any]) -> BusinessPath:
    return BusinessPath.from_row(row)


def apply_changes(
    cur: psycopg.Cursor,
    graph_id: UUID,
    changes: GraphChanges,
    *,
    old_state_tables: dict[str, Any],
    old_state_columns: dict[str, Any],
    old_state_enums: dict[str, Any],
    old_state_relations: dict[str, Any],
    old_state_business_paths: dict[str, Any],
    payload: GraphPayload | None = None,
    old_x6_json: dict[str, Any] | None = None,
    old_business_json: list[dict[str, Any]] | None = None,
    client_id: str | None = None,
    user_id: UUID | str | None = None,
    graph_version_before: int,
) -> tuple[int, list[str]]:
    """在同一事务 cursor 内应用变更，返回 (new_version, warnings)。"""
    for row in changes.tables.added + changes.tables.updated:
        _upsert_table(cur, graph_id, _row_table(row))
    for key in changes.tables.deleted:
        _soft_delete_key(cur, graph_id, "er_table", "table_key", key)

    for row in changes.columns.added + changes.columns.updated:
        _upsert_column(cur, graph_id, _row_column(row))
    for key in changes.columns.deleted:
        _soft_delete_column(cur, graph_id, key)

    for row in changes.enums.added + changes.enums.updated:
        _upsert_enum(cur, graph_id, _row_enum(row))
    for key in changes.enums.deleted:
        _soft_delete_enum(cur, graph_id, key)

    for row in changes.relations.added + changes.relations.updated:
        _upsert_relation(cur, graph_id, _row_relation(row))
    for key in changes.relations.deleted:
        _soft_delete_key(cur, graph_id, "er_relation", "relation_key", key)

    for row in changes.business_paths.added + changes.business_paths.updated:
        _upsert_business_path(cur, graph_id, _row_business_path(row))
    for key in changes.business_paths.deleted:
        _soft_delete_key(cur, graph_id, "er_business_path", "path_key", key)

    if payload and (payload.snapshot.nodes or payload.snapshot.edges):
        x6 = {"nodes": payload.snapshot.nodes, "edges": payload.snapshot.edges}
        business_json = payload.legacy_tables or []
        cur.execute(
            """
            INSERT INTO er_graph_snapshot (graph_id, x6_json, business_json, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (graph_id) DO UPDATE SET
                x6_json = EXCLUDED.x6_json,
                business_json = EXCLUDED.business_json,
                version = er_graph_snapshot.version + 1,
                updated_at = NOW()
            """,
            (graph_id, Jsonb(x6), Jsonb(business_json)),
        )

    _log_entity_diffs(cur, graph_id, "table", old_state_tables, changes.tables, client_id, user_id)
    _log_entity_diffs(cur, graph_id, "column", old_state_columns, changes.columns, client_id, user_id)
    _log_entity_diffs(cur, graph_id, "enum", old_state_enums, changes.enums, client_id, user_id)
    _log_entity_diffs(
        cur, graph_id, "relation", old_state_relations, changes.relations, client_id, user_id
    )
    _log_entity_diffs(
        cur,
        graph_id,
        "business_path",
        old_state_business_paths,
        changes.business_paths,
        client_id,
        user_id,
    )

    cur.execute(
        "UPDATE er_graph SET version = version + 1, updated_at = NOW() WHERE id = %s RETURNING version",
        (graph_id,),
    )
    new_version = cur.fetchone()["version"]

    checkpoint = {
        "kind": "checkpoint",
        "operation_source": payload.operation_source if payload else "auto_save",
        "legacy_tables": payload.legacy_tables if payload else old_business_json,
        "x6_json": (
            {"nodes": payload.snapshot.nodes, "edges": payload.snapshot.edges}
            if payload and (payload.snapshot.nodes or payload.snapshot.edges)
            else old_x6_json
        ),
        "summary": changes_summary(changes),
    }
    _log_change(
        cur,
        graph_id=graph_id,
        change_type="checkpoint",
        entity_type="graph",
        entity_key=str(graph_id),
        before_data={"version": graph_version_before},
        after_data=checkpoint,
        client_id=client_id,
        user_id=user_id,
        graph_version=new_version,
    )

    warnings: list[str] = []
    warnings.extend(run_validation(cur, graph_id))
    rebuild_search_documents(cur, graph_id)
    return new_version, warnings
