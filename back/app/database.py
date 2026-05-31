from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.application.database_connection_service import database_connection_service


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


@contextmanager
def db_transaction() -> Iterator[psycopg.Connection]:
    conn = get_connection()
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()


def run_migrations() -> None:
    """执行本地 API 需要的幂等 migration。"""
    migrations_dir = Path(__file__).resolve().parent.parent / "migrations"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.er_graph') AS reg")
            fresh = not cur.fetchone()["reg"]
            if fresh:
                schema_sql = (migrations_dir / "001_schema.sql").read_text(encoding="utf-8")
                cur.execute(schema_sql)
            comments_sql = (migrations_dir / "002_comments.sql").read_text(encoding="utf-8")
            cur.execute(comments_sql)
            business_flows_sql = (migrations_dir / "003_business_flows.sql").read_text(
                encoding="utf-8"
            )
            cur.execute(business_flows_sql)
            collaboration_sql = (migrations_dir / "004_collaboration_users.sql").read_text(
                encoding="utf-8"
            )
            cur.execute(collaboration_sql)
            database_connections_sql = (
                migrations_dir / "005_database_connections.sql"
            ).read_text(encoding="utf-8")
            cur.execute(database_connections_sql)
            database_connection_service.seed_env_target_connection(cur)
        conn.commit()
