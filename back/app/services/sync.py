"""ER 图同步兼容层（委托 application.GraphSyncService）。"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from app.schemas.graph import NormalizedGraphPayload, SyncResponse
from app.services.agent import rebuild_search_documents, run_validation
from app.services.graph_lock import VersionConflictError, lock_graph

__all__ = ["VersionConflictError", "apply_full_sync", "apply_full_sync_legacy"]


def apply_full_sync(
    conn: psycopg.Connection,
    payload: NormalizedGraphPayload,
    *,
    user_id: UUID | str | None = None,
) -> SyncResponse:
    from app.application.graph_sync import graph_sync_service

    return graph_sync_service.sync_payload(conn, payload, user_id=user_id)


def apply_full_sync_legacy(conn: psycopg.Connection, payload: NormalizedGraphPayload) -> SyncResponse:
    """全量 upsert（无 diff）；保留供对照或紧急回退。"""
    warnings: list[str] = []
    graph_id = payload.graph_id
    _COMPOSITE_SEP = "::"

    def _soft_delete_missing(
        cur: psycopg.Cursor,
        table: str,
        key_column: str,
        keep_keys: set[str],
    ) -> None:
        if not keep_keys:
            cur.execute(
                f"UPDATE {table} SET deleted_at = NOW(), version = version + 1, updated_at = NOW() "
                f"WHERE graph_id = %s AND deleted_at IS NULL",
                (graph_id,),
            )
            return
        cur.execute(
            f"UPDATE {table} SET deleted_at = NOW(), version = version + 1, updated_at = NOW() "
            f"WHERE graph_id = %s AND deleted_at IS NULL AND {key_column} <> ALL(%s)",
            (graph_id, list(keep_keys)),
        )

    with conn.transaction():
        with conn.cursor() as cur:
            graph = lock_graph(cur, graph_id)
            if payload.base_version is not None and payload.base_version != graph["version"]:
                raise VersionConflictError(payload.base_version, graph["version"])

            table_keys = {t.table_key for t in payload.tables}
            column_keys = {f"{c.table_key}{_COMPOSITE_SEP}{c.column_key}" for c in payload.columns}
            enum_keys = {
                f"{e.table_key}{_COMPOSITE_SEP}{e.column_key}{_COMPOSITE_SEP}{e.value}"
                for e in payload.enums
            }
            relation_keys = {r.relation_key for r in payload.relations}
            path_keys = {p.path_key for p in payload.business_paths}

            for t in payload.tables:
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

            for c in payload.columns:
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

            for e in payload.enums:
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

            for r in payload.relations:
                cur.execute(
                    """
                    INSERT INTO er_relation (
                        graph_id, relation_key, source_table_key, source_column_key,
                        target_table_key, target_column_key, relation_type, relationship,
                        cardinality, relation_name, description, join_condition, direction,
                        confidence, source, verified, tags, raw_edge, updated_at, deleted_at
                    ) VALUES (
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NULL
                    )
                    ON CONFLICT (graph_id, relation_key) DO UPDATE SET
                        source_table_key = EXCLUDED.source_table_key,
                        source_column_key = EXCLUDED.source_column_key,
                        target_table_key = EXCLUDED.target_table_key,
                        target_column_key = EXCLUDED.target_column_key,
                        relation_type = EXCLUDED.relation_type,
                        relationship = EXCLUDED.relationship,
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

            for p in payload.business_paths:
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

            _soft_delete_missing(cur, "er_table", "table_key", table_keys)
            if column_keys:
                cur.execute(
                    """
                    UPDATE er_column SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
                    WHERE graph_id = %s AND deleted_at IS NULL
                      AND (table_key || '::' || column_key) <> ALL(%s)
                    """,
                    (graph_id, list(column_keys)),
                )
            else:
                cur.execute(
                    "UPDATE er_column SET deleted_at = NOW() WHERE graph_id = %s AND deleted_at IS NULL",
                    (graph_id,),
                )
            if enum_keys:
                cur.execute(
                    """
                    UPDATE er_column_enum_value SET deleted_at = NOW(), version = version + 1
                    WHERE graph_id = %s AND deleted_at IS NULL
                      AND (table_key || '::' || column_key || '::' || value) <> ALL(%s)
                    """,
                    (graph_id, list(enum_keys)),
                )
            else:
                cur.execute(
                    "UPDATE er_column_enum_value SET deleted_at = NOW() WHERE graph_id = %s AND deleted_at IS NULL",
                    (graph_id,),
                )
            _soft_delete_missing(cur, "er_relation", "relation_key", relation_keys)
            _soft_delete_missing(cur, "er_business_path", "path_key", path_keys)

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

            cur.execute(
                "UPDATE er_graph SET version = version + 1, updated_at = NOW() WHERE id = %s RETURNING version",
                (graph_id,),
            )
            new_version = cur.fetchone()["version"]

            cur.execute(
                """
                INSERT INTO er_change_log (graph_id, change_type, entity_type, entity_key, after_data, client_id, graph_version)
                VALUES (%s, 'full_sync', 'graph', %s, %s, %s, %s)
                """,
                (
                    graph_id,
                    str(graph_id),
                    Jsonb({"tables": len(payload.tables), "relations": len(payload.relations)}),
                    payload.client_id,
                    new_version,
                ),
            )

            warnings.extend(run_validation(cur, graph_id))
            rebuild_search_documents(cur, graph_id)

    return SyncResponse(ok=True, graph_id=graph_id, new_version=new_version, warnings=warnings)
