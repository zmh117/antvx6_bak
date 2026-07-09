from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.application.database_connection_service import database_connection_service

BASE_MIGRATIONS = (
    "002_comments.sql",
    "003_business_flows.sql",
    "004_collaboration_users.sql",
    "005_database_connections.sql",
    "006_collab_revision.sql",
    "007_relation_match_operator.sql",
    "008_business_flow_components.sql",
    "009_business_flow_members.sql",
    "010_product_members.sql",
    "011_business_flow_collab_revision.sql",
    "012_swimlane_component_node_er_ref.sql",
    "013_collab_update_audit.sql",
)

BPMN_MIGRATIONS = (
    "015_bpmn_generalization_cleanup.sql",
    "016_business_semantic_profile.sql",
    "017_bpmn_task_ui_process_container.sql",
    "018_bpmn_non_task_semantics.sql",
    "019_bpmn_schema_cleanup.sql",
    "020_schema_comments.sql",
)


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
            for migration_name in BASE_MIGRATIONS:
                cur.execute(
                    (migrations_dir / migration_name).read_text(encoding="utf-8")
                )
            cur.execute("SELECT to_regclass('public.app_migration_state') AS reg")
            migration_state_exists = bool(cur.fetchone()["reg"])
            bpmn_cleanup_applied = False
            if migration_state_exists:
                cur.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM app_migration_state
                        WHERE migration_key = '015_bpmn_generalization_cleanup'
                    ) AS applied
                    """
                )
                bpmn_cleanup_applied = bool(cur.fetchone()["applied"])
            if not bpmn_cleanup_applied:
                bpmn_semantics_sql = (
                    migrations_dir / "014_bpmn_mes_semantics.sql"
                ).read_text(encoding="utf-8")
                cur.execute(bpmn_semantics_sql)
            for migration_name in BPMN_MIGRATIONS:
                cur.execute(
                    (migrations_dir / migration_name).read_text(encoding="utf-8")
                )
            database_connection_service.seed_env_target_connection(cur)
        conn.commit()
