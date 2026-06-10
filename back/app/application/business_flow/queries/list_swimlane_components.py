from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ListSwimlaneComponentsQuery:
    product_id: UUID
    status: str = "PUBLISHED"
