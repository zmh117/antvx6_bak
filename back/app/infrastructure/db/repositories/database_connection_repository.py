"""数据库连接配置仓储。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.domain.database_connection import DatabaseConnection, DatabaseType
from app.infrastructure.security import ConnectionCrypto


def _row_to_connection(row: dict[str, Any], crypto: ConnectionCrypto) -> DatabaseConnection:
    password = crypto.decrypt(row.get("password_ciphertext")) or row.get("password_ref")
    return DatabaseConnection(
        id=row["id"],
        connection_key=row["connection_key"],
        name=row["name"],
        db_type=DatabaseType(row["db_type"]),
        host=row["host"],
        port=int(row["port"]),
        database_name=row["database_name"],
        schema_name=row.get("schema_name"),
        username=row["username"],
        password=password,
        status=row["status"],
    )


class DatabaseConnectionRepository:
    def __init__(self, crypto: ConnectionCrypto) -> None:
        self._crypto = crypto

    def list(self, cur: psycopg.Cursor) -> list[DatabaseConnection]:
        cur.execute(
            """
            SELECT id, connection_key, name, db_type, host, port, database_name,
                   schema_name, username, password_ciphertext, password_ref, status
            FROM er_database_connection
            ORDER BY name
            """
        )
        return [_row_to_connection(dict(row), self._crypto) for row in cur.fetchall()]

    def get(self, cur: psycopg.Cursor, connection_id: UUID) -> DatabaseConnection:
        cur.execute(
            """
            SELECT id, connection_key, name, db_type, host, port, database_name,
                   schema_name, username, password_ciphertext, password_ref, status
            FROM er_database_connection WHERE id = %s
            """,
            (connection_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"database connection not found: {connection_id}")
        return _row_to_connection(dict(row), self._crypto)

    def create(self, cur: psycopg.Cursor, conn: DatabaseConnection) -> DatabaseConnection:
        cur.execute(
            """
            INSERT INTO er_database_connection (
                connection_key, name, db_type, host, port, database_name,
                schema_name, username, password_ciphertext, status
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                conn.connection_key,
                conn.name,
                conn.db_type.value,
                conn.host,
                conn.port,
                conn.database_name,
                conn.schema_name,
                conn.username,
                self._crypto.encrypt(conn.password),
                conn.status,
            ),
        )
        conn.id = cur.fetchone()["id"]
        return conn

    def update(self, cur: psycopg.Cursor, connection_id: UUID, conn: DatabaseConnection) -> DatabaseConnection:
        password_sql = "password_ciphertext = COALESCE(%s, password_ciphertext),"
        cur.execute(
            f"""
            UPDATE er_database_connection SET
                name = %s,
                db_type = %s,
                host = %s,
                port = %s,
                database_name = %s,
                schema_name = %s,
                username = %s,
                {password_sql}
                status = %s,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id
            """,
            (
                conn.name,
                conn.db_type.value,
                conn.host,
                conn.port,
                conn.database_name,
                conn.schema_name,
                conn.username,
                self._crypto.encrypt(conn.password),
                conn.status,
                connection_id,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"database connection not found: {connection_id}")
        conn.id = row["id"]
        return conn

    def upsert_env_seed(self, cur: psycopg.Cursor, conn: DatabaseConnection) -> None:
        cur.execute(
            """
            INSERT INTO er_database_connection (
                connection_key, name, db_type, host, port, database_name,
                schema_name, username, password_ref, status
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (connection_key) DO UPDATE SET
                name = EXCLUDED.name,
                db_type = EXCLUDED.db_type,
                host = EXCLUDED.host,
                port = EXCLUDED.port,
                database_name = EXCLUDED.database_name,
                schema_name = EXCLUDED.schema_name,
                username = EXCLUDED.username,
                password_ref = EXCLUDED.password_ref,
                status = EXCLUDED.status,
                updated_at = NOW()
            """,
            (
                conn.connection_key,
                conn.name,
                conn.db_type.value,
                conn.host,
                conn.port,
                conn.database_name,
                conn.schema_name,
                conn.username,
                conn.password,
                conn.status,
            ),
        )
