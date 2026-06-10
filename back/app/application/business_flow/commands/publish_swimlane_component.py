from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class PublishSwimlaneComponentVersionCommand:
    component_id: UUID
    canvas_json: dict[str, Any] = field(default_factory=dict)
    semantic_json: dict[str, Any] = field(default_factory=dict)
    version_name: str | None = None
    thumbnail_url: str | None = None
    checksum: str | None = None
    created_by: str | None = None
