-- Business Flow Context v2: reusable swimlane components + instantiated business flows.
-- This migration intentionally keeps legacy er_business_flow tables for compatibility.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS product (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product (id, code, name, description, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default Product',
    'Default product created for existing ER diagrams and business flows',
    'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO product (id, code, name, description, status)
SELECT
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default Product',
    'Default product created for existing ER diagrams and business flows',
    'active'
WHERE NOT EXISTS (SELECT 1 FROM product WHERE code = 'default');

ALTER TABLE er_graph ADD COLUMN IF NOT EXISTS product_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_er_graph_product'
          AND conrelid = 'er_graph'::regclass
    ) THEN
        ALTER TABLE er_graph
            ADD CONSTRAINT fk_er_graph_product
            FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END $$;

UPDATE er_graph
SET product_id = '00000000-0000-0000-0000-000000000001'
WHERE product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_er_graph_product ON er_graph(product_id);

CREATE TABLE IF NOT EXISTS swimlane_component (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    owner_role TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    current_version_no INT NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (product_id, code)
);

CREATE INDEX IF NOT EXISTS idx_swimlane_component_product
    ON swimlane_component(product_id, status)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS swimlane_component_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID NOT NULL REFERENCES swimlane_component(id) ON DELETE CASCADE,
    version_no INT NOT NULL,
    version_name TEXT,
    canvas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    checksum TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE (component_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_swimlane_component_version_component
    ON swimlane_component_version(component_id, status, version_no);

CREATE TABLE IF NOT EXISTS swimlane_component_node (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_version_id UUID NOT NULL REFERENCES swimlane_component_version(id) ON DELETE CASCADE,
    node_key TEXT NOT NULL,
    node_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    actor TEXT,
    business_rule TEXT,
    input_summary TEXT,
    output_summary TEXT,
    position_x NUMERIC NOT NULL DEFAULT 0,
    position_y NUMERIC NOT NULL DEFAULT 0,
    width NUMERIC NOT NULL DEFAULT 120,
    height NUMERIC NOT NULL DEFAULT 60,
    style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (component_version_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_swimlane_component_node_version
    ON swimlane_component_node(component_version_id);

CREATE TABLE IF NOT EXISTS swimlane_component_edge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_version_id UUID NOT NULL REFERENCES swimlane_component_version(id) ON DELETE CASCADE,
    edge_key TEXT NOT NULL,
    source_node_key TEXT NOT NULL,
    target_node_key TEXT NOT NULL,
    source_port TEXT,
    target_port TEXT,
    edge_type TEXT NOT NULL DEFAULT 'SEQUENCE',
    label TEXT,
    condition_text TEXT,
    data_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (component_version_id, edge_key)
);

CREATE INDEX IF NOT EXISTS idx_swimlane_component_edge_version
    ON swimlane_component_edge(component_version_id);

CREATE TABLE IF NOT EXISTS business_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    current_version BIGINT NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (product_id, code)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_product
    ON business_flow(product_id, status)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS business_flow_lane_instance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    instance_key TEXT NOT NULL,
    component_id UUID NOT NULL REFERENCES swimlane_component(id) ON DELETE RESTRICT,
    component_version_id UUID NOT NULL REFERENCES swimlane_component_version(id) ON DELETE RESTRICT,
    display_name TEXT NOT NULL,
    owner_role TEXT,
    position_x NUMERIC NOT NULL DEFAULT 0,
    position_y NUMERIC NOT NULL DEFAULT 0,
    width NUMERIC NOT NULL DEFAULT 240,
    height NUMERIC NOT NULL DEFAULT 600,
    z_index INT NOT NULL DEFAULT 0,
    layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    override_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_flow_id, instance_key)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_lane_instance_flow
    ON business_flow_lane_instance(business_flow_id, status);
CREATE INDEX IF NOT EXISTS idx_business_flow_lane_instance_component_version
    ON business_flow_lane_instance(component_version_id);

CREATE TABLE IF NOT EXISTS business_flow_node (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    lane_instance_id UUID REFERENCES business_flow_lane_instance(id) ON DELETE CASCADE,
    node_key TEXT NOT NULL,
    origin_component_node_key TEXT,
    node_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    actor TEXT,
    business_rule TEXT,
    input_summary TEXT,
    output_summary TEXT,
    position_x NUMERIC NOT NULL DEFAULT 0,
    position_y NUMERIC NOT NULL DEFAULT 0,
    width NUMERIC NOT NULL DEFAULT 120,
    height NUMERIC NOT NULL DEFAULT 60,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_flow_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_node_flow
    ON business_flow_node(business_flow_id);
CREATE INDEX IF NOT EXISTS idx_business_flow_node_lane
    ON business_flow_node(lane_instance_id);

CREATE TABLE IF NOT EXISTS business_flow_edge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    lane_instance_id UUID REFERENCES business_flow_lane_instance(id) ON DELETE SET NULL,
    edge_key TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_node_id UUID REFERENCES business_flow_node(id) ON DELETE CASCADE,
    source_lane_instance_id UUID REFERENCES business_flow_lane_instance(id) ON DELETE CASCADE,
    source_port TEXT,
    target_type TEXT NOT NULL,
    target_node_id UUID REFERENCES business_flow_node(id) ON DELETE CASCADE,
    target_lane_instance_id UUID REFERENCES business_flow_lane_instance(id) ON DELETE CASCADE,
    target_port TEXT,
    edge_type TEXT NOT NULL DEFAULT 'SEQUENCE',
    label TEXT,
    condition_text TEXT,
    data_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    origin_component_edge_key TEXT,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_flow_id, edge_key)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_edge_flow
    ON business_flow_edge(business_flow_id);
CREATE INDEX IF NOT EXISTS idx_business_flow_edge_lane
    ON business_flow_edge(lane_instance_id);

CREATE TABLE IF NOT EXISTS business_flow_node_er_ref (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    business_flow_node_id UUID NOT NULL REFERENCES business_flow_node(id) ON DELETE CASCADE,
    er_diagram_id UUID NOT NULL REFERENCES er_graph(id) ON DELETE CASCADE,
    er_table_key TEXT NOT NULL,
    er_column_key TEXT,
    ref_type TEXT NOT NULL DEFAULT 'READ',
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_flow_node_er_ref_flow
    ON business_flow_node_er_ref(business_flow_id);
CREATE INDEX IF NOT EXISTS idx_business_flow_node_er_ref_node
    ON business_flow_node_er_ref(business_flow_node_id);
CREATE INDEX IF NOT EXISTS idx_business_flow_node_er_ref_er
    ON business_flow_node_er_ref(er_diagram_id, er_table_key, er_column_key);

CREATE TABLE IF NOT EXISTS business_flow_change_batch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    base_version BIGINT NOT NULL,
    new_version BIGINT NOT NULL,
    source TEXT NOT NULL DEFAULT 'USER',
    summary TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_flow_id, new_version)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_change_batch_flow
    ON business_flow_change_batch(business_flow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS business_flow_change_op (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES business_flow_change_batch(id) ON DELETE CASCADE,
    op_seq INT NOT NULL,
    op_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_key TEXT NOT NULL,
    patch_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    inverse_patch_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, op_seq)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_change_op_batch
    ON business_flow_change_op(batch_id, op_seq);

CREATE TABLE IF NOT EXISTS business_flow_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_flow_id UUID NOT NULL REFERENCES business_flow(id) ON DELETE CASCADE,
    version BIGINT NOT NULL,
    canvas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_business_flow_snapshot_flow
    ON business_flow_snapshot(business_flow_id, version DESC);

CREATE TABLE IF NOT EXISTS collab_document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type TEXT NOT NULL,
    owner_id UUID NOT NULL,
    ydoc_state BYTEA NOT NULL DEFAULT ''::bytea,
    server_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_document_owner
    ON collab_document(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS collab_update (
    id BIGSERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES collab_document(id) ON DELETE CASCADE,
    client_id TEXT,
    update_seq BIGINT NOT NULL,
    update_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, update_seq)
);

CREATE INDEX IF NOT EXISTS idx_collab_update_document
    ON collab_update(document_id, update_seq);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_status'
          AND conrelid = 'swimlane_component'::regclass
    ) THEN
        ALTER TABLE swimlane_component
            ADD CONSTRAINT ck_swimlane_component_status
            CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_version_status'
          AND conrelid = 'swimlane_component_version'::regclass
    ) THEN
        ALTER TABLE swimlane_component_version
            ADD CONSTRAINT ck_swimlane_component_version_status
            CHECK (status IN ('DRAFT', 'PUBLISHED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_status'
          AND conrelid = 'business_flow'::regclass
    ) THEN
        ALTER TABLE business_flow
            ADD CONSTRAINT ck_business_flow_status
            CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_type'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_type
            CHECK (node_type IN ('START', 'END', 'TASK', 'DECISION', 'SERVICE', 'MANUAL', 'EVENT'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_edge_type'
          AND conrelid = 'swimlane_component_edge'::regclass
    ) THEN
        ALTER TABLE swimlane_component_edge
            ADD CONSTRAINT ck_swimlane_component_edge_type
            CHECK (edge_type IN ('SEQUENCE', 'TRIGGER', 'DATA_FLOW', 'CALL', 'DEPENDENCY', 'EXCEPTION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_lane_instance_status'
          AND conrelid = 'business_flow_lane_instance'::regclass
    ) THEN
        ALTER TABLE business_flow_lane_instance
            ADD CONSTRAINT ck_business_flow_lane_instance_status
            CHECK (status IN ('ACTIVE', 'REMOVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_type'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_type
            CHECK (node_type IN ('START', 'END', 'TASK', 'DECISION', 'SERVICE', 'MANUAL', 'EVENT'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_type'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_type
            CHECK (edge_type IN ('SEQUENCE', 'TRIGGER', 'DATA_FLOW', 'CALL', 'DEPENDENCY', 'EXCEPTION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_source_type'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_source_type
            CHECK (source_type IN ('NODE', 'LANE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_target_type'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_target_type
            CHECK (target_type IN ('NODE', 'LANE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_source_endpoint'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_source_endpoint
            CHECK (
                (source_type = 'NODE' AND source_node_id IS NOT NULL AND source_lane_instance_id IS NULL)
                OR
                (source_type = 'LANE' AND source_lane_instance_id IS NOT NULL AND source_node_id IS NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_target_endpoint'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_target_endpoint
            CHECK (
                (target_type = 'NODE' AND target_node_id IS NOT NULL AND target_lane_instance_id IS NULL)
                OR
                (target_type = 'LANE' AND target_lane_instance_id IS NOT NULL AND target_node_id IS NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_er_ref_type'
          AND conrelid = 'business_flow_node_er_ref'::regclass
    ) THEN
        ALTER TABLE business_flow_node_er_ref
            ADD CONSTRAINT ck_business_flow_node_er_ref_type
            CHECK (ref_type IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'CHECK'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_collab_document_owner_type'
          AND conrelid = 'collab_document'::regclass
    ) THEN
        ALTER TABLE collab_document
            ADD CONSTRAINT ck_collab_document_owner_type
            CHECK (owner_type IN ('BUSINESS_FLOW', 'SWIMLANE_COMPONENT_DRAFT'));
    END IF;
END $$;

COMMENT ON TABLE product IS '产品：ER 图上下文与业务流程上下文的共同归属';
COMMENT ON COLUMN er_graph.product_id IS '所属产品，业务图与 ER 图通过 product_id 归到同一产品下';

COMMENT ON TABLE swimlane_component IS '泳道组件：左侧组件表中的可复用流程组件';
COMMENT ON COLUMN swimlane_component.status IS '组件状态：DRAFT / PUBLISHED / ARCHIVED';
COMMENT ON TABLE swimlane_component_version IS '泳道组件版本：发布后不可变，修改组件需创建新版本';
COMMENT ON COLUMN swimlane_component_version.canvas_json IS 'X6 原始画布，用于还原组件图形';
COMMENT ON COLUMN swimlane_component_version.semantic_json IS '解析后的业务语义，用于 Agent 分析、搜索、测试生成';
COMMENT ON TABLE swimlane_component_node IS '泳道组件内部节点结构化副本';
COMMENT ON TABLE swimlane_component_edge IS '泳道组件内部连线结构化副本';

COMMENT ON TABLE business_flow IS '业务图：组合多个泳道实例的流程画布';
COMMENT ON TABLE business_flow_lane_instance IS '业务图中的泳道实例：从组件版本拖入后生成，保留来源组件与版本';
COMMENT ON COLUMN business_flow_lane_instance.override_json IS '实例相对来源组件版本的局部覆盖';
COMMENT ON TABLE business_flow_node IS '业务图节点：泳道组件节点实例化后的可编辑业务步骤';
COMMENT ON COLUMN business_flow_node.origin_component_node_key IS '来源泳道组件节点 key，用于 diff、升级和追踪';
COMMENT ON TABLE business_flow_edge IS '业务图连线：同时支持泳道内部线与跨泳道关系线';
COMMENT ON COLUMN business_flow_edge.lane_instance_id IS '内部线所属泳道实例；跨泳道线为空';
COMMENT ON COLUMN business_flow_edge.origin_component_edge_key IS '来源泳道组件连线 key，用于 diff、升级和追踪';
COMMENT ON TABLE business_flow_node_er_ref IS '业务节点到 ER 表字段的外部引用，不复用 ER 领域表结构';
COMMENT ON COLUMN business_flow_node_er_ref.er_table_key IS '引用 er_table.table_key';
COMMENT ON COLUMN business_flow_node_er_ref.er_column_key IS '引用 er_column.column_key，可为空表示整表引用';

COMMENT ON TABLE business_flow_change_batch IS '业务图语义 diff 批次：用户可读历史和恢复入口';
COMMENT ON TABLE business_flow_change_op IS '业务图语义 diff 操作';
COMMENT ON TABLE business_flow_snapshot IS '业务图快照：用于恢复版本，早期可每次保存写一份';
COMMENT ON TABLE collab_document IS '协同文档：Yjs 实时状态，owner_type 支持 BUSINESS_FLOW / SWIMLANE_COMPONENT_DRAFT';
COMMENT ON TABLE collab_update IS '协同增量：Yjs update，不直接作为用户历史展示';
