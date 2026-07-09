BEGIN;

CREATE TABLE IF NOT EXISTS app_migration_state (
    migration_key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION app_is_removed_bpmn_node(value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT
        UPPER(COALESCE(
            value->>'bpmn_element_type',
            value->>'bpmnElementType',
            value->>'node_type',
            value->>'nodeType',
            ''
        )) = 'CALL_ACTIVITY'
        OR (
            UPPER(COALESCE(value->>'bpmn_element_type', value->>'bpmnElementType', '')) = 'SUB_PROCESS'
            AND UPPER(COALESCE(value->>'bpmn_subprocess_kind', value->>'bpmnSubProcessKind', '')) = 'EMBEDDED'
            AND COALESCE(
                value#>>'{process_container_json,containerMode}',
                value#>>'{processContainerJson,containerMode}',
                ''
            ) IN ('embedded', 'reusableCall')
        );
$$;

CREATE OR REPLACE FUNCTION app_strip_bpmn_legacy_json(
    value JSONB,
    forced_scope TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB;
    entry RECORD;
    cleaned JSONB;
    local_scope TEXT := UPPER(COALESCE(forced_scope, ''));
    valid_keys TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF value IS NULL THEN
        RETURN NULL;
    END IF;

    IF jsonb_typeof(value) = 'array' THEN
        SELECT COALESCE(jsonb_agg(cleaned_item), '[]'::jsonb)
        INTO result
        FROM (
            SELECT app_strip_bpmn_legacy_json(item, NULL) AS cleaned_item
            FROM jsonb_array_elements(value) AS items(item)
        ) cleaned_items
        WHERE cleaned_item IS NOT NULL;
        RETURN result;
    END IF;

    IF jsonb_typeof(value) <> 'object' THEN
        RETURN value;
    END IF;

    IF app_is_removed_bpmn_node(value)
       OR (
           jsonb_typeof(value->'data') = 'object'
           AND app_is_removed_bpmn_node(value->'data')
       ) THEN
        RETURN NULL;
    END IF;

    IF local_scope = '' THEN
        IF (
            value ? 'node_key' OR value ? 'nodeKey'
            OR value->>'cellRole' IN ('FLOW_NODE', 'COMPONENT_NODE')
        ) AND (
            value ? 'node_type' OR value ? 'nodeType'
            OR value ? 'bpmn_element_type' OR value ? 'bpmnElementType'
        ) THEN
            local_scope := 'NODE';
        ELSIF (
            value ? 'edge_key' OR value ? 'edgeKey'
            OR value->>'cellRole' IN ('FLOW_EDGE', 'COMPONENT_EDGE')
        ) AND (
            value ? 'edge_type' OR value ? 'edgeType'
            OR value ? 'bpmn_flow_type' OR value ? 'bpmnFlowType'
        ) THEN
            local_scope := 'EDGE';
        END IF;
    END IF;

    result := '{}'::jsonb;
    FOR entry IN SELECT key, val FROM jsonb_each(value) AS fields(key, val)
    LOOP
        IF entry.key IN (
            'semantic_profile_key', 'semanticProfileKey',
            'semantic_profile_version', 'semanticProfileVersion',
            'semantic_payload_json', 'semanticPayloadJson',
            'process_container_json', 'processContainerJson',
            'container_node_key', 'containerNodeKey',
            'bpmn_call_activity_ref', 'bpmnCallActivityRef'
        ) THEN
            CONTINUE;
        END IF;
        IF local_scope = 'NODE' AND entry.key IN (
            'description', 'actor',
            'business_rule', 'businessRule',
            'input_summary', 'inputSummary',
            'output_summary', 'outputSummary'
        ) THEN
            CONTINUE;
        END IF;
        IF local_scope = 'EDGE' AND entry.key IN (
            'condition_text', 'conditionText',
            'data_contract_json', 'dataContractJson', 'dataContract',
            'bpmn_message_name', 'bpmnMessageName',
            'bpmn_condition_expression', 'bpmnConditionExpression'
        ) THEN
            CONTINUE;
        END IF;

        cleaned := app_strip_bpmn_legacy_json(entry.val, NULL);
        IF cleaned IS NOT NULL THEN
            result := result || jsonb_build_object(entry.key, cleaned);
        END IF;
    END LOOP;

    IF jsonb_typeof(result->'nodes') = 'array'
       AND jsonb_typeof(result->'edges') = 'array' THEN
        SELECT COALESCE(
            array_agg(COALESCE(node->>'node_key', node->>'nodeKey')),
            ARRAY[]::TEXT[]
        )
        INTO valid_keys
        FROM jsonb_array_elements(result->'nodes') AS nodes(node)
        WHERE COALESCE(node->>'node_key', node->>'nodeKey') IS NOT NULL;

        result := jsonb_set(
            result,
            '{edges}',
            COALESCE((
                SELECT jsonb_agg(edge)
                FROM jsonb_array_elements(result->'edges') AS edges(edge)
                WHERE COALESCE(edge->>'source_node_key', edge->>'sourceNodeKey') = ANY(valid_keys)
                  AND COALESCE(edge->>'target_node_key', edge->>'targetNodeKey') = ANY(valid_keys)
            ), '[]'::jsonb),
            true
        );
    END IF;

    RETURN result;
END;
$$;

DO $$
DECLARE
    already_applied BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM app_migration_state
        WHERE migration_key = '019_bpmn_schema_cleanup'
    ) INTO already_applied;
    IF already_applied THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE removed_component_nodes (
        component_version_id UUID,
        node_key TEXT
    ) ON COMMIT DROP;
    CREATE TEMP TABLE removed_business_nodes (
        business_flow_id UUID,
        node_id UUID,
        node_key TEXT
    ) ON COMMIT DROP;

    INSERT INTO removed_component_nodes
    SELECT component_version_id, node_key
    FROM swimlane_component_node
    WHERE bpmn_element_type = 'CALL_ACTIVITY'
       OR node_type = 'CALL_ACTIVITY'
       OR (
           bpmn_element_type = 'SUB_PROCESS'
           AND bpmn_subprocess_kind = 'EMBEDDED'
           AND process_container_json->>'containerMode' IN ('embedded', 'reusableCall')
       );

    DELETE FROM swimlane_component_edge edge
    USING removed_component_nodes removed
    WHERE edge.component_version_id = removed.component_version_id
      AND (
          edge.source_node_key = removed.node_key
          OR edge.target_node_key = removed.node_key
      );

    DELETE FROM swimlane_component_node node
    USING removed_component_nodes removed
    WHERE node.component_version_id = removed.component_version_id
      AND node.node_key = removed.node_key;

    INSERT INTO removed_business_nodes
    SELECT business_flow_id, id, node_key
    FROM business_flow_node
    WHERE bpmn_element_type = 'CALL_ACTIVITY'
       OR node_type = 'CALL_ACTIVITY'
       OR (
           bpmn_element_type = 'SUB_PROCESS'
           AND bpmn_subprocess_kind = 'EMBEDDED'
           AND process_container_json->>'containerMode' IN ('embedded', 'reusableCall')
       );

    DELETE FROM business_flow_edge edge
    USING removed_business_nodes removed
    WHERE edge.business_flow_id = removed.business_flow_id
      AND (
          edge.source_node_id = removed.node_id
          OR edge.target_node_id = removed.node_id
      );

    DELETE FROM business_flow_node node
    USING removed_business_nodes removed
    WHERE node.id = removed.node_id;

    UPDATE swimlane_component_node
    SET properties_json = app_strip_bpmn_legacy_json(properties_json, 'NODE');
    UPDATE swimlane_component_edge
    SET properties_json = app_strip_bpmn_legacy_json(properties_json, 'EDGE');
    UPDATE business_flow_node
    SET properties_json = app_strip_bpmn_legacy_json(properties_json, 'NODE');
    UPDATE business_flow_edge
    SET properties_json = app_strip_bpmn_legacy_json(properties_json, 'EDGE');

    UPDATE swimlane_component_version
    SET canvas_json = app_strip_bpmn_legacy_json(canvas_json),
        semantic_json = app_strip_bpmn_legacy_json(semantic_json);
    UPDATE business_flow_snapshot
    SET canvas_json = app_strip_bpmn_legacy_json(canvas_json),
        semantic_json = app_strip_bpmn_legacy_json(semantic_json);
    UPDATE business_flow_change_op
    SET patch_json = app_strip_bpmn_legacy_json(patch_json, target_type),
        inverse_patch_json = app_strip_bpmn_legacy_json(inverse_patch_json, target_type);

    DELETE FROM collab_document
    WHERE owner_type IN ('BUSINESS_FLOW', 'SWIMLANE_COMPONENT_DRAFT');

    UPDATE business_flow
    SET collab_revision = collab_revision + 1,
        updated_at = NOW();

    INSERT INTO app_migration_state(migration_key)
    VALUES ('019_bpmn_schema_cleanup');
END;
$$;

DROP INDEX IF EXISTS idx_swimlane_component_node_container;
DROP INDEX IF EXISTS idx_business_flow_node_container;

ALTER TABLE swimlane_component_node
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS actor,
    DROP COLUMN IF EXISTS business_rule,
    DROP COLUMN IF EXISTS input_summary,
    DROP COLUMN IF EXISTS output_summary,
    DROP COLUMN IF EXISTS semantic_profile_key,
    DROP COLUMN IF EXISTS semantic_profile_version,
    DROP COLUMN IF EXISTS semantic_payload_json,
    DROP COLUMN IF EXISTS process_container_json,
    DROP COLUMN IF EXISTS container_node_key,
    DROP COLUMN IF EXISTS bpmn_call_activity_ref;

ALTER TABLE business_flow_node
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS actor,
    DROP COLUMN IF EXISTS business_rule,
    DROP COLUMN IF EXISTS input_summary,
    DROP COLUMN IF EXISTS output_summary,
    DROP COLUMN IF EXISTS semantic_profile_key,
    DROP COLUMN IF EXISTS semantic_profile_version,
    DROP COLUMN IF EXISTS semantic_payload_json,
    DROP COLUMN IF EXISTS process_container_json,
    DROP COLUMN IF EXISTS container_node_key,
    DROP COLUMN IF EXISTS bpmn_call_activity_ref;

ALTER TABLE swimlane_component_edge
    DROP COLUMN IF EXISTS condition_text,
    DROP COLUMN IF EXISTS data_contract_json,
    DROP COLUMN IF EXISTS semantic_profile_key,
    DROP COLUMN IF EXISTS semantic_profile_version,
    DROP COLUMN IF EXISTS semantic_payload_json,
    DROP COLUMN IF EXISTS bpmn_message_name,
    DROP COLUMN IF EXISTS bpmn_condition_expression;

ALTER TABLE business_flow_edge
    DROP COLUMN IF EXISTS condition_text,
    DROP COLUMN IF EXISTS data_contract_json,
    DROP COLUMN IF EXISTS semantic_profile_key,
    DROP COLUMN IF EXISTS semantic_profile_version,
    DROP COLUMN IF EXISTS semantic_payload_json,
    DROP COLUMN IF EXISTS bpmn_message_name,
    DROP COLUMN IF EXISTS bpmn_condition_expression;

DROP TABLE IF EXISTS business_semantic_profile;

ALTER TABLE swimlane_component_node
    DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_type,
    DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_element_type,
    DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_profile;
ALTER TABLE business_flow_node
    DROP CONSTRAINT IF EXISTS ck_business_flow_node_type,
    DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_element_type,
    DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_profile;

ALTER TABLE swimlane_component_node
    ADD CONSTRAINT ck_swimlane_component_node_type CHECK (
        node_type IN (
            'START', 'END', 'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_element_type CHECK (
        bpmn_element_type IN (
            'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_profile CHECK (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

ALTER TABLE business_flow_node
    ADD CONSTRAINT ck_business_flow_node_type CHECK (
        node_type IN (
            'START', 'END', 'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_element_type CHECK (
        bpmn_element_type IN (
            'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_profile CHECK (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

DROP FUNCTION IF EXISTS app_strip_bpmn_legacy_json(JSONB, TEXT);
DROP FUNCTION IF EXISTS app_is_removed_bpmn_node(JSONB);

COMMIT;
