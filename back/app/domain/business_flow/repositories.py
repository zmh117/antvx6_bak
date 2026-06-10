"""Repository ports for the new Business Flow Context."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.domain.business_flow.entities import (
    BusinessFlowModel,
    CollabDocument,
    SwimlaneComponent,
    SwimlaneComponentVersion,
)


class ProductRepository(Protocol):
    def exists(self, product_id: UUID) -> bool: ...


class SwimlaneComponentRepository(Protocol):
    def get(self, component_id: UUID) -> SwimlaneComponent | None: ...

    def get_version(self, component_version_id: UUID) -> SwimlaneComponentVersion | None: ...


class BusinessFlowRepository(Protocol):
    def get(self, business_flow_id: UUID) -> BusinessFlowModel | None: ...


class BusinessFlowHistoryRepository(Protocol):
    def append_change_batch(self, business_flow_id: UUID, summary: str | None = None) -> None: ...


class CollaborationDocumentRepository(Protocol):
    def get_by_owner(self, owner_type: str, owner_id: UUID) -> CollabDocument | None: ...
