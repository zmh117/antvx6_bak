"""SQL Server catalog 元数据读取。"""

from __future__ import annotations

from app.domain.er_import import ImportedColumn, ImportedSchema, ImportedTable, TablePreview
from app.infrastructure.schema_inspection.base import SchemaInspector


class SqlServerSchemaInspector(SchemaInspector):
    def _connect(self):
        try:
            import pyodbc
        except Exception as exc:
            raise RuntimeError("pyodbc and Microsoft ODBC Driver are required for SQL Server import") from exc
        conn_str = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={self.connection.host},{self.connection.port};"
            f"DATABASE={self.connection.database_name};"
            f"UID={self.connection.username};"
            f"PWD={self.connection.password or ''};"
            "TrustServerCertificate=yes;"
        )
        return pyodbc.connect(conn_str, timeout=5)

    def preview_tables(self) -> list[TablePreview]:
        schema = self.connection.schema_name or "dbo"
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT t.name AS table_name,
                       CAST(ep.value AS NVARCHAR(MAX)) AS comment,
                       COUNT(c.column_id) AS column_count
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                LEFT JOIN sys.columns c ON c.object_id = t.object_id
                LEFT JOIN sys.extended_properties ep
                  ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
                WHERE s.name = ?
                GROUP BY t.name, CAST(ep.value AS NVARCHAR(MAX))
                ORDER BY t.name
                """,
                schema,
            )
            return [
                TablePreview(table_name=row.table_name, comment=row.comment, column_count=int(row.column_count or 0))
                for row in cur.fetchall()
            ]

    def inspect_schema(self, selected_tables: set[str]) -> ImportedSchema:
        schema = self.connection.schema_name or "dbo"
        if not selected_tables:
            return ImportedSchema(database_name=self.connection.database_name, schema_name=schema)
        placeholders = ",".join("?" for _ in selected_tables)
        params = [schema, *sorted(selected_tables)]
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT t.name AS table_name, CAST(ep.value AS NVARCHAR(MAX)) AS comment
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                LEFT JOIN sys.extended_properties ep
                  ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
                WHERE s.name = ? AND t.name IN ({placeholders})
                ORDER BY t.name
                """,
                params,
            )
            tables = {
                row.table_name: ImportedTable(table_name=row.table_name, comment=row.comment)
                for row in cur.fetchall()
            }
            cur.execute(
                f"""
                SELECT t.name AS table_name,
                       c.name AS column_name,
                       ty.name +
                         CASE WHEN ty.name IN ('varchar','nvarchar','char','nchar')
                              THEN '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS VARCHAR(16)) END + ')'
                              WHEN ty.name IN ('decimal','numeric')
                              THEN '(' + CAST(c.precision AS VARCHAR(16)) + ',' + CAST(c.scale AS VARCHAR(16)) + ')'
                              ELSE '' END AS data_type,
                       CAST(ep.value AS NVARCHAR(MAX)) AS comment,
                       dc.definition AS default_value,
                       c.is_nullable,
                       c.column_id AS sort_order,
                       CASE WHEN pk.column_id IS NULL THEN 0 ELSE 1 END AS is_pk,
                       CASE WHEN uq.column_id IS NULL THEN 0 ELSE 1 END AS is_unique,
                       CASE WHEN ix.column_id IS NULL THEN 0 ELSE 1 END AS is_indexed
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.columns c ON c.object_id = t.object_id
                JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
                LEFT JOIN sys.extended_properties ep
                  ON ep.major_id = t.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
                LEFT JOIN (
                  SELECT ic.object_id, ic.column_id
                  FROM sys.indexes i
                  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                  WHERE i.is_primary_key = 1
                ) pk ON pk.object_id = t.object_id AND pk.column_id = c.column_id
                LEFT JOIN (
                  SELECT ic.object_id, ic.column_id
                  FROM sys.indexes i
                  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                  WHERE i.is_unique = 1
                ) uq ON uq.object_id = t.object_id AND uq.column_id = c.column_id
                LEFT JOIN sys.index_columns ix ON ix.object_id = t.object_id AND ix.column_id = c.column_id
                WHERE s.name = ? AND t.name IN ({placeholders})
                ORDER BY t.name, c.column_id
                """,
                params,
            )
            for row in cur.fetchall():
                table = tables.get(row.table_name)
                if not table:
                    continue
                table.columns.append(
                    ImportedColumn(
                        table_name=row.table_name,
                        column_name=row.column_name,
                        data_type=row.data_type,
                        comment=row.comment,
                        default_value=row.default_value,
                        nullable=bool(row.is_nullable),
                        sort_order=int(row.sort_order or 0),
                        is_primary_key=bool(row.is_pk),
                        is_unique=bool(row.is_unique),
                        is_indexed=bool(row.is_indexed),
                    )
                )
        return ImportedSchema(database_name=self.connection.database_name, schema_name=schema, tables=list(tables.values()))
