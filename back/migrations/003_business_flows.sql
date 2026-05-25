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
