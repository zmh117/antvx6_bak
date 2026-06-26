-- Generalize business-flow BPMN semantics and permanently remove MES-specific data.
-- Destructive cleanup is guarded by app_migration_state; schema assertions stay idempotent.

CREATE TABLE IF NOT EXISTS app_migration_state (
    migration_key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION app_strip_mes_json(value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB;
    item RECORD;
BEGIN
    IF value IS NULL THEN
        RETURN NULL;
    END IF;
    IF jsonb_typeof(value) = 'object' THEN
        result := '{}'::jsonb;
        FOR item IN
            SELECT key, app_strip_mes_json(val) AS val
            FROM jsonb_each(value) AS entry(key, val)
            WHERE key NOT IN ('mes', 'mesSemantics', 'mes_semantics_json')
        LOOP
            result := result || jsonb_build_object(item.key, item.val);
        END LOOP;
        RETURN result;
    END IF;
    IF jsonb_typeof(value) = 'array' THEN
        SELECT COALESCE(jsonb_agg(app_strip_mes_json(element)), '[]'::jsonb)
        INTO result
        FROM jsonb_array_elements(value) AS elements(element);
        RETURN result;
    END IF;
    RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION app_normalize_bpmn_node_json(node JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB := app_strip_mes_json(node);
    node_type TEXT := UPPER(COALESCE(node->>'node_type', node->>'nodeType', ''));
    element_type TEXT := UPPER(COALESCE(
        node->>'bpmn_element_type',
        node->>'bpmnElementType',
        node#>>'{properties_json,bpmn,bpmnElementType}',
        node#>>'{propertiesJson,bpmn,bpmnElementType}',
        ''
    ));
    event_kind TEXT := UPPER(COALESCE(node->>'bpmn_event_kind', node->>'bpmnEventKind', ''));
    event_definition TEXT := UPPER(COALESCE(node->>'bpmn_event_definition', node->>'bpmnEventDefinition', ''));
    task_type TEXT := UPPER(COALESCE(node->>'bpmn_task_type', node->>'bpmnTaskType', ''));
    gateway_type TEXT := UPPER(COALESCE(node->>'bpmn_gateway_type', node->>'bpmnGatewayType', ''));
    subprocess_kind TEXT := UPPER(COALESCE(node->>'bpmn_subprocess_kind', node->>'bpmnSubProcessKind', ''));
BEGIN
    IF node_type = 'DECISION' THEN
        node_type := 'GATEWAY';
        element_type := 'GATEWAY';
        gateway_type := 'EXCLUSIVE';
    ELSIF element_type = '' THEN
        CASE node_type
            WHEN 'START' THEN element_type := 'EVENT'; event_kind := 'START'; event_definition := 'NONE';
            WHEN 'END' THEN element_type := 'EVENT'; event_kind := 'END'; event_definition := 'NONE';
            WHEN 'EVENT' THEN element_type := 'EVENT'; event_kind := 'INTERMEDIATE'; event_definition := 'NONE';
            WHEN 'TASK' THEN element_type := 'TASK'; task_type := 'NONE';
            WHEN 'GATEWAY' THEN element_type := 'GATEWAY'; gateway_type := 'EXCLUSIVE';
            WHEN 'SUB_PROCESS' THEN element_type := 'SUB_PROCESS'; subprocess_kind := 'EMBEDDED';
            WHEN 'CALL_ACTIVITY' THEN element_type := 'CALL_ACTIVITY';
            WHEN 'DATA_OBJECT' THEN element_type := 'DATA_OBJECT';
            WHEN 'DATA_INPUT' THEN element_type := 'DATA_INPUT';
            WHEN 'DATA_OUTPUT' THEN element_type := 'DATA_OUTPUT';
            WHEN 'DATA_STORE' THEN element_type := 'DATA_STORE';
            ELSE RETURN NULL;
        END CASE;
    END IF;

    IF element_type = 'EVENT' THEN
        IF NOT (
            (node_type = 'START' AND event_kind = 'START') OR
            (node_type = 'END' AND event_kind = 'END') OR
            (node_type = 'EVENT' AND event_kind = 'INTERMEDIATE')
        ) OR event_definition NOT IN ('', 'NONE') THEN
            RETURN NULL;
        END IF;
        event_definition := 'NONE';
    ELSIF element_type = 'TASK' THEN
        IF node_type <> 'TASK' OR task_type NOT IN ('', 'NONE') THEN RETURN NULL; END IF;
        task_type := 'NONE';
    ELSIF element_type = 'GATEWAY' THEN
        IF node_type <> 'GATEWAY' OR gateway_type NOT IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX') THEN
            RETURN NULL;
        END IF;
    ELSIF element_type = 'SUB_PROCESS' THEN
        IF node_type <> 'SUB_PROCESS' OR subprocess_kind NOT IN ('EMBEDDED', 'TRANSACTION') THEN
            RETURN NULL;
        END IF;
    ELSIF element_type = 'CALL_ACTIVITY' THEN
        IF node_type <> 'CALL_ACTIVITY' THEN RETURN NULL; END IF;
    ELSIF element_type IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE') THEN
        IF node_type <> element_type THEN RETURN NULL; END IF;
    ELSE
        RETURN NULL;
    END IF;

    result := result
        - 'nodeType'
        - 'bpmnElementType'
        - 'bpmnEventKind'
        - 'bpmnEventDefinition'
        - 'bpmnTaskType'
        - 'bpmnGatewayType'
        - 'bpmnSubProcessKind'
        - 'bpmnBoundaryAttachedToNodeKey'
        - 'bpmn_boundary_attached_to_node_key';
    result := jsonb_set(result, '{node_type}', to_jsonb(node_type), true);
    result := jsonb_set(result, '{bpmn_element_type}', to_jsonb(element_type), true);
    result := jsonb_set(
        result,
        '{bpmn_event_kind}',
        CASE WHEN event_kind = '' THEN 'null'::jsonb ELSE to_jsonb(event_kind) END,
        true
    );
    result := jsonb_set(
        result,
        '{bpmn_event_definition}',
        CASE WHEN event_definition = '' THEN 'null'::jsonb ELSE to_jsonb(event_definition) END,
        true
    );
    result := jsonb_set(
        result,
        '{bpmn_task_type}',
        CASE WHEN task_type = '' THEN 'null'::jsonb ELSE to_jsonb(task_type) END,
        true
    );
    result := jsonb_set(
        result,
        '{bpmn_gateway_type}',
        CASE WHEN gateway_type = '' THEN 'null'::jsonb ELSE to_jsonb(gateway_type) END,
        true
    );
    result := jsonb_set(
        result,
        '{bpmn_subprocess_kind}',
        CASE WHEN subprocess_kind = '' THEN 'null'::jsonb ELSE to_jsonb(subprocess_kind) END,
        true
    );
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION app_sanitize_business_flow_semantic(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB := app_strip_mes_json(COALESCE(payload, '{}'::jsonb));
    node JSONB;
    normalized_node JSONB;
    edge JSONB;
    clean_edge JSONB;
    nodes JSONB := '[]'::jsonb;
    edges JSONB := '[]'::jsonb;
    valid_keys TEXT[] := ARRAY[]::text[];
    data_keys TEXT[] := ARRAY[]::text[];
    node_key TEXT;
    source_key TEXT;
    target_key TEXT;
    edge_type TEXT;
    flow_type TEXT;
BEGIN
    IF jsonb_typeof(result) <> 'object' THEN
        RETURN result;
    END IF;

    FOR node IN SELECT value FROM jsonb_array_elements(COALESCE(result->'nodes', '[]'::jsonb))
    LOOP
        normalized_node := app_normalize_bpmn_node_json(node);
        IF normalized_node IS NULL THEN CONTINUE; END IF;
        node_key := COALESCE(normalized_node->>'node_key', normalized_node->>'nodeKey');
        IF node_key IS NULL OR node_key = '' THEN CONTINUE; END IF;
        nodes := nodes || jsonb_build_array(normalized_node);
        valid_keys := array_append(valid_keys, node_key);
        IF normalized_node->>'bpmn_element_type' IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE') THEN
            data_keys := array_append(data_keys, node_key);
        END IF;
    END LOOP;

    FOR edge IN SELECT value FROM jsonb_array_elements(COALESCE(result->'edges', '[]'::jsonb))
    LOOP
        clean_edge := app_strip_mes_json(edge)
            - 'mesSemantics'
            - 'mes_semantics_json';
        source_key := COALESCE(clean_edge->>'source_node_key', clean_edge->>'sourceNodeKey');
        target_key := COALESCE(clean_edge->>'target_node_key', clean_edge->>'targetNodeKey');
        IF source_key IS NULL OR target_key IS NULL THEN CONTINUE; END IF;
        IF NOT source_key = ANY(valid_keys) OR NOT target_key = ANY(valid_keys) THEN CONTINUE; END IF;
        edge_type := UPPER(COALESCE(clean_edge->>'edge_type', clean_edge->>'edgeType', ''));
        flow_type := UPPER(COALESCE(clean_edge->>'bpmn_flow_type', clean_edge->>'bpmnFlowType', ''));
        IF (source_key = ANY(data_keys) OR target_key = ANY(data_keys))
           AND (edge_type <> 'ASSOCIATION' OR flow_type <> 'ASSOCIATION') THEN
            CONTINUE;
        END IF;
        edges := edges || jsonb_build_array(clean_edge);
    END LOOP;

    result := jsonb_set(result, '{nodes}', nodes, true);
    result := jsonb_set(result, '{edges}', edges, true);
    RETURN result;
END;
$$;

DO $$
DECLARE
    already_applied BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM app_migration_state
        WHERE migration_key = '015_bpmn_generalization_cleanup'
    ) INTO already_applied;
    IF already_applied THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE removed_component_nodes (
        component_version_id UUID,
        node_key TEXT
    ) ON COMMIT DROP;
    CREATE TEMP TABLE removed_component_edges (
        component_version_id UUID,
        edge_key TEXT
    ) ON COMMIT DROP;
    CREATE TEMP TABLE removed_business_nodes (
        business_flow_id UUID,
        node_key TEXT
    ) ON COMMIT DROP;
    CREATE TEMP TABLE removed_business_edges (
        business_flow_id UUID,
        edge_key TEXT
    ) ON COMMIT DROP;

    UPDATE swimlane_component_node
    SET node_type = 'GATEWAY',
        bpmn_element_type = 'GATEWAY',
        bpmn_gateway_type = 'EXCLUSIVE',
        bpmn_event_kind = NULL,
        bpmn_event_definition = NULL,
        bpmn_task_type = NULL,
        bpmn_subprocess_kind = NULL
    WHERE node_type = 'DECISION';

    UPDATE business_flow_node
    SET node_type = 'GATEWAY',
        bpmn_element_type = 'GATEWAY',
        bpmn_gateway_type = 'EXCLUSIVE',
        bpmn_event_kind = NULL,
        bpmn_event_definition = NULL,
        bpmn_task_type = NULL,
        bpmn_subprocess_kind = NULL
    WHERE node_type = 'DECISION';

    UPDATE swimlane_component_node
    SET bpmn_element_type = CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'EVENT'
            WHEN node_type = 'TASK' THEN 'TASK'
            WHEN node_type = 'GATEWAY' THEN 'GATEWAY'
            ELSE node_type
        END,
        bpmn_event_kind = CASE
            WHEN node_type = 'START' THEN 'START'
            WHEN node_type = 'END' THEN 'END'
            WHEN node_type = 'EVENT' THEN 'INTERMEDIATE'
            ELSE bpmn_event_kind
        END,
        bpmn_event_definition = CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'NONE'
            ELSE bpmn_event_definition
        END,
        bpmn_task_type = CASE WHEN node_type = 'TASK' THEN 'NONE' ELSE bpmn_task_type END,
        bpmn_gateway_type = CASE WHEN node_type = 'GATEWAY' THEN COALESCE(bpmn_gateway_type, 'EXCLUSIVE') ELSE bpmn_gateway_type END,
        bpmn_subprocess_kind = CASE WHEN node_type = 'SUB_PROCESS' THEN COALESCE(bpmn_subprocess_kind, 'EMBEDDED') ELSE bpmn_subprocess_kind END
    WHERE bpmn_element_type IS NULL;

    UPDATE business_flow_node
    SET bpmn_element_type = CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'EVENT'
            WHEN node_type = 'TASK' THEN 'TASK'
            WHEN node_type = 'GATEWAY' THEN 'GATEWAY'
            ELSE node_type
        END,
        bpmn_event_kind = CASE
            WHEN node_type = 'START' THEN 'START'
            WHEN node_type = 'END' THEN 'END'
            WHEN node_type = 'EVENT' THEN 'INTERMEDIATE'
            ELSE bpmn_event_kind
        END,
        bpmn_event_definition = CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'NONE'
            ELSE bpmn_event_definition
        END,
        bpmn_task_type = CASE WHEN node_type = 'TASK' THEN 'NONE' ELSE bpmn_task_type END,
        bpmn_gateway_type = CASE WHEN node_type = 'GATEWAY' THEN COALESCE(bpmn_gateway_type, 'EXCLUSIVE') ELSE bpmn_gateway_type END,
        bpmn_subprocess_kind = CASE WHEN node_type = 'SUB_PROCESS' THEN COALESCE(bpmn_subprocess_kind, 'EMBEDDED') ELSE bpmn_subprocess_kind END
    WHERE bpmn_element_type IS NULL;

    INSERT INTO removed_component_nodes
    SELECT component_version_id, node_key
    FROM swimlane_component_node
    WHERE NOT (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'CALL_ACTIVITY' AND bpmn_element_type = 'CALL_ACTIVITY') OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

    INSERT INTO removed_business_nodes
    SELECT business_flow_id, node_key
    FROM business_flow_node
    WHERE NOT (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND COALESCE(bpmn_event_definition, 'NONE') = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'CALL_ACTIVITY' AND bpmn_element_type = 'CALL_ACTIVITY') OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

    INSERT INTO removed_component_edges
    SELECT DISTINCT edge.component_version_id, edge.edge_key
    FROM swimlane_component_edge edge
    LEFT JOIN swimlane_component_node source
      ON source.component_version_id = edge.component_version_id
     AND source.node_key = edge.source_node_key
    LEFT JOIN swimlane_component_node target
      ON target.component_version_id = edge.component_version_id
     AND target.node_key = edge.target_node_key
    WHERE EXISTS (
        SELECT 1 FROM removed_component_nodes removed
        WHERE removed.component_version_id = edge.component_version_id
          AND removed.node_key IN (edge.source_node_key, edge.target_node_key)
    )
       OR source.id IS NULL
       OR target.id IS NULL
       OR (
           (source.bpmn_element_type IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE')
            OR target.bpmn_element_type IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'))
           AND (edge.edge_type <> 'ASSOCIATION' OR edge.bpmn_flow_type <> 'ASSOCIATION')
       );

    INSERT INTO removed_business_edges
    SELECT DISTINCT edge.business_flow_id, edge.edge_key
    FROM business_flow_edge edge
    LEFT JOIN business_flow_node source ON source.id = edge.source_node_id
    LEFT JOIN business_flow_node target ON target.id = edge.target_node_id
    WHERE EXISTS (
        SELECT 1 FROM removed_business_nodes removed
        WHERE removed.business_flow_id = edge.business_flow_id
          AND removed.node_key IN (source.node_key, target.node_key)
    )
       OR (edge.source_type = 'NODE' AND source.id IS NULL)
       OR (edge.target_type = 'NODE' AND target.id IS NULL)
       OR (
           (source.bpmn_element_type IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE')
            OR target.bpmn_element_type IN ('DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'))
           AND (edge.edge_type <> 'ASSOCIATION' OR edge.bpmn_flow_type <> 'ASSOCIATION')
       );

    DELETE FROM swimlane_component_edge edge
    USING removed_component_edges removed
    WHERE edge.component_version_id = removed.component_version_id
      AND edge.edge_key = removed.edge_key;

    DELETE FROM business_flow_edge edge
    USING removed_business_edges removed
    WHERE edge.business_flow_id = removed.business_flow_id
      AND edge.edge_key = removed.edge_key;

    DELETE FROM swimlane_component_node node
    USING removed_component_nodes removed
    WHERE node.component_version_id = removed.component_version_id
      AND node.node_key = removed.node_key;

    DELETE FROM business_flow_node node
    USING removed_business_nodes removed
    WHERE node.business_flow_id = removed.business_flow_id
      AND node.node_key = removed.node_key;

    UPDATE swimlane_component_node
    SET properties_json = app_strip_mes_json(properties_json);
    UPDATE swimlane_component_edge
    SET properties_json = app_strip_mes_json(properties_json);
    UPDATE business_flow_node
    SET properties_json = app_strip_mes_json(properties_json);
    UPDATE business_flow_edge
    SET properties_json = app_strip_mes_json(properties_json);
    UPDATE swimlane_component_version
    SET canvas_json = app_strip_mes_json(canvas_json),
        semantic_json = app_strip_mes_json(semantic_json);

    UPDATE business_flow_snapshot
    SET semantic_json = app_sanitize_business_flow_semantic(semantic_json),
        canvas_json = CASE
            WHEN jsonb_typeof(canvas_json) = 'object' AND canvas_json ? 'semantic'
                THEN jsonb_set(
                    app_strip_mes_json(canvas_json),
                    '{semantic}',
                    app_sanitize_business_flow_semantic(canvas_json->'semantic'),
                    true
                )
            ELSE app_strip_mes_json(canvas_json)
        END;

    DELETE FROM business_flow_change_op op
    USING business_flow_change_batch batch, removed_business_nodes removed
    WHERE op.batch_id = batch.id
      AND batch.business_flow_id = removed.business_flow_id
      AND op.target_type = 'NODE'
      AND op.target_key = removed.node_key;

    DELETE FROM business_flow_change_op op
    USING business_flow_change_batch batch, removed_business_edges removed
    WHERE op.batch_id = batch.id
      AND batch.business_flow_id = removed.business_flow_id
      AND op.target_type = 'EDGE'
      AND op.target_key = removed.edge_key;

    DELETE FROM business_flow_change_op
    WHERE op_type = 'ADD_NODE'
      AND app_normalize_bpmn_node_json(patch_json) IS NULL;

    UPDATE business_flow_change_op
    SET patch_json = app_strip_mes_json(patch_json),
        inverse_patch_json = app_strip_mes_json(inverse_patch_json);

    DELETE FROM collab_document
    WHERE owner_type IN ('BUSINESS_FLOW', 'SWIMLANE_COMPONENT_DRAFT');

    UPDATE business_flow
    SET collab_revision = collab_revision + 1,
        updated_at = NOW();

    INSERT INTO app_migration_state (migration_key)
    VALUES ('015_bpmn_generalization_cleanup');
END;
$$;

ALTER TABLE swimlane_component_node
    DROP COLUMN IF EXISTS mes_semantics_json,
    DROP COLUMN IF EXISTS bpmn_boundary_attached_to_node_key;
ALTER TABLE business_flow_node
    DROP COLUMN IF EXISTS mes_semantics_json,
    DROP COLUMN IF EXISTS bpmn_boundary_attached_to_node_key;
ALTER TABLE swimlane_component_edge
    DROP COLUMN IF EXISTS mes_semantics_json;
ALTER TABLE business_flow_edge
    DROP COLUMN IF EXISTS mes_semantics_json;

ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_type;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_type;
ALTER TABLE swimlane_component_edge DROP CONSTRAINT IF EXISTS ck_swimlane_component_edge_type;
ALTER TABLE business_flow_edge DROP CONSTRAINT IF EXISTS ck_business_flow_edge_type;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_element_type;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_element_type;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_event_kind;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_event_kind;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_task_type;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_task_type;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_gateway_type;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_gateway_type;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_subprocess_kind;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_subprocess_kind;
ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_bpmn_profile;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_bpmn_profile;

ALTER TABLE swimlane_component_node
    ADD CONSTRAINT ck_swimlane_component_node_type CHECK (
        node_type IN (
            'START', 'END', 'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'CALL_ACTIVITY', 'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_element_type CHECK (
        bpmn_element_type IN (
            'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_event_kind CHECK (
        bpmn_event_kind IS NULL OR bpmn_event_kind IN ('START', 'INTERMEDIATE', 'END')
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_task_type CHECK (
        bpmn_task_type IS NULL OR bpmn_task_type = 'NONE'
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_gateway_type CHECK (
        bpmn_gateway_type IS NULL OR bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_subprocess_kind CHECK (
        bpmn_subprocess_kind IS NULL OR bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')
    ),
    ADD CONSTRAINT ck_swimlane_component_node_bpmn_profile CHECK (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'CALL_ACTIVITY' AND bpmn_element_type = 'CALL_ACTIVITY') OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

ALTER TABLE business_flow_node
    ADD CONSTRAINT ck_business_flow_node_type CHECK (
        node_type IN (
            'START', 'END', 'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS',
            'CALL_ACTIVITY', 'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_element_type CHECK (
        bpmn_element_type IN (
            'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY',
            'DATA_OBJECT', 'DATA_INPUT', 'DATA_OUTPUT', 'DATA_STORE'
        )
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_event_kind CHECK (
        bpmn_event_kind IS NULL OR bpmn_event_kind IN ('START', 'INTERMEDIATE', 'END')
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_task_type CHECK (
        bpmn_task_type IS NULL OR bpmn_task_type = 'NONE'
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_gateway_type CHECK (
        bpmn_gateway_type IS NULL OR bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_subprocess_kind CHECK (
        bpmn_subprocess_kind IS NULL OR bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')
    ),
    ADD CONSTRAINT ck_business_flow_node_bpmn_profile CHECK (
        (node_type = 'START' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'START' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'END' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'END' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'EVENT' AND bpmn_element_type = 'EVENT' AND bpmn_event_kind = 'INTERMEDIATE' AND bpmn_event_definition = 'NONE') OR
        (node_type = 'TASK' AND bpmn_element_type = 'TASK' AND COALESCE(bpmn_task_type, 'NONE') = 'NONE') OR
        (node_type = 'GATEWAY' AND bpmn_element_type = 'GATEWAY' AND bpmn_gateway_type IN ('EXCLUSIVE', 'INCLUSIVE', 'PARALLEL', 'COMPLEX')) OR
        (node_type = 'SUB_PROCESS' AND bpmn_element_type = 'SUB_PROCESS' AND bpmn_subprocess_kind IN ('EMBEDDED', 'TRANSACTION')) OR
        (node_type = 'CALL_ACTIVITY' AND bpmn_element_type = 'CALL_ACTIVITY') OR
        (node_type = 'DATA_OBJECT' AND bpmn_element_type = 'DATA_OBJECT') OR
        (node_type = 'DATA_INPUT' AND bpmn_element_type = 'DATA_INPUT') OR
        (node_type = 'DATA_OUTPUT' AND bpmn_element_type = 'DATA_OUTPUT') OR
        (node_type = 'DATA_STORE' AND bpmn_element_type = 'DATA_STORE')
    );

ALTER TABLE swimlane_component_edge
    ADD CONSTRAINT ck_swimlane_component_edge_type CHECK (
        edge_type IN ('SEQUENCE', 'MESSAGE', 'ASSOCIATION', 'TRIGGER', 'DATA_FLOW', 'CALL', 'DEPENDENCY', 'EXCEPTION')
    );
ALTER TABLE business_flow_edge
    ADD CONSTRAINT ck_business_flow_edge_type CHECK (
        edge_type IN ('SEQUENCE', 'MESSAGE', 'ASSOCIATION', 'TRIGGER', 'DATA_FLOW', 'CALL', 'DEPENDENCY', 'EXCEPTION')
    );

COMMENT ON COLUMN swimlane_component_node.bpmn_element_type IS
    '通用 BPMN 元素：EVENT/TASK/GATEWAY/SUB_PROCESS/CALL_ACTIVITY/DATA_OBJECT/DATA_INPUT/DATA_OUTPUT/DATA_STORE';
COMMENT ON COLUMN business_flow_node.bpmn_element_type IS
    '通用 BPMN 元素，业务图节点可覆盖来源组件';

DROP FUNCTION IF EXISTS app_sanitize_business_flow_semantic(JSONB);
DROP FUNCTION IF EXISTS app_normalize_bpmn_node_json(JSONB);
DROP FUNCTION IF EXISTS app_strip_mes_json(JSONB);
