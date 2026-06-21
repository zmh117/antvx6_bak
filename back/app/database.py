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
            collab_revision_sql = (migrations_dir / "006_collab_revision.sql").read_text(
                encoding="utf-8"
            )
            cur.execute(collab_revision_sql)
            relation_match_operator_sql = (
                migrations_dir / "007_relation_match_operator.sql"
            ).read_text(encoding="utf-8")
            cur.execute(relation_match_operator_sql)
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
            business_flow_components_sql = (
                migrations_dir / "008_business_flow_components.sql"
            ).read_text(encoding="utf-8")
            cur.execute(business_flow_components_sql)
            business_flow_members_sql = (
                migrations_dir / "009_business_flow_members.sql"
            ).read_text(encoding="utf-8")
            cur.execute(business_flow_members_sql)
            product_members_sql = (migrations_dir / "010_product_members.sql").read_text(
                encoding="utf-8"
            )
            cur.execute(product_members_sql)
            business_flow_collab_revision_sql = (
                migrations_dir / "011_business_flow_collab_revision.sql"
            ).read_text(encoding="utf-8")
            cur.execute(business_flow_collab_revision_sql)
            swimlane_component_er_refs_sql = (
                migrations_dir / "012_swimlane_component_node_er_ref.sql"
            ).read_text(encoding="utf-8")
            cur.execute(swimlane_component_er_refs_sql)
            collab_update_audit_sql = (
                migrations_dir / "013_collab_update_audit.sql"
            ).read_text(encoding="utf-8")
            cur.execute(collab_update_audit_sql)
            bpmn_mes_semantics_sql = (
                migrations_dir / "014_bpmn_mes_semantics.sql"
            ).read_text(encoding="utf-8")
            cur.execute(bpmn_mes_semantics_sql)
            database_connection_service.seed_env_target_connection(cur)
        conn.commit()
