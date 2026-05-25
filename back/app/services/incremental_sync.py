"""增量同步兼容层（委托 application / infrastructure）。"""

from __future__ import annotations

from uuid import UUID

import psycopg

from app.application.graph_sync import graph_sync_service
from app.application.mappers import changes_from_dto, payload_from_dto
from app.domain.shared.errors import VersionConflictError
from app.infrastructure.db.graph_state_loader import load_graph_state
from app.infrastructure.db.repositories.graph_repository import apply_changes
from app.schemas.graph import GraphChangesPayload, NormalizedGraphPayload, SyncResponse
from app.services.graph_lock import lock_graph

__all__ = [
    "VersionConflictError",
    "apply_incremental_changes",
    "apply_payload_with_diff",
]


def apply_incremental_changes(
    conn: psycopg.Connection,
    graph_id: UUID,
    changes: GraphChangesPayload,
    *,
    payload: NormalizedGraphPayload | None = None,
    client_id: str | None = None,
    base_version: int | None = None,
) -> SyncResponse:
    domain_changes = changes_from_dto(changes)
    domain_payload = payload_from_dto(payload) if payload else None

    with conn.transaction():
        with conn.cursor() as cur:
            meta = lock_graph(cur, graph_id)
            if base_version is not None and base_version != meta["version"]:
                raise VersionConflictError(base_version, meta["version"])
            old_state = load_graph_state(cur, graph_id)
            new_version, warnings = apply_changes(
                cur,
                graph_id,
                domain_changes,
                old_state_tables=old_state.tables,
                old_state_columns=old_state.columns,
                old_state_enums=old_state.enums,
                old_state_relations=old_state.relations,
                old_state_business_paths=old_state.business_paths,
                payload=domain_payload,
                old_x6_json=old_state.x6_json,
                old_business_json=old_state.business_json,
                client_id=client_id,
                graph_version_before=meta["version"],
            )

    return SyncResponse(ok=True, graph_id=graph_id, new_version=new_version, warnings=warnings)


def apply_payload_with_diff(
    conn: psycopg.Connection,
    payload: NormalizedGraphPayload,
) -> SyncResponse:
    return graph_sync_service.sync_payload(conn, payload)
