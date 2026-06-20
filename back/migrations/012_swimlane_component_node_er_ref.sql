CREATE TABLE IF NOT EXISTS swimlane_component_node_er_ref (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_version_id UUID NOT NULL REFERENCES swimlane_component_version(id) ON DELETE CASCADE,
    swimlane_component_node_id UUID NOT NULL REFERENCES swimlane_component_node(id) ON DELETE CASCADE,
    er_diagram_id UUID NOT NULL REFERENCES er_graph(id) ON DELETE CASCADE,
    er_table_key TEXT NOT NULL,
    er_column_key TEXT,
    ref_type TEXT NOT NULL DEFAULT 'READ',
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swimlane_component_node_er_ref_version
    ON swimlane_component_node_er_ref(component_version_id);
CREATE INDEX IF NOT EXISTS idx_swimlane_component_node_er_ref_node
    ON swimlane_component_node_er_ref(swimlane_component_node_id);
CREATE INDEX IF NOT EXISTS idx_swimlane_component_node_er_ref_er
    ON swimlane_component_node_er_ref(er_diagram_id, er_table_key, er_column_key);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_er_ref_type'
          AND conrelid = 'swimlane_component_node_er_ref'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node_er_ref
            ADD CONSTRAINT ck_swimlane_component_node_er_ref_type
            CHECK (ref_type IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'CHECK'));
    END IF;
END $$;

COMMENT ON TABLE swimlane_component_node_er_ref IS '泳道组件节点到 ER 表字段的外部引用模板';
COMMENT ON COLUMN swimlane_component_node_er_ref.er_table_key IS '引用 er_table.table_key';
COMMENT ON COLUMN swimlane_component_node_er_ref.er_column_key IS '引用 er_column.column_key，可为空表示整表引用';
