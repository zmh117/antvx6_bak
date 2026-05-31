from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


DatabaseTypeLiteral = Literal["mysql", "oracle", "sqlserver"]
ImportModeLiteral = Literal["overwrite", "incremental"]


class DatabaseConnectionCreate(BaseModel):
    name: str
    db_type: DatabaseTypeLiteral
    host: str
    port: int
    database_name: str
    schema_name: str | None = None
    username: str
    password: str | None = None
    connection_key: str | None = None
    status: Literal["active", "disabled"] = "active"


class DatabaseConnectionUpdate(BaseModel):
    name: str
    db_type: DatabaseTypeLiteral
    host: str
    port: int
    database_name: str
    schema_name: str | None = None
    username: str
    password: str | None = None
    status: Literal["active", "disabled"] = "active"


class DatabaseConnectionResponse(BaseModel):
    id: UUID
    connection_key: str
    name: str
    db_type: DatabaseTypeLiteral
    host: str
    port: int
    database_name: str
    schema_name: str | None = None
    username: str
    status: str
    has_password: bool = False


class ConnectionTestResponse(BaseModel):
    ok: bool = True
    message: str = "ok"


class SchemaPreviewRequest(BaseModel):
    refresh: bool = False


class TablePreviewResponse(BaseModel):
    table_name: str
    comment: str | None = None
    column_count: int = 0


class SchemaPreviewResponse(BaseModel):
    connection_id: UUID
    tables: list[TablePreviewResponse] = Field(default_factory=list)


class ImportDatabaseRequest(BaseModel):
    connection_id: UUID
    mode: ImportModeLiteral = "incremental"
    selected_tables: list[str] = Field(default_factory=list)


class ImportDatabaseResponse(BaseModel):
    ok: bool = True
    graph_id: UUID
    new_version: int
    warnings: list[str] = Field(default_factory=list)
