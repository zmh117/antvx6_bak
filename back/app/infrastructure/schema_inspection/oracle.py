"""Oracle 数据字典元数据读取。"""

from __future__ import annotations

from app.domain.er_import import ImportedColumn, ImportedSchema, ImportedTable, TablePreview
from app.infrastructure.schema_inspection.base import SchemaInspector


class OracleSchemaInspector(SchemaInspector):
    def _connect(self):
        try:
            import oracledb
        except Exception as exc:
            raise RuntimeError("oracledb is required for Oracle import") from exc
        dsn = f"{self.connection.host}:{self.connection.port}/{self.connection.database_name}"
        return oracledb.connect(
            user=self.connection.username,
            password=self.connection.password or "",
            dsn=dsn,
        )

    def preview_tables(self) -> list[TablePreview]:
        owner = (self.connection.schema_name or self.connection.username).upper()
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT t.table_name, tc.comments, COUNT(c.column_name) AS column_count
                FROM all_tables t
                LEFT JOIN all_tab_comments tc ON tc.owner = t.owner AND tc.table_name = t.table_name
                LEFT JOIN all_tab_columns c ON c.owner = t.owner AND c.table_name = t.table_name
                WHERE t.owner = :owner
                GROUP BY t.table_name, tc.comments
                ORDER BY t.table_name
                """,
                owner=owner,
            )
            return [
                TablePreview(table_name=row[0], comment=row[1], column_count=int(row[2] or 0))
                for row in cur.fetchall()
            ]

    def inspect_schema(self, selected_tables: set[str]) -> ImportedSchema:
        owner = (self.connection.schema_name or self.connection.username).upper()
        selected = {name.upper() for name in selected_tables}
        if not selected:
            return ImportedSchema(database_name=self.connection.database_name, schema_name=owner)
        names = sorted(selected)
        bind_names = ",".join(f":t{i}" for i in range(len(names)))
        binds = {f"t{i}": name for i, name in enumerate(names)}
        binds["owner"] = owner
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT t.table_name, tc.comments
                FROM all_tables t
                LEFT JOIN all_tab_comments tc ON tc.owner = t.owner AND tc.table_name = t.table_name
                WHERE t.owner = :owner AND t.table_name IN ({bind_names})
                ORDER BY t.table_name
                """,
                binds,
            )
            tables = {
                row[0]: ImportedTable(table_name=row[0], comment=row[1])
                for row in cur.fetchall()
            }
            cur.execute(
                f"""
                SELECT c.table_name, c.column_name,
                       c.data_type ||
                         CASE WHEN c.data_type IN ('VARCHAR2','CHAR','NVARCHAR2','NCHAR')
                              THEN '(' || c.char_length || ')' ELSE '' END AS data_type,
                       cc.comments,
                       c.data_default,
                       c.nullable,
                       c.column_id,
                       CASE WHEN pk.column_name IS NULL THEN 0 ELSE 1 END AS is_pk,
                       CASE WHEN uq.column_name IS NULL THEN 0 ELSE 1 END AS is_unique,
                       CASE WHEN ix.column_name IS NULL THEN 0 ELSE 1 END AS is_indexed
                FROM all_tab_columns c
                LEFT JOIN all_col_comments cc
                  ON cc.owner = c.owner AND cc.table_name = c.table_name AND cc.column_name = c.column_name
                LEFT JOIN (
                  SELECT acc.owner, acc.table_name, acc.column_name
                  FROM all_constraints ac
                  JOIN all_cons_columns acc ON acc.owner = ac.owner AND acc.constraint_name = ac.constraint_name
                  WHERE ac.constraint_type = 'P'
                ) pk ON pk.owner = c.owner AND pk.table_name = c.table_name AND pk.column_name = c.column_name
                LEFT JOIN (
                  SELECT acc.owner, acc.table_name, acc.column_name
                  FROM all_constraints ac
                  JOIN all_cons_columns acc ON acc.owner = ac.owner AND acc.constraint_name = ac.constraint_name
                  WHERE ac.constraint_type = 'U'
                ) uq ON uq.owner = c.owner AND uq.table_name = c.table_name AND uq.column_name = c.column_name
                LEFT JOIN all_ind_columns ix
                  ON ix.table_owner = c.owner AND ix.table_name = c.table_name AND ix.column_name = c.column_name
                WHERE c.owner = :owner AND c.table_name IN ({bind_names})
                ORDER BY c.table_name, c.column_id
                """,
                binds,
            )
            for row in cur.fetchall():
                table = tables.get(row[0])
                if not table:
                    continue
                table.columns.append(
                    ImportedColumn(
                        table_name=row[0],
                        column_name=row[1],
                        data_type=row[2],
                        comment=row[3],
                        default_value=str(row[4]).strip() if row[4] is not None else None,
                        nullable=row[5] == "Y",
                        sort_order=int(row[6] or 0),
                        is_primary_key=bool(row[7]),
                        is_unique=bool(row[8]),
                        is_indexed=bool(row[9]),
                    )
                )
        return ImportedSchema(database_name=self.connection.database_name, schema_name=owner, tables=list(tables.values()))
