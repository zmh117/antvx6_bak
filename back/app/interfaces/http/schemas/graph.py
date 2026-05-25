from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EnumValuePayload(BaseModel):
    table_key: str
    column_key: str
    value: str
    label: str
    description: str | None = None
    sort_order: int = 0
    enabled: bool = True
    raw_data: dict[str, Any] = Field(default_factory=dict)


class ColumnPayload(BaseModel):
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
    tags: list[str] = Field(default_factory=list)
    raw_data: dict[str, Any] = Field(default_factory=dict)


class TablePayload(BaseModel):
    table_key: str
    table_name: str
    business_name: str | None = None
    description: str | None = None
    business_domain: str | None = None
    table_type: str = "business"
    importance: int = 3
    tags: list[str] = Field(default_factory=list)
    comment: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    raw_data: dict[str, Any] = Field(default_factory=dict)


class RelationPayload(BaseModel):
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
    tags: list[str] = Field(default_factory=list)
    raw_edge: dict[str, Any] = Field(default_factory=dict)


class BusinessPathPayload(BaseModel):
    path_key: str
    name: str
    intent: str | None = None
    description: str | None = None
    business_domain: str | None = None
    tags: list[str] = Field(default_factory=list)
    table_keys: list[str] = Field(default_factory=list)
    relation_keys: list[str] = Field(default_factory=list)
    path_json: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0


class CanvasSnapshotPayload(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class NormalizedGraphPayload(BaseModel):
    graph_id: UUID
    base_version: int | None = None
    client_id: str | None = None
    operation_source: Literal[
        "manual_save", "auto_save", "undo", "redo", "restore"
    ] = "auto_save"
    tables: list[TablePayload] = Field(default_factory=list)
    columns: list[ColumnPayload] = Field(default_factory=list)
    enums: list[EnumValuePayload] = Field(default_factory=list)
    relations: list[RelationPayload] = Field(default_factory=list)
    business_paths: list[BusinessPathPayload] = Field(default_factory=list)
    snapshot: CanvasSnapshotPayload = Field(default_factory=CanvasSnapshotPayload)
    legacy_tables: list[dict[str, Any]] | None = Field(
        default=None,
        description="Legacy array format for backward compat in business_json",
    )


class EntityDiff(BaseModel):
    added: list[dict[str, Any]] = Field(default_factory=list)
    updated: list[dict[str, Any]] = Field(default_factory=list)
    deleted: list[str] = Field(default_factory=list)


class GraphChangesPayload(BaseModel):
    tables: EntityDiff = Field(default_factory=EntityDiff)
    columns: EntityDiff = Field(default_factory=EntityDiff)
    enums: EntityDiff = Field(default_factory=EntityDiff)
    relations: EntityDiff = Field(default_factory=EntityDiff)
    business_paths: EntityDiff = Field(default_factory=EntityDiff)
    snapshot: CanvasSnapshotPayload | None = None


class SyncChangesRequest(BaseModel):
    graph_id: UUID
    base_version: int
    client_id: str | None = None
    changes: GraphChangesPayload


class SyncFullRequest(BaseModel):
    payload: NormalizedGraphPayload


class GraphMetaResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    business_domain: str | None = None
    version: int
    status: str = "active"


class SyncResponse(BaseModel):
    ok: bool = True
    graph_id: UUID
    new_version: int
    warnings: list[str] = Field(default_factory=list)


class GraphLoadResponse(BaseModel):
    graph: GraphMetaResponse
    snapshot: CanvasSnapshotPayload
    legacy_tables: list[dict[str, Any]] = Field(default_factory=list)
    tables: list[TablePayload] = Field(default_factory=list)
    columns: list[ColumnPayload] = Field(default_factory=list)
    enums: list[EnumValuePayload] = Field(default_factory=list)
    relations: list[RelationPayload] = Field(default_factory=list)
    business_paths: list[BusinessPathPayload] = Field(default_factory=list)


class AgentContextResponse(BaseModel):
    graph_id: UUID
    version: int
    text: str
    documents: list[dict[str, Any]] = Field(default_factory=list)


class ChangeLogEntry(BaseModel):
    id: int
    graph_id: UUID
    change_type: str
    entity_type: str
    entity_key: str
    summary: str
    before_data: dict[str, Any] | None = None
    after_data: dict[str, Any] | None = None
    client_id: str | None = None
    graph_version: int | None = None
    created_at: str


class HistoryResponse(BaseModel):
    graph_id: UUID
    version: int
    entries: list[ChangeLogEntry] = Field(default_factory=list)


class RestoreRequest(BaseModel):
    change_log_id: int


class RestoreResponse(BaseModel):
    ok: bool = True
    graph_id: UUID
    new_version: int
    restored_from: int
