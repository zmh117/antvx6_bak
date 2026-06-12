from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


ProductRole = Literal["owner", "editor", "viewer"]


class ProductCreateRequest(BaseModel):
    code: str = Field(pattern=r"^[a-zA-Z0-9_-]+$", max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class ProductUpdateRequest(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]+$", max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str | None = None


class ProductMetaResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    current_user_role: ProductRole | None = None
    er_graph_count: int = 0
    business_flow_count: int = 0
    swimlane_component_count: int = 0


class ProductMemberUpsertRequest(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: ProductRole


class ProductMemberResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: ProductRole
    created_at: datetime
    is_creator: bool = False
