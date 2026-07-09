BEGIN;

ALTER TABLE swimlane_component_node
    ADD COLUMN IF NOT EXISTS bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE swimlane_component_edge
    ADD COLUMN IF NOT EXISTS bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE business_flow_node
    ADD COLUMN IF NOT EXISTS bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE business_flow_edge
    ADD COLUMN IF NOT EXISTS bpmn_semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN swimlane_component_node.bpmn_semantic_json IS
    '非任务 BPMN 节点的类型专属业务语义，英文稳定键，界面使用中文标签';
COMMENT ON COLUMN swimlane_component_edge.bpmn_semantic_json IS
    'BPMN 连线的类型专属业务语义，英文稳定键，界面使用中文标签';
COMMENT ON COLUMN business_flow_node.bpmn_semantic_json IS
    '非任务 BPMN 节点实例的类型专属业务语义';
COMMENT ON COLUMN business_flow_edge.bpmn_semantic_json IS
    'BPMN 连线实例的类型专属业务语义';

COMMIT;
