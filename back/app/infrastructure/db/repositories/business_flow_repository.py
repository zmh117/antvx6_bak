"""业务流程 Postgres 仓储。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from app.domain.business_flow import BusinessFlow, ErBinding


def _row_to_flow(row: dict[str, Any], binding_rows: list[dict[str, Any]]) -> BusinessFlow:
    flow_json = row.get("flow_json") or {}
    return BusinessFlow(
        graph_id=row["graph_id"],
        flow_key=row["flow_key"],
        name=row["name"],
        description=row.get("description"),
        nodes=flow_json.get("nodes") or [],
        edges=flow_json.get("edges") or [],
        bindings=[
            ErBinding(
                binding_key=b["binding_key"],
                step_key=b["step_key"],
                table_key=b.get("table_key"),
                column_key=b.get("column_key"),
                relation_key=b.get("relation_key"),
                usage_type=b.get("usage_type") or "read",
                description=b.get("description"),
            )
            for b in binding_rows
        ],
    )


def _bindings_for_flows(
    cur: psycopg.Cursor,
    graph_id: UUID,
    flow_keys: list[str],
) -> dict[str, list[dict[str, Any]]]:
    if not flow_keys:
        return {}
    cur.execute(
        """
        SELECT flow_key, binding_key, step_key, table_key, column_key,
               relation_key, usage_type, description
        FROM er_business_flow_er_binding
        WHERE graph_id = %s AND deleted_at IS NULL AND flow_key = ANY(%s)
        ORDER BY flow_key, binding_key
        """,
        (graph_id, flow_keys),
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in cur.fetchall():
        grouped.setdefault(row["flow_key"], []).append(dict(row))
    return grouped


def list_business_flows(cur: psycopg.Cursor, graph_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT graph_id, flow_key, name, description, flow_json, version
        FROM er_business_flow
        WHERE graph_id = %s AND deleted_at IS NULL
        ORDER BY name
        """,
        (graph_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    bindings = _bindings_for_flows(cur, graph_id, [r["flow_key"] for r in rows])
    return [
        {"flow": _row_to_flow(row, bindings.get(row["flow_key"], [])), "version": row["version"]}
        for row in rows
    ]


def get_business_flow(
    cur: psycopg.Cursor,
    graph_id: UUID,
    flow_key: str,
) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT graph_id, flow_key, name, description, flow_json, version
        FROM er_business_flow
        WHERE graph_id = %s AND flow_key = %s AND deleted_at IS NULL
        """,
        (graph_id, flow_key),
    )
    row = cur.fetchone()
    if not row:
        return None
    bindings = _bindings_for_flows(cur, graph_id, [flow_key])
    return {
        "flow": _row_to_flow(dict(row), bindings.get(flow_key, [])),
        "version": row["version"],
    }


def save_business_flow(cur: psycopg.Cursor, flow: BusinessFlow) -> int:
    flow.validate()
    cur.execute(
        """
        INSERT INTO er_business_flow (
            graph_id, flow_key, name, description, flow_json, updated_at, deleted_at
        ) VALUES (%s, %s, %s, %s, %s, NOW(), NULL)
        ON CONFLICT (graph_id, flow_key) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            flow_json = EXCLUDED.flow_json,
            version = er_business_flow.version + 1,
            updated_at = NOW(),
            deleted_at = NULL
        RETURNING version
        """,
        (
            flow.graph_id,
            flow.flow_key,
            flow.name,
            flow.description,
            Jsonb(flow.to_flow_json()),
        ),
    )
    version = cur.fetchone()["version"]

    cur.execute(
        """
        UPDATE er_business_flow_er_binding
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE graph_id = %s AND flow_key = %s AND deleted_at IS NULL
        """,
        (flow.graph_id, flow.flow_key),
    )
    for binding in flow.bindings:
        cur.execute(
            """
            INSERT INTO er_business_flow_er_binding (
                graph_id, flow_key, binding_key, step_key, table_key, column_key,
                relation_key, usage_type, description, updated_at, deleted_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NULL)
            ON CONFLICT (graph_id, flow_key, binding_key) DO UPDATE SET
                step_key = EXCLUDED.step_key,
                table_key = EXCLUDED.table_key,
                column_key = EXCLUDED.column_key,
                relation_key = EXCLUDED.relation_key,
                usage_type = EXCLUDED.usage_type,
                description = EXCLUDED.description,
                updated_at = NOW(),
                deleted_at = NULL
            """,
            (
                flow.graph_id,
                flow.flow_key,
                binding.binding_key,
                binding.step_key,
                binding.table_key,
                binding.column_key,
                binding.relation_key,
                binding.usage_type,
                binding.description,
            ),
        )
    return version


def soft_delete_business_flow(cur: psycopg.Cursor, graph_id: UUID, flow_key: str) -> bool:
    cur.execute(
        """
        UPDATE er_business_flow
        SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
        WHERE graph_id = %s AND flow_key = %s AND deleted_at IS NULL
        """,
        (graph_id, flow_key),
    )
    deleted = cur.rowcount > 0
    cur.execute(
        """
        UPDATE er_business_flow_er_binding
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE graph_id = %s AND flow_key = %s AND deleted_at IS NULL
        """,
        (graph_id, flow_key),
    )
    return deleted
