-- 业务流程图与 ER 绑定（幂等）
CREATE TABLE IF NOT EXISTS er_business_flow (
    graph_id UUID NOT NULL REFERENCES er_graph(id) ON DELETE CASCADE,
    flow_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    flow_json JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (graph_id, flow_key)
);

CREATE TABLE IF NOT EXISTS er_business_flow_er_binding (
    graph_id UUID NOT NULL,
    flow_key TEXT NOT NULL,
    binding_key TEXT NOT NULL,
    step_key TEXT NOT NULL,
    table_key TEXT,
    column_key TEXT,
    relation_key TEXT,
    usage_type TEXT NOT NULL DEFAULT 'read',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (graph_id, flow_key, binding_key),
    FOREIGN KEY (graph_id, flow_key) REFERENCES er_business_flow(graph_id, flow_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_er_business_flow_graph ON er_business_flow(graph_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_er_business_flow_binding_graph ON er_business_flow_er_binding(graph_id, flow_key) WHERE deleted_at IS NULL;

COMMENT ON TABLE er_business_flow IS '业务流程图：按业务场景保存流程节点和连线，可与 ER 图中的表、字段、关系建立绑定';
COMMENT ON COLUMN er_business_flow.graph_id IS '所属 ER 图，关联 er_graph.id';
COMMENT ON COLUMN er_business_flow.flow_key IS '流程稳定键，同一 ER 图内唯一';
COMMENT ON COLUMN er_business_flow.name IS '流程名称';
COMMENT ON COLUMN er_business_flow.description IS '流程业务说明';
COMMENT ON COLUMN er_business_flow.flow_json IS '流程画布 JSON，包含业务流程节点和连线';
COMMENT ON COLUMN er_business_flow.version IS '流程版本号，用于保存和恢复时判断变化';
COMMENT ON COLUMN er_business_flow.created_at IS '创建时间';
COMMENT ON COLUMN er_business_flow.updated_at IS '最后更新时间';
COMMENT ON COLUMN er_business_flow.deleted_at IS '软删除时间，NULL 表示有效';

COMMENT ON TABLE er_business_flow_er_binding IS '业务流程与 ER 元素绑定：描述流程步骤使用了哪些表、字段或关系';
COMMENT ON COLUMN er_business_flow_er_binding.graph_id IS '所属 ER 图';
COMMENT ON COLUMN er_business_flow_er_binding.flow_key IS '所属业务流程键，关联 er_business_flow.flow_key';
COMMENT ON COLUMN er_business_flow_er_binding.binding_key IS '绑定稳定键，同一流程内唯一';
COMMENT ON COLUMN er_business_flow_er_binding.step_key IS '流程步骤键，对应 flow_json 中的步骤节点';
COMMENT ON COLUMN er_business_flow_er_binding.table_key IS '绑定的 ER 表键，可为空';
COMMENT ON COLUMN er_business_flow_er_binding.column_key IS '绑定的 ER 字段键，可为空';
COMMENT ON COLUMN er_business_flow_er_binding.relation_key IS '绑定的 ER 关系键，可为空';
COMMENT ON COLUMN er_business_flow_er_binding.usage_type IS '使用类型：read/write/check/derive 等，默认 read';
COMMENT ON COLUMN er_business_flow_er_binding.description IS '绑定说明，描述流程步骤如何使用该 ER 元素';
COMMENT ON COLUMN er_business_flow_er_binding.created_at IS '创建时间';
COMMENT ON COLUMN er_business_flow_er_binding.updated_at IS '最后更新时间';
COMMENT ON COLUMN er_business_flow_er_binding.deleted_at IS '软删除时间，NULL 表示有效';
