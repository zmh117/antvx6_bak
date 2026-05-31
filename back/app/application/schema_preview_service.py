"""数据库结构预览应用服务。"""

from __future__ import annotations

from uuid import UUID

import psycopg

from app.application.database_connection_service import database_connection_service
from app.domain.er_import import TablePreview
from app.infrastructure.schema_inspection import SchemaInspectorFactory


class SchemaPreviewService:
    def preview_tables(
        self,
        conn: psycopg.Connection,
        connection_id: UUID,
    ) -> list[TablePreview]:
        with conn.cursor() as cur:
            db_conn = database_connection_service.get_connection(cur, connection_id)
        return SchemaInspectorFactory().create(db_conn).preview_tables()


schema_preview_service = SchemaPreviewService()
