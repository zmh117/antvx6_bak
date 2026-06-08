"""业务流程应用服务。"""

from __future__ import annotations

from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from app.domain.business_flow import BusinessFlow
from app.infrastructure.db.repositories.business_flow_repository import (
    get_business_flow,
    list_business_flows,
    save_business_flow,
    soft_delete_business_flow,
)


class BusinessFlowService:
    def list_flows(self, conn: psycopg.Connection, graph_id: UUID) -> list[dict]:
        with conn.cursor() as cur:
            return list_business_flows(cur, graph_id)

    def get_flow(self, conn: psycopg.Connection, graph_id: UUID, flow_key: str) -> dict:
        with conn.cursor() as cur:
            row = get_business_flow(cur, graph_id, flow_key)
        if not row:
            raise ValueError(f"business flow not found: {flow_key}")
        return row

    def save_flow(
        self,
        conn: psycopg.Connection,
        flow: BusinessFlow,
        *,
        user_id: UUID | str | None = None,
    ) -> dict:
        with conn.cursor() as cur:
            self._validate_er_references(cur, flow)
            before = get_business_flow(cur, flow.graph_id, flow.flow_key)
            version = save_business_flow(cur, flow)
            self._write_change_log(cur, flow, before, version, user_id=user_id)
        return {"flow": flow, "version": version}

    def delete_flow(self, conn: psycopg.Connection, graph_id: UUID, flow_key: str) -> dict[str, bool]:
        with conn.cursor() as cur:
            deleted = soft_delete_business_flow(cur, graph_id, flow_key)
        if not deleted:
            raise ValueError(f"business flow not found: {flow_key}")
        return {"ok": True}

    def _validate_er_references(self, cur: psycopg.Cursor, flow: BusinessFlow) -> None:
        flow.validate()
        table_keys = {b.table_key for b in flow.bindings if b.table_key}
        column_keys = {
            (b.table_key, b.column_key)
            for b in flow.bindings
            if b.table_key and b.column_key
        }
        relation_keys = {b.relation_key for b in flow.bindings if b.relation_key}

        if table_keys:
            cur.execute(
                """
                SELECT table_key
                FROM er_table
                WHERE graph_id = %s AND deleted_at IS NULL AND table_key = ANY(%s)
                """,
                (flow.graph_id, list(table_keys)),
            )
            found = {row["table_key"] for row in cur.fetchall()}
            missing = sorted(table_keys - found)
            if missing:
                raise ValueError(f"business flow binding table not found: {', '.join(missing)}")

        if column_keys:
            cur.execute(
                """
                SELECT table_key, column_key
                FROM er_column
                WHERE graph_id = %s AND deleted_at IS NULL
                  AND table_key = ANY(%s)
                """,
                (flow.graph_id, list({table for table, _ in column_keys})),
            )
            found = {(row["table_key"], row["column_key"]) for row in cur.fetchall()}
            missing = sorted(f"{table}.{column}" for table, column in column_keys - found)
            if missing:
                raise ValueError(f"business flow binding column not found: {', '.join(missing)}")

        if relation_keys:
            cur.execute(
                """
                SELECT relation_key
                FROM er_relation
                WHERE graph_id = %s AND deleted_at IS NULL AND relation_key = ANY(%s)
                """,
                (flow.graph_id, list(relation_keys)),
            )
            found = {row["relation_key"] for row in cur.fetchall()}
            missing = sorted(relation_keys - found)
            if missing:
                raise ValueError(f"business flow binding relation not found: {', '.join(missing)}")

    def _flow_payload(self, row: dict | None) -> dict | None:
        if not row:
            return None
        flow: BusinessFlow = row["flow"]
        return {
            "flow_key": flow.flow_key,
            "name": flow.name,
            "description": flow.description,
            "nodes": flow.nodes,
            "edges": flow.edges,
            "bindings": [
                {
                    "binding_key": binding.binding_key,
                    "step_key": binding.step_key,
                    "table_key": binding.table_key,
                    "column_key": binding.column_key,
                    "relation_key": binding.relation_key,
                    "usage_type": binding.usage_type,
                    "description": binding.description,
                }
                for binding in flow.bindings
            ],
            "version": row.get("version"),
        }

    def _write_change_log(
        self,
        cur: psycopg.Cursor,
        flow: BusinessFlow,
        before: dict | None,
        version: int,
        *,
        user_id: UUID | str | None,
    ) -> None:
        before_payload = self._flow_payload(before)
        after_payload = {
            "flow_key": flow.flow_key,
            "name": flow.name,
            "description": flow.description,
            "nodes": flow.nodes,
            "edges": flow.edges,
            "bindings": [
                {
                    "binding_key": binding.binding_key,
                    "step_key": binding.step_key,
                    "table_key": binding.table_key,
                    "column_key": binding.column_key,
                    "relation_key": binding.relation_key,
                    "usage_type": binding.usage_type,
                    "description": binding.description,
                }
                for binding in flow.bindings
            ],
            "version": version,
        }
        cur.execute(
            """
            INSERT INTO er_change_log (
                graph_id, change_type, entity_type, entity_key,
                before_data, after_data, client_id, user_id, graph_version
            )
            VALUES (%s, %s, 'business_flow', %s, %s, %s, 'business-flow-editor', %s, %s)
            """,
            (
                flow.graph_id,
                "upsert" if before_payload else "create",
                flow.flow_key,
                Jsonb(before_payload) if before_payload is not None else None,
                Jsonb(after_payload),
                str(user_id) if user_id else None,
                version,
            ),
        )


business_flow_service = BusinessFlowService()
