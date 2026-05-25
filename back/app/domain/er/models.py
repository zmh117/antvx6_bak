"""ER 图领域模型（纯 dataclass，无 Pydantic / FastAPI 依赖）。"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from typing import Any
from uuid import UUID


def _filter_fields(cls: type, row: dict[str, Any]) -> dict[str, Any]:
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in row.items() if k in names}


@dataclass(slots=True)
class EnumValue:
    table_key: str
    column_key: str
    value: str
    label: str
    description: str | None = None
    sort_order: int = 0
    enabled: bool = True
    raw_data: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        return {
            "table_key": self.table_key,
            "column_key": self.column_key,
            "value": self.value,
            "label": self.label,
            "description": self.description,
            "sort_order": self.sort_order,
            "enabled": self.enabled,
            "raw_data": self.raw_data,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> EnumValue:
        return cls(**_filter_fields(cls, row))


@dataclass(slots=True)
class Column:
    table_key: str
    column_key: str
    column_name: str
    data_type: str | None = None
    business_name: str | None = None
    description: str | None = None
    comment: str | None = None
    default_value: str | None = None
    nullable: bool | None = None
    is_primary_key: bool = False
    is_unique: bool = False
    is_indexed: bool = False
    key_type: str | None = None
    column_role: str | None = None
    enum_enabled: bool = False
    sort_order: int = 0
    tags: list[str] = field(default_factory=list)
    raw_data: dict[str, Any] = field(default_factory=dict)

    def composite_key(self) -> str:
        return f"{self.table_key}::{self.column_key}"

    def to_row(self) -> dict[str, Any]:
        return {
            "table_key": self.table_key,
            "column_key": self.column_key,
            "column_name": self.column_name,
            "data_type": self.data_type,
            "business_name": self.business_name,
            "description": self.description,
            "comment": self.comment,
            "default_value": self.default_value,
            "nullable": self.nullable,
            "is_primary_key": self.is_primary_key,
            "is_unique": self.is_unique,
            "is_indexed": self.is_indexed,
            "key_type": self.key_type,
            "column_role": self.column_role,
            "enum_enabled": self.enum_enabled,
            "sort_order": self.sort_order,
            "tags": self.tags,
            "raw_data": self.raw_data,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> Column:
        return cls(**_filter_fields(cls, row))


@dataclass(slots=True)
class Table:
    table_key: str
    table_name: str
    business_name: str | None = None
    description: str | None = None
    business_domain: str | None = None
    table_type: str = "business"
    importance: int = 3
    tags: list[str] = field(default_factory=list)
    comment: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        return {
            "table_key": self.table_key,
            "table_name": self.table_name,
            "business_name": self.business_name,
            "description": self.description,
            "business_domain": self.business_domain,
            "table_type": self.table_type,
            "importance": self.importance,
            "tags": self.tags,
            "comment": self.comment,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "raw_data": self.raw_data,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> Table:
        data = _filter_fields(cls, row)
        if "table_name" not in data:
            data["table_name"] = row.get("table_key", "")
        if "importance" in data and data["importance"] is not None:
            data["importance"] = int(data["importance"])
        if data.get("tags") is None:
            data["tags"] = []
        if data.get("raw_data") is None:
            data["raw_data"] = {}
        return cls(**data)


@dataclass(slots=True)
class Relation:
    relation_key: str
    source_table_key: str
    source_column_key: str
    target_table_key: str
    target_column_key: str
    relation_type: str = "logical_relation"
    relationship: str | None = "1:1"
    cardinality: str | None = None
    relation_name: str | None = None
    description: str | None = None
    join_condition: str | None = None
    direction: str = "source_to_target"
    confidence: float = 1.0
    source: str = "manual"
    verified: bool = False
    tags: list[str] = field(default_factory=list)
    raw_edge: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        return {
            "relation_key": self.relation_key,
            "source_table_key": self.source_table_key,
            "source_column_key": self.source_column_key,
            "target_table_key": self.target_table_key,
            "target_column_key": self.target_column_key,
            "relation_type": self.relation_type,
            "relationship": self.relationship,
            "cardinality": self.cardinality,
            "relation_name": self.relation_name,
            "description": self.description,
            "join_condition": self.join_condition,
            "direction": self.direction,
            "confidence": self.confidence,
            "source": self.source,
            "verified": self.verified,
            "tags": self.tags,
            "raw_edge": self.raw_edge,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> Relation:
        data = _filter_fields(cls, row)
        if data.get("confidence") is not None:
            data["confidence"] = float(data["confidence"])
        if data.get("tags") is None:
            data["tags"] = []
        if data.get("raw_edge") is None:
            data["raw_edge"] = {}
        return cls(**data)


@dataclass(slots=True)
class BusinessPath:
    path_key: str
    name: str
    intent: str | None = None
    description: str | None = None
    business_domain: str | None = None
    tags: list[str] = field(default_factory=list)
    table_keys: list[str] = field(default_factory=list)
    relation_keys: list[str] = field(default_factory=list)
    path_json: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0

    def to_row(self) -> dict[str, Any]:
        return {
            "path_key": self.path_key,
            "name": self.name,
            "intent": self.intent,
            "description": self.description,
            "business_domain": self.business_domain,
            "tags": self.tags,
            "table_keys": self.table_keys,
            "relation_keys": self.relation_keys,
            "path_json": self.path_json,
            "confidence": self.confidence,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> BusinessPath:
        data = _filter_fields(cls, row)
        if data.get("confidence") is not None:
            data["confidence"] = float(data["confidence"])
        for key in ("tags", "table_keys", "relation_keys"):
            if data.get(key) is None:
                data[key] = []
        if data.get("path_json") is None:
            data["path_json"] = {}
        return cls(**data)


@dataclass(slots=True)
class CanvasSnapshot:
    nodes: list[dict[str, Any]] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class GraphPayload:
    graph_id: UUID
    base_version: int | None = None
    client_id: str | None = None
    operation_source: str = "auto_save"
    tables: list[Table] = field(default_factory=list)
    columns: list[Column] = field(default_factory=list)
    enums: list[EnumValue] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)
    business_paths: list[BusinessPath] = field(default_factory=list)
    snapshot: CanvasSnapshot = field(default_factory=CanvasSnapshot)
    legacy_tables: list[dict[str, Any]] | None = None


@dataclass(slots=True)
class GraphState:
    tables: dict[str, dict[str, Any]] = field(default_factory=dict)
    columns: dict[str, dict[str, Any]] = field(default_factory=dict)
    enums: dict[str, dict[str, Any]] = field(default_factory=dict)
    relations: dict[str, dict[str, Any]] = field(default_factory=dict)
    business_paths: dict[str, dict[str, Any]] = field(default_factory=dict)
    x6_json: dict[str, Any] = field(default_factory=lambda: {"nodes": [], "edges": []})
    business_json: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class EntityDiff:
    added: list[dict[str, Any]] = field(default_factory=list)
    updated: list[dict[str, Any]] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)


@dataclass(slots=True)
class GraphChanges:
    tables: EntityDiff = field(default_factory=EntityDiff)
    columns: EntityDiff = field(default_factory=EntityDiff)
    enums: EntityDiff = field(default_factory=EntityDiff)
    relations: EntityDiff = field(default_factory=EntityDiff)
    business_paths: EntityDiff = field(default_factory=EntityDiff)
    snapshot: CanvasSnapshot | None = None

    def is_empty(self) -> bool:
        for diff in (
            self.tables,
            self.columns,
            self.enums,
            self.relations,
            self.business_paths,
        ):
            if diff.added or diff.updated or diff.deleted:
                return False
        return True
