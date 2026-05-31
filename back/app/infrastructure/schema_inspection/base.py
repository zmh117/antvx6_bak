"""数据库元数据读取适配器接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.database_connection import DatabaseConnection
from app.domain.er_import import ImportedSchema, TablePreview


class SchemaInspector(ABC):
    def __init__(self, connection: DatabaseConnection) -> None:
        self.connection = connection

    @abstractmethod
    def preview_tables(self) -> list[TablePreview]:
        raise NotImplementedError

    @abstractmethod
    def inspect_schema(self, selected_tables: set[str]) -> ImportedSchema:
        raise NotImplementedError

    def test(self) -> None:
        self.preview_tables()
