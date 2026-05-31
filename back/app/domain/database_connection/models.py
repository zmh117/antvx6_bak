"""数据库连接领域模型。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID


class DatabaseType(StrEnum):
    MYSQL = "mysql"
    ORACLE = "oracle"
    SQLSERVER = "sqlserver"


@dataclass(slots=True)
class DatabaseConnection:
    id: UUID | None
    connection_key: str
    name: str
    db_type: DatabaseType
    host: str
    port: int
    database_name: str
    username: str
    schema_name: str | None = None
    password: str | None = None
    status: str = "active"

    def masked(self) -> dict[str, object]:
        return {
            "id": self.id,
            "connection_key": self.connection_key,
            "name": self.name,
            "db_type": self.db_type.value,
            "host": self.host,
            "port": self.port,
            "database_name": self.database_name,
            "schema_name": self.schema_name,
            "username": self.username,
            "status": self.status,
            "has_password": bool(self.password),
        }
