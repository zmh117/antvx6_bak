"""Business Flow HTTP DTOs.

The legacy graph-scoped DTOs stay exported from this package so existing routers
can continue importing `app.interfaces.http.schemas.business_flow`.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.interfaces.http.schemas.business_flow.components import (
    BusinessFlowChangeOpPayload,
    BusinessFlowEditorStateResponse,
    BusinessFlowEdgeDTO,
    BusinessFlowLaneInstanceDTO,
    BusinessFlowNodeDTO,
    BusinessFlowNodeErRefDTO,
    PlaceSwimlaneComponentPayload,
    SwimlaneComponentListItemDTO,
)


class BusinessFlowBindingPayload(BaseModel):
    binding_key: str
    step_key: str
    table_key: str | None = None
    column_key: str | None = None
    relation_key: str | None = None
    usage_type: str = "read"
    description: str | None = None


class BusinessFlowPayload(BaseModel):
    flow_key: str
    name: str
    description: str | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    bindings: list[BusinessFlowBindingPayload] = Field(default_factory=list)


class BusinessFlowResponse(BaseModel):
    graph_id: UUID
    flow_key: str
    name: str
    description: str | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    bindings: list[BusinessFlowBindingPayload] = Field(default_factory=list)
    version: int


class BusinessFlowListResponse(BaseModel):
    graph_id: UUID
    flows: list[BusinessFlowResponse] = Field(default_factory=list)


__all__ = [
    "BusinessFlowBindingPayload",
    "BusinessFlowPayload",
    "BusinessFlowResponse",
    "BusinessFlowListResponse",
    "BusinessFlowChangeOpPayload",
    "BusinessFlowEditorStateResponse",
    "BusinessFlowEdgeDTO",
    "BusinessFlowLaneInstanceDTO",
    "BusinessFlowNodeDTO",
    "BusinessFlowNodeErRefDTO",
    "PlaceSwimlaneComponentPayload",
    "SwimlaneComponentListItemDTO",
]
