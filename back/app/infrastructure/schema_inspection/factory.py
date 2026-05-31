"""SchemaInspector 工厂。"""

from __future__ import annotations

from app.domain.database_connection import DatabaseConnection, DatabaseType
from app.infrastructure.schema_inspection.base import SchemaInspector
from app.infrastructure.schema_inspection.mysql import MySqlSchemaInspector
from app.infrastructure.schema_inspection.oracle import OracleSchemaInspector
from app.infrastructure.schema_inspection.sqlserver import SqlServerSchemaInspector


class SchemaInspectorFactory:
    def create(self, connection: DatabaseConnection) -> SchemaInspector:
        if connection.db_type == DatabaseType.MYSQL:
            return MySqlSchemaInspector(connection)
        if connection.db_type == DatabaseType.ORACLE:
            return OracleSchemaInspector(connection)
        if connection.db_type == DatabaseType.SQLSERVER:
            return SqlServerSchemaInspector(connection)
        raise ValueError(f"unsupported database type: {connection.db_type}")
