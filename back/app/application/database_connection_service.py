"""数据库连接应用服务。"""

from __future__ import annotations

from uuid import UUID, uuid4

import psycopg

from app.config import get_settings
from app.domain.database_connection import DatabaseConnection, DatabaseType
from app.infrastructure.db.repositories.database_connection_repository import (
    DatabaseConnectionRepository,
)
from app.infrastructure.schema_inspection import SchemaInspectorFactory
from app.infrastructure.security import ConnectionCrypto


def _repo() -> DatabaseConnectionRepository:
    return DatabaseConnectionRepository(ConnectionCrypto(get_settings().connection_secret_key))


class DatabaseConnectionService:
    def list_connections(self, conn: psycopg.Connection) -> list[DatabaseConnection]:
        with conn.cursor() as cur:
            return _repo().list(cur)

    def get_connection(self, cur: psycopg.Cursor, connection_id: UUID) -> DatabaseConnection:
        return _repo().get(cur, connection_id)

    def create_connection(self, conn: psycopg.Connection, data: DatabaseConnection) -> DatabaseConnection:
        if not data.connection_key:
            data.connection_key = f"{data.db_type.value}-{uuid4()}"
        with conn.cursor() as cur:
            return _repo().create(cur, data)

    def update_connection(
        self,
        conn: psycopg.Connection,
        connection_id: UUID,
        data: DatabaseConnection,
    ) -> DatabaseConnection:
        with conn.cursor() as cur:
            return _repo().update(cur, connection_id, data)

    def test_connection(self, conn: psycopg.Connection, connection_id: UUID) -> None:
        with conn.cursor() as cur:
            db_conn = _repo().get(cur, connection_id)
        SchemaInspectorFactory().create(db_conn).test()

    def seed_env_target_connection(self, cur: psycopg.Cursor) -> None:
        settings = get_settings()
        if not settings.target_database_host or not settings.target_database_db:
            return
        data = DatabaseConnection(
            id=None,
            connection_key="env-target-database",
            name="Env Target Database",
            db_type=DatabaseType(settings.target_database_type),
            host=settings.target_database_host,
            port=settings.target_database_port,
            database_name=settings.target_database_db,
            schema_name=settings.target_database_schema or settings.target_database_db,
            username=settings.target_database_user,
            password=settings.target_database_password,
            status="active",
        )
        _repo().upsert_env_seed(cur, data)


database_connection_service = DatabaseConnectionService()
