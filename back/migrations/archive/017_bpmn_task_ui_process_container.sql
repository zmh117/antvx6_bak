-- Task UI test context and process-container hierarchy for business-flow BPMN nodes.

ALTER TABLE swimlane_component_node
    ADD COLUMN IF NOT EXISTS task_ui_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS process_container_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS container_node_key TEXT;

ALTER TABLE business_flow_node
    ADD COLUMN IF NOT EXISTS task_ui_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS process_container_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS container_node_key TEXT;

CREATE INDEX IF NOT EXISTS idx_swimlane_component_node_container
    ON swimlane_component_node(component_version_id, container_node_key)
    WHERE container_node_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_flow_node_container
    ON business_flow_node(business_flow_id, container_node_key)
    WHERE container_node_key IS NOT NULL;
