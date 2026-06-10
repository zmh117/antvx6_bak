"""Business Flow member and sharing DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

BusinessFlowRole = Literal["owner", "editor", "viewer"]


class BusinessFlowMemberUpsertRequest(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: BusinessFlowRole


class BusinessFlowMemberResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: BusinessFlowRole
    created_at: datetime
    is_creator: bool = False
