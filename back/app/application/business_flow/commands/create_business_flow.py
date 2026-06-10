from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CreateBusinessFlowCommand:
    product_id: UUID
    name: str
    code: str
    description: str | None = None
    created_by: str | None = None
