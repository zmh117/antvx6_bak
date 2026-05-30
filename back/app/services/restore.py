"""从 checkpoint 恢复图（委托 GraphSyncService）。"""

from __future__ import annotations

from uuid import UUID

import psycopg

from app.application.graph_sync import graph_sync_service
from app.schemas.graph import CanvasSnapshotPayload, RestoreResponse
from app.services.normalize import normalize_legacy_tables_array


def restore_from_change_log(
    conn: psycopg.Connection,
    graph_id: UUID,
    change_log_id: int,
    *,
    client_id: str | None = "restore",
    user_id: UUID | str | None = None,
) -> RestoreResponse:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, change_type, after_data, graph_version
            FROM er_change_log
            WHERE id = %s AND graph_id = %s
            """,
            (change_log_id, graph_id),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"change_log not found: {change_log_id}")
        if row["change_type"] != "checkpoint":
            raise ValueError("只能恢复到 checkpoint 类型的历史记录")
        after = row["after_data"] or {}
        legacy = after.get("legacy_tables") or []
        x6 = after.get("x6_json") or {"nodes": [], "edges": []}
        if not legacy:
            raise ValueError("checkpoint 缺少 legacy_tables，无法恢复")

        cur.execute("SELECT version FROM er_graph WHERE id = %s", (graph_id,))
        current_version = cur.fetchone()["version"]

    snap_nodes = x6.get("nodes") or []
    snap_edges = x6.get("edges") or []
    payload = normalize_legacy_tables_array(
        graph_id,
        legacy,
        snapshot=CanvasSnapshotPayload(nodes=snap_nodes, edges=snap_edges),
        base_version=current_version,
    )
    payload.client_id = client_id

    result = graph_sync_service.sync_payload(conn, payload, user_id=user_id)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM er_yjs_update WHERE graph_id = %s", (graph_id,))
        cur.execute("DELETE FROM er_yjs_doc WHERE graph_id = %s", (graph_id,))
    return RestoreResponse(
        ok=True,
        graph_id=graph_id,
        new_version=result.new_version,
        restored_from=change_log_id,
    )
