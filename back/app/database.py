from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.application.database_connection_service import database_connection_service

BASELINE_MIGRATION = "001_baseline.sql"


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
    """对空库执行基线 schema；已有库跳过结构初始化。"""
    migrations_dir = Path(__file__).resolve().parent.parent / "migrations"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.er_graph') AS reg")
            fresh = not cur.fetchone()["reg"]
            if fresh:
                baseline_sql = (migrations_dir / BASELINE_MIGRATION).read_text(
                    encoding="utf-8"
                )
                cur.execute(baseline_sql)
            database_connection_service.seed_env_target_connection(cur)
        conn.commit()
