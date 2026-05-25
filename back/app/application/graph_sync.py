"""ER 图同步应用服务。"""

from __future__ import annotations

from uuid import UUID

import psycopg

from app.application.mappers import changes_from_dto, payload_from_dto
from app.domain.er import ErGraph
from app.domain.shared.errors import VersionConflictError
from app.infrastructure.db.graph_state_loader import load_graph_state
from app.infrastructure.db.repositories.graph_repository import apply_changes
from app.schemas.graph import GraphChangesPayload, NormalizedGraphPayload, SyncResponse
from app.services.graph_lock import lock_graph


class GraphSyncService:
    def sync_payload(
        self,
        conn: psycopg.Connection,
        dto: NormalizedGraphPayload,
    ) -> SyncResponse:
        incoming = payload_from_dto(dto)
        graph_id = incoming.graph_id

        with conn.transaction():
            with conn.cursor() as cur:
                meta = lock_graph(cur, graph_id)
                if (
                    incoming.base_version is not None
                    and incoming.base_version != meta["version"]
                ):
                    raise VersionConflictError(incoming.base_version, meta["version"])

                old_state = load_graph_state(cur, graph_id)
                graph = ErGraph.from_state(graph_id, meta["version"], old_state)
                merged = graph.merge_incoming(incoming)
                changes = graph.plan_changes(merged)

                if changes.is_empty():
                    return SyncResponse(
                        ok=True,
                        graph_id=graph_id,
                        new_version=meta["version"],
                        warnings=[],
                    )

                new_version, warnings = apply_changes(
                    cur,
                    graph_id,
                    changes,
                    old_state_tables=old_state.tables,
                    old_state_columns=old_state.columns,
                    old_state_enums=old_state.enums,
                    old_state_relations=old_state.relations,
                    old_state_business_paths=old_state.business_paths,
                    payload=merged,
                    old_x6_json=old_state.x6_json,
                    old_business_json=old_state.business_json,
                    client_id=incoming.client_id,
                    graph_version_before=meta["version"],
                )

        return SyncResponse(
            ok=True,
            graph_id=graph_id,
            new_version=new_version,
            warnings=warnings,
        )

    def sync_changes(
        self,
        conn: psycopg.Connection,
        graph_id: UUID,
        dto_changes: GraphChangesPayload,
        *,
        base_version: int | None,
        client_id: str | None,
    ) -> SyncResponse:
        changes = changes_from_dto(dto_changes)

        with conn.transaction():
            with conn.cursor() as cur:
                meta = lock_graph(cur, graph_id)
                if base_version is not None and base_version != meta["version"]:
                    raise VersionConflictError(base_version, meta["version"])

                old_state = load_graph_state(cur, graph_id)
                new_version, warnings = apply_changes(
                    cur,
                    graph_id,
                    changes,
                    old_state_tables=old_state.tables,
                    old_state_columns=old_state.columns,
                    old_state_enums=old_state.enums,
                    old_state_relations=old_state.relations,
                    old_state_business_paths=old_state.business_paths,
                    payload=None,
                    old_x6_json=old_state.x6_json,
                    old_business_json=old_state.business_json,
                    client_id=client_id,
                    graph_version_before=meta["version"],
                )

        return SyncResponse(
            ok=True,
            graph_id=graph_id,
            new_version=new_version,
            warnings=warnings,
        )


graph_sync_service = GraphSyncService()
