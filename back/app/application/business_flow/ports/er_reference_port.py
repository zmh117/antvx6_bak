from __future__ import annotations

from typing import Protocol
from uuid import UUID


class ErReferencePort(Protocol):
    def table_exists(self, er_diagram_id: UUID, er_table_key: str) -> bool: ...

    def column_exists(self, er_diagram_id: UUID, er_table_key: str, er_column_key: str) -> bool: ...
