"""业务流程 HTTP 路由。"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.application.business_flow_service import business_flow_service
from app.database import db_transaction, get_connection
from app.domain.business_flow import BusinessFlow, ErBinding
from app.interfaces.http.schemas.business_flow import (
    BusinessFlowBindingPayload,
    BusinessFlowListResponse,
    BusinessFlowPayload,
    BusinessFlowResponse,
)

router = APIRouter(prefix="/graphs/{graph_id}/business-flows", tags=["business-flows"])


def _to_domain(graph_id: UUID, payload: BusinessFlowPayload) -> BusinessFlow:
    return BusinessFlow(
        graph_id=graph_id,
        flow_key=payload.flow_key,
        name=payload.name,
        description=payload.description,
        nodes=payload.nodes,
        edges=payload.edges,
        bindings=[
            ErBinding(
                binding_key=b.binding_key,
                step_key=b.step_key,
                table_key=b.table_key,
                column_key=b.column_key,
                relation_key=b.relation_key,
                usage_type=b.usage_type,
                description=b.description,
            )
            for b in payload.bindings
        ],
    )


def _binding_response(binding: ErBinding) -> BusinessFlowBindingPayload:
    return BusinessFlowBindingPayload(
        binding_key=binding.binding_key,
        step_key=binding.step_key,
        table_key=binding.table_key,
        column_key=binding.column_key,
        relation_key=binding.relation_key,
        usage_type=binding.usage_type,
        description=binding.description,
    )


def _flow_response(row: dict) -> BusinessFlowResponse:
    flow = row["flow"]
    return BusinessFlowResponse(
        graph_id=flow.graph_id,
        flow_key=flow.flow_key,
        name=flow.name,
        description=flow.description,
        nodes=flow.nodes,
        edges=flow.edges,
        bindings=[_binding_response(b) for b in flow.bindings],
        version=row["version"],
    )


@router.get("", response_model=BusinessFlowListResponse)
def list_flows(graph_id: UUID) -> BusinessFlowListResponse:
    with get_connection() as conn:
        rows = business_flow_service.list_flows(conn, graph_id)
    return BusinessFlowListResponse(
        graph_id=graph_id,
        flows=[_flow_response(row) for row in rows],
    )


@router.get("/{flow_key}", response_model=BusinessFlowResponse)
def get_flow(graph_id: UUID, flow_key: str) -> BusinessFlowResponse:
    try:
        with get_connection() as conn:
            row = business_flow_service.get_flow(conn, graph_id, flow_key)
        return _flow_response(row)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{flow_key}", response_model=BusinessFlowResponse)
def put_flow(
    graph_id: UUID,
    flow_key: str,
    body: BusinessFlowPayload,
) -> BusinessFlowResponse:
    body.flow_key = flow_key
    try:
        with db_transaction() as conn:
            row = business_flow_service.save_flow(conn, _to_domain(graph_id, body))
        return _flow_response(row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{flow_key}")
def delete_flow(graph_id: UUID, flow_key: str) -> dict[str, bool]:
    try:
        with db_transaction() as conn:
            return business_flow_service.delete_flow(conn, graph_id, flow_key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
