"""ER 数据库导入应用服务。"""

from __future__ import annotations

from uuid import UUID

import psycopg

from app.application.database_connection_service import database_connection_service
from app.domain.er import ErGraph
from app.domain.er.diff import compute_graph_diff
from app.domain.er_import import ImportMode, build_import_payload
from app.infrastructure.db.graph_state_loader import load_graph_state
from app.infrastructure.db.repositories.graph_repository import apply_changes
from app.infrastructure.schema_inspection import SchemaInspectorFactory
from app.schemas.graph import SyncResponse
from app.services.graph_lock import lock_graph


class ErImportService:
    def import_database(
        self,
        conn: psycopg.Connection,
        *,
        graph_id: UUID,
        connection_id: UUID,
        mode: ImportMode,
        selected_tables: set[str],
        user_id: UUID | str | None,
    ) -> SyncResponse:
        with conn.cursor() as cur:
            db_conn = database_connection_service.get_connection(cur, connection_id)
            inspector = SchemaInspectorFactory().create(db_conn)
            imported = inspector.inspect_schema(selected_tables)

            meta = lock_graph(cur, graph_id)
            old_state = load_graph_state(cur, graph_id)
            payload = build_import_payload(
                graph_id=graph_id,
                old_state=old_state,
                schema=imported,
                mode=mode,
                selected_table_names=selected_tables,
                client_id=str(user_id) if user_id else "database-import",
            )
            graph = ErGraph.from_state(graph_id, meta["version"], old_state)
            changes = compute_graph_diff(graph.state, payload)

            if changes.is_empty():
                cur.execute(
                    "UPDATE er_graph SET source_connection_id = %s, updated_at = NOW() WHERE id = %s",
                    (connection_id, graph_id),
                )
                return SyncResponse(ok=True, graph_id=graph_id, new_version=meta["version"], warnings=[])

            new_version, warnings = apply_changes(
                cur,
                graph_id,
                changes,
                old_state_tables=old_state.tables,
                old_state_columns=old_state.columns,
                old_state_enums=old_state.enums,
                old_state_relations=old_state.relations,
                old_state_business_paths=old_state.business_paths,
                payload=payload,
                old_x6_json=old_state.x6_json,
                old_business_json=old_state.business_json,
                client_id="database-import",
                user_id=user_id,
                graph_version_before=meta["version"],
            )
            cur.execute(
                "UPDATE er_graph SET source_connection_id = %s, updated_at = NOW() WHERE id = %s",
                (connection_id, graph_id),
            )
            cur.execute("DELETE FROM er_yjs_update WHERE graph_id = %s", (graph_id,))
            cur.execute("DELETE FROM er_yjs_doc WHERE graph_id = %s", (graph_id,))
            return SyncResponse(ok=True, graph_id=graph_id, new_version=new_version, warnings=warnings)


er_import_service = ErImportService()
