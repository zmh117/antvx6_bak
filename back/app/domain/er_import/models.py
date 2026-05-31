"""数据库元数据导入领域模型。"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class ImportMode(StrEnum):
    OVERWRITE = "overwrite"
    INCREMENTAL = "incremental"


@dataclass(slots=True)
class ImportedColumn:
    table_name: str
    column_name: str
    data_type: str | None = None
    comment: str | None = None
    default_value: str | None = None
    nullable: bool | None = None
    is_primary_key: bool = False
    is_unique: bool = False
    is_indexed: bool = False
    sort_order: int = 0


@dataclass(slots=True)
class ImportedTable:
    table_name: str
    comment: str | None = None
    columns: list[ImportedColumn] = field(default_factory=list)


@dataclass(slots=True)
class ImportedSchema:
    database_name: str
    schema_name: str | None = None
    tables: list[ImportedTable] = field(default_factory=list)


@dataclass(slots=True)
class TablePreview:
    table_name: str
    comment: str | None = None
    column_count: int = 0
