-- Business semantic profiles layered on top of the generic BPMN business-flow model.

CREATE TABLE IF NOT EXISTS business_semantic_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES product(id) ON DELETE CASCADE,
    profile_key TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'generic',
    target_scope TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    taxonomy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    quality_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_semantic_profile_global
    ON business_semantic_profile(profile_key, target_scope, version)
    WHERE product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_semantic_profile_product
    ON business_semantic_profile(product_id, status, domain);

ALTER TABLE swimlane_component_node
    ADD COLUMN IF NOT EXISTS semantic_profile_key TEXT,
    ADD COLUMN IF NOT EXISTS semantic_profile_version INT,
    ADD COLUMN IF NOT EXISTS semantic_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE swimlane_component_edge
    ADD COLUMN IF NOT EXISTS semantic_profile_key TEXT,
    ADD COLUMN IF NOT EXISTS semantic_profile_version INT,
    ADD COLUMN IF NOT EXISTS semantic_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_flow_node
    ADD COLUMN IF NOT EXISTS semantic_profile_key TEXT,
    ADD COLUMN IF NOT EXISTS semantic_profile_version INT,
    ADD COLUMN IF NOT EXISTS semantic_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_flow_edge
    ADD COLUMN IF NOT EXISTS semantic_profile_key TEXT,
    ADD COLUMN IF NOT EXISTS semantic_profile_version INT,
    ADD COLUMN IF NOT EXISTS semantic_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO business_semantic_profile (
    profile_key, domain, target_scope, version, name, description,
    schema_json, taxonomy_json, quality_rules_json, status
)
SELECT
    'generic-business-operation',
    'generic',
    'NODE',
    1,
    'Generic business operation',
    'Generic profile for describing business operation meaning on BPMN nodes.',
    '{"fields":[{"key":"operationType","type":"text"},{"key":"businessObject","type":"text"},{"key":"preconditions","type":"textArray"},{"key":"postconditions","type":"textArray"},{"key":"validationRules","type":"textArray"}]}'::jsonb,
    '{}'::jsonb,
    '{"warnings":["MISSING_OPERATION_TYPE","MISSING_ER_REF"]}'::jsonb,
    'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM business_semantic_profile
    WHERE product_id IS NULL
      AND profile_key = 'generic-business-operation'
      AND target_scope = 'NODE'
      AND version = 1
);

INSERT INTO business_semantic_profile (
    profile_key, domain, target_scope, version, name, description,
    schema_json, taxonomy_json, quality_rules_json, status
)
SELECT
    'mes-manufacturing-node',
    'mes',
    'NODE',
    1,
    'MES manufacturing step',
    'MES profile for manufacturing operations such as weighing, feeding, QC, release, audit and deviation handling.',
    '{"fields":[{"key":"operationType","type":"enum","required":true},{"key":"businessObject","type":"enum"},{"key":"resourceTypes","type":"enumArray"},{"key":"materialRefs","type":"textArray"},{"key":"preconditions","type":"textArray"},{"key":"postconditions","type":"textArray"},{"key":"validationRules","type":"textArray"},{"key":"exceptionHandlers","type":"enumArray"}]}'::jsonb,
    '{"operationType":["RECEIVE_MATERIAL","WEIGH","DISPENSE","MIX","REACT","SAMPLE","QC_CHECK","RELEASE","PACK","TRANSFER","CLEAN","STERILIZE","RECORD_AUDIT","HANDLE_DEVIATION"],"businessObject":["WORK_ORDER","BATCH","MATERIAL_LOT","RECIPE","EQUIPMENT","PROCESS_PARAMETER","QC_RESULT","EBR","AUDIT_TRAIL"],"resourceType":["OPERATOR","EQUIPMENT","WORKCENTER","SYSTEM"],"exceptionType":["QUALITY_FAILED","MATERIAL_SHORTAGE","EQUIPMENT_FAILURE","PARAMETER_OUT_OF_RANGE","SIGNATURE_REJECTED"]}'::jsonb,
    '{"warnings":["MISSING_OPERATION_TYPE","MISSING_ER_REF","DATA_NODE_WITHOUT_BUSINESS_OBJECT"]}'::jsonb,
    'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM business_semantic_profile
    WHERE product_id IS NULL
      AND profile_key = 'mes-manufacturing-node'
      AND target_scope = 'NODE'
      AND version = 1
);

INSERT INTO business_semantic_profile (
    profile_key, domain, target_scope, version, name, description,
    schema_json, taxonomy_json, quality_rules_json, status
)
SELECT
    'mes-manufacturing-edge',
    'mes',
    'EDGE',
    1,
    'MES manufacturing handoff',
    'MES profile for branch, handoff, message, timeout and exception semantics on BPMN edges.',
    '{"fields":[{"key":"condition","type":"text"},{"key":"handoff","type":"text"},{"key":"message","type":"text"},{"key":"timeoutPolicy","type":"text"},{"key":"exceptionType","type":"enum"}]}'::jsonb,
    '{"exceptionType":["QUALITY_FAILED","MATERIAL_SHORTAGE","EQUIPMENT_FAILURE","PARAMETER_OUT_OF_RANGE","SIGNATURE_REJECTED"]}'::jsonb,
    '{"warnings":["MISSING_GATEWAY_CONDITION"]}'::jsonb,
    'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM business_semantic_profile
    WHERE product_id IS NULL
      AND profile_key = 'mes-manufacturing-edge'
      AND target_scope = 'EDGE'
      AND version = 1
);
