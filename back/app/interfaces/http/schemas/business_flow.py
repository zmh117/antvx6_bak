"""业务流程 HTTP DTO。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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
