"""MySQL information_schema 元数据读取。"""

from __future__ import annotations

from app.domain.er_import import ImportedColumn, ImportedSchema, ImportedTable, TablePreview
from app.infrastructure.schema_inspection.base import SchemaInspector


class MySqlSchemaInspector(SchemaInspector):
    def _connect(self):
        try:
            import pymysql
        except Exception as exc:
            raise RuntimeError("PyMySQL is required for MySQL import") from exc
        return pymysql.connect(
            host=self.connection.host,
            port=self.connection.port,
            user=self.connection.username,
            password=self.connection.password or "",
            database=self.connection.database_name,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5,
        )

    def preview_tables(self) -> list[TablePreview]:
        schema = self.connection.schema_name or self.connection.database_name
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT t.TABLE_NAME AS table_name,
                           NULLIF(t.TABLE_COMMENT, '') AS comment,
                           COUNT(c.COLUMN_NAME) AS column_count
                    FROM information_schema.TABLES t
                    LEFT JOIN information_schema.COLUMNS c
                      ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
                     AND c.TABLE_NAME = t.TABLE_NAME
                    WHERE t.TABLE_SCHEMA = %s AND t.TABLE_TYPE = 'BASE TABLE'
                    GROUP BY t.TABLE_NAME, t.TABLE_COMMENT
                    ORDER BY t.TABLE_NAME
                    """,
                    (schema,),
                )
                return [
                    TablePreview(
                        table_name=row["table_name"],
                        comment=row.get("comment"),
                        column_count=int(row["column_count"] or 0),
                    )
                    for row in cur.fetchall()
                ]

    def inspect_schema(self, selected_tables: set[str]) -> ImportedSchema:
        schema = self.connection.schema_name or self.connection.database_name
        if not selected_tables:
            return ImportedSchema(database_name=self.connection.database_name, schema_name=schema)
        with self._connect() as conn:
            with conn.cursor() as cur:
                placeholders = ",".join(["%s"] * len(selected_tables))
                params = [schema, *sorted(selected_tables)]
                cur.execute(
                    f"""
                    SELECT TABLE_NAME AS table_name, NULLIF(TABLE_COMMENT, '') AS comment
                    FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = %s
                      AND TABLE_TYPE = 'BASE TABLE'
                      AND TABLE_NAME IN ({placeholders})
                    ORDER BY TABLE_NAME
                    """,
                    params,
                )
                tables = {
                    row["table_name"]: ImportedTable(
                        table_name=row["table_name"],
                        comment=row.get("comment"),
                    )
                    for row in cur.fetchall()
                }
                cur.execute(
                    f"""
                    SELECT COLUMN_NAME AS column_name, TABLE_NAME AS table_name,
                           COLUMN_TYPE AS data_type, NULLIF(COLUMN_COMMENT, '') AS comment,
                           COLUMN_DEFAULT AS default_value, IS_NULLABLE AS is_nullable,
                           COLUMN_KEY AS column_key, ORDINAL_POSITION AS sort_order
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME IN ({placeholders})
                    ORDER BY TABLE_NAME, ORDINAL_POSITION
                    """,
                    params,
                )
                for row in cur.fetchall():
                    table = tables.get(row["table_name"])
                    if not table:
                        continue
                    key = row.get("column_key") or ""
                    table.columns.append(
                        ImportedColumn(
                            table_name=row["table_name"],
                            column_name=row["column_name"],
                            data_type=row.get("data_type"),
                            comment=row.get("comment"),
                            default_value=row.get("default_value"),
                            nullable=row.get("is_nullable") == "YES",
                            is_primary_key=key == "PRI",
                            is_unique=key == "UNI",
                            is_indexed=key in {"PRI", "UNI", "MUL"},
                            sort_order=int(row["sort_order"] or 0),
                        )
                    )
        return ImportedSchema(
            database_name=self.connection.database_name,
            schema_name=schema,
            tables=list(tables.values()),
        )
