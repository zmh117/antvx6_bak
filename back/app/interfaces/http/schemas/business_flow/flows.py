"""Business Flow metadata DTOs for the new Business Flow Context."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.interfaces.http.schemas.business_flow.members import BusinessFlowRole


class BusinessFlowCreateRequest(BaseModel):
    code: str = Field(pattern=r"^[a-zA-Z0-9_-]+$", max_length=120)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    product_id: UUID | None = None


class BusinessFlowUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str | None = None


class BusinessFlowMetaResponse(BaseModel):
    id: UUID
    product_id: UUID
    product_code: str | None = None
    product_name: str | None = None
    code: str
    name: str
    description: str | None = None
    status: str
    current_version: int
    updated_at: datetime | None = None
    lane_instance_count: int = 0
    node_count: int = 0
    edge_count: int = 0
    current_user_role: BusinessFlowRole | None = None
