from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CreateSwimlaneComponentCommand:
    product_id: UUID
    code: str
    name: str
    category: str | None = None
    owner_role: str | None = None
    description: str | None = None
    created_by: str | None = None
