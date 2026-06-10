from __future__ import annotations

from typing import Protocol
from uuid import UUID


class CollaborationPort(Protocol):
    def get_document_state(self, owner_type: str, owner_id: UUID) -> bytes | None: ...
