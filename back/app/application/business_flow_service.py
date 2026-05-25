"""业务流程应用服务。"""

from __future__ import annotations

from uuid import UUID

import psycopg

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

    def save_flow(self, conn: psycopg.Connection, flow: BusinessFlow) -> dict:
        with conn.cursor() as cur:
            version = save_business_flow(cur, flow)
        return {"flow": flow, "version": version}

    def delete_flow(self, conn: psycopg.Connection, graph_id: UUID, flow_key: str) -> dict[str, bool]:
        with conn.cursor() as cur:
            deleted = soft_delete_business_flow(cur, graph_id, flow_key)
        if not deleted:
            raise ValueError(f"business flow not found: {flow_key}")
        return {"ok": True}


business_flow_service = BusinessFlowService()
