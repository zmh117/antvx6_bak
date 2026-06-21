-- Business Flow BPMN/MES semantic model.
-- Adds explicit BPMN fields while keeping legacy node_type/edge_type for compatibility.

ALTER TABLE swimlane_component_node
    ADD COLUMN IF NOT EXISTS bpmn_element_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_event_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_event_definition TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_task_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_gateway_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_subprocess_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_call_activity_ref TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_boundary_attached_to_node_key TEXT,
    ADD COLUMN IF NOT EXISTS mes_semantics_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_flow_node
    ADD COLUMN IF NOT EXISTS bpmn_element_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_event_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_event_definition TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_task_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_gateway_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_subprocess_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_call_activity_ref TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_boundary_attached_to_node_key TEXT,
    ADD COLUMN IF NOT EXISTS mes_semantics_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE swimlane_component_edge
    ADD COLUMN IF NOT EXISTS bpmn_flow_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_sequence_flow_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_message_name TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_condition_expression TEXT,
    ADD COLUMN IF NOT EXISTS mes_semantics_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE business_flow_edge
    ADD COLUMN IF NOT EXISTS bpmn_flow_type TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_sequence_flow_kind TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_message_name TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_condition_expression TEXT,
    ADD COLUMN IF NOT EXISTS mes_semantics_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE swimlane_component_node
SET
    bpmn_element_type = COALESCE(
        bpmn_element_type,
        CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'EVENT'
            WHEN node_type IN ('DECISION', 'GATEWAY') THEN 'GATEWAY'
            WHEN node_type = 'SUB_PROCESS' THEN 'SUB_PROCESS'
            WHEN node_type = 'CALL_ACTIVITY' THEN 'CALL_ACTIVITY'
            WHEN node_type = 'DATA_OBJECT' THEN 'DATA_OBJECT'
            WHEN node_type = 'TEXT_ANNOTATION' THEN 'TEXT_ANNOTATION'
            ELSE 'TASK'
        END
    ),
    bpmn_event_kind = COALESCE(
        bpmn_event_kind,
        CASE
            WHEN node_type = 'START' THEN 'START'
            WHEN node_type = 'END' THEN 'END'
            WHEN node_type = 'EVENT' THEN 'INTERMEDIATE'
            ELSE NULL
        END
    ),
    bpmn_event_definition = COALESCE(
        bpmn_event_definition,
        CASE WHEN node_type IN ('START', 'END', 'EVENT') THEN 'NONE' ELSE NULL END
    ),
    bpmn_task_type = COALESCE(
        bpmn_task_type,
        CASE
            WHEN node_type = 'SERVICE' THEN 'SERVICE'
            WHEN node_type = 'MANUAL' THEN 'MANUAL'
            WHEN node_type = 'TASK' THEN 'NONE'
            ELSE NULL
        END
    ),
    bpmn_gateway_type = COALESCE(
        bpmn_gateway_type,
        CASE WHEN node_type IN ('DECISION', 'GATEWAY') THEN 'EXCLUSIVE' ELSE NULL END
    ),
    bpmn_subprocess_kind = COALESCE(
        bpmn_subprocess_kind,
        CASE WHEN node_type = 'SUB_PROCESS' THEN 'EMBEDDED' ELSE NULL END
    );

UPDATE business_flow_node
SET
    bpmn_element_type = COALESCE(
        bpmn_element_type,
        CASE
            WHEN node_type IN ('START', 'END', 'EVENT') THEN 'EVENT'
            WHEN node_type IN ('DECISION', 'GATEWAY') THEN 'GATEWAY'
            WHEN node_type = 'SUB_PROCESS' THEN 'SUB_PROCESS'
            WHEN node_type = 'CALL_ACTIVITY' THEN 'CALL_ACTIVITY'
            WHEN node_type = 'DATA_OBJECT' THEN 'DATA_OBJECT'
            WHEN node_type = 'TEXT_ANNOTATION' THEN 'TEXT_ANNOTATION'
            ELSE 'TASK'
        END
    ),
    bpmn_event_kind = COALESCE(
        bpmn_event_kind,
        CASE
            WHEN node_type = 'START' THEN 'START'
            WHEN node_type = 'END' THEN 'END'
            WHEN node_type = 'EVENT' THEN 'INTERMEDIATE'
            ELSE NULL
        END
    ),
    bpmn_event_definition = COALESCE(
        bpmn_event_definition,
        CASE WHEN node_type IN ('START', 'END', 'EVENT') THEN 'NONE' ELSE NULL END
    ),
    bpmn_task_type = COALESCE(
        bpmn_task_type,
        CASE
            WHEN node_type = 'SERVICE' THEN 'SERVICE'
            WHEN node_type = 'MANUAL' THEN 'MANUAL'
            WHEN node_type = 'TASK' THEN 'NONE'
            ELSE NULL
        END
    ),
    bpmn_gateway_type = COALESCE(
        bpmn_gateway_type,
        CASE WHEN node_type IN ('DECISION', 'GATEWAY') THEN 'EXCLUSIVE' ELSE NULL END
    ),
    bpmn_subprocess_kind = COALESCE(
        bpmn_subprocess_kind,
        CASE WHEN node_type = 'SUB_PROCESS' THEN 'EMBEDDED' ELSE NULL END
    );

UPDATE swimlane_component_edge
SET
    bpmn_flow_type = COALESCE(
        bpmn_flow_type,
        CASE
            WHEN edge_type = 'MESSAGE' THEN 'MESSAGE'
            WHEN edge_type IN ('ASSOCIATION', 'DATA_FLOW') THEN 'ASSOCIATION'
            ELSE 'SEQUENCE'
        END
    ),
    bpmn_sequence_flow_kind = COALESCE(
        bpmn_sequence_flow_kind,
        CASE WHEN edge_type = 'EXCEPTION' THEN 'EXCEPTION' ELSE 'NORMAL' END
    );

UPDATE business_flow_edge
SET
    bpmn_flow_type = COALESCE(
        bpmn_flow_type,
        CASE
            WHEN edge_type = 'MESSAGE' THEN 'MESSAGE'
            WHEN edge_type IN ('ASSOCIATION', 'DATA_FLOW') THEN 'ASSOCIATION'
            ELSE 'SEQUENCE'
        END
    ),
    bpmn_sequence_flow_kind = COALESCE(
        bpmn_sequence_flow_kind,
        CASE WHEN edge_type = 'EXCEPTION' THEN 'EXCEPTION' ELSE 'NORMAL' END
    );

ALTER TABLE swimlane_component_node DROP CONSTRAINT IF EXISTS ck_swimlane_component_node_type;
ALTER TABLE business_flow_node DROP CONSTRAINT IF EXISTS ck_business_flow_node_type;
ALTER TABLE swimlane_component_edge DROP CONSTRAINT IF EXISTS ck_swimlane_component_edge_type;
ALTER TABLE business_flow_edge DROP CONSTRAINT IF EXISTS ck_business_flow_edge_type;

ALTER TABLE swimlane_component_node
    ADD CONSTRAINT ck_swimlane_component_node_type
    CHECK (node_type IN (
        'START', 'END', 'TASK', 'DECISION', 'SERVICE', 'MANUAL', 'EVENT',
        'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY', 'DATA_OBJECT', 'TEXT_ANNOTATION'
    ));

ALTER TABLE business_flow_node
    ADD CONSTRAINT ck_business_flow_node_type
    CHECK (node_type IN (
        'START', 'END', 'TASK', 'DECISION', 'SERVICE', 'MANUAL', 'EVENT',
        'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY', 'DATA_OBJECT', 'TEXT_ANNOTATION'
    ));

ALTER TABLE swimlane_component_edge
    ADD CONSTRAINT ck_swimlane_component_edge_type
    CHECK (edge_type IN (
        'SEQUENCE', 'MESSAGE', 'ASSOCIATION', 'TRIGGER', 'DATA_FLOW', 'CALL',
        'DEPENDENCY', 'EXCEPTION'
    ));

ALTER TABLE business_flow_edge
    ADD CONSTRAINT ck_business_flow_edge_type
    CHECK (edge_type IN (
        'SEQUENCE', 'MESSAGE', 'ASSOCIATION', 'TRIGGER', 'DATA_FLOW', 'CALL',
        'DEPENDENCY', 'EXCEPTION'
    ));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_element_type'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_element_type
            CHECK (bpmn_element_type IS NULL OR bpmn_element_type IN (
                'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY',
                'DATA_OBJECT', 'TEXT_ANNOTATION'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_element_type'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_element_type
            CHECK (bpmn_element_type IS NULL OR bpmn_element_type IN (
                'EVENT', 'TASK', 'GATEWAY', 'SUB_PROCESS', 'CALL_ACTIVITY',
                'DATA_OBJECT', 'TEXT_ANNOTATION'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_edge_bpmn_flow_type'
          AND conrelid = 'swimlane_component_edge'::regclass
    ) THEN
        ALTER TABLE swimlane_component_edge
            ADD CONSTRAINT ck_swimlane_component_edge_bpmn_flow_type
            CHECK (bpmn_flow_type IS NULL OR bpmn_flow_type IN ('SEQUENCE', 'MESSAGE', 'ASSOCIATION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_bpmn_flow_type'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_bpmn_flow_type
            CHECK (bpmn_flow_type IS NULL OR bpmn_flow_type IN ('SEQUENCE', 'MESSAGE', 'ASSOCIATION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_event_kind'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_event_kind
            CHECK (bpmn_event_kind IS NULL OR bpmn_event_kind IN ('START', 'INTERMEDIATE', 'END', 'BOUNDARY'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_event_kind'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_event_kind
            CHECK (bpmn_event_kind IS NULL OR bpmn_event_kind IN ('START', 'INTERMEDIATE', 'END', 'BOUNDARY'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_event_definition'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_event_definition
            CHECK (bpmn_event_definition IS NULL OR bpmn_event_definition IN (
                'NONE', 'MESSAGE', 'TIMER', 'ERROR', 'ESCALATION', 'CONDITIONAL',
                'SIGNAL', 'LINK', 'MULTIPLE', 'TERMINATE', 'CANCEL', 'COMPENSATION'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_event_definition'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_event_definition
            CHECK (bpmn_event_definition IS NULL OR bpmn_event_definition IN (
                'NONE', 'MESSAGE', 'TIMER', 'ERROR', 'ESCALATION', 'CONDITIONAL',
                'SIGNAL', 'LINK', 'MULTIPLE', 'TERMINATE', 'CANCEL', 'COMPENSATION'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_task_type'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_task_type
            CHECK (bpmn_task_type IS NULL OR bpmn_task_type IN (
                'NONE', 'USER', 'SERVICE', 'MANUAL', 'SCRIPT', 'BUSINESS_RULE', 'RECEIVE', 'SEND'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_task_type'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_task_type
            CHECK (bpmn_task_type IS NULL OR bpmn_task_type IN (
                'NONE', 'USER', 'SERVICE', 'MANUAL', 'SCRIPT', 'BUSINESS_RULE', 'RECEIVE', 'SEND'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_gateway_type'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_gateway_type
            CHECK (bpmn_gateway_type IS NULL OR bpmn_gateway_type IN (
                'EXCLUSIVE', 'PARALLEL', 'INCLUSIVE', 'EVENT_BASED', 'COMPLEX'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_gateway_type'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_gateway_type
            CHECK (bpmn_gateway_type IS NULL OR bpmn_gateway_type IN (
                'EXCLUSIVE', 'PARALLEL', 'INCLUSIVE', 'EVENT_BASED', 'COMPLEX'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_node_bpmn_subprocess_kind'
          AND conrelid = 'swimlane_component_node'::regclass
    ) THEN
        ALTER TABLE swimlane_component_node
            ADD CONSTRAINT ck_swimlane_component_node_bpmn_subprocess_kind
            CHECK (bpmn_subprocess_kind IS NULL OR bpmn_subprocess_kind IN (
                'EMBEDDED', 'TRANSACTION', 'EVENT_SUB_PROCESS'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_node_bpmn_subprocess_kind'
          AND conrelid = 'business_flow_node'::regclass
    ) THEN
        ALTER TABLE business_flow_node
            ADD CONSTRAINT ck_business_flow_node_bpmn_subprocess_kind
            CHECK (bpmn_subprocess_kind IS NULL OR bpmn_subprocess_kind IN (
                'EMBEDDED', 'TRANSACTION', 'EVENT_SUB_PROCESS'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_swimlane_component_edge_bpmn_sequence_flow_kind'
          AND conrelid = 'swimlane_component_edge'::regclass
    ) THEN
        ALTER TABLE swimlane_component_edge
            ADD CONSTRAINT ck_swimlane_component_edge_bpmn_sequence_flow_kind
            CHECK (bpmn_sequence_flow_kind IS NULL OR bpmn_sequence_flow_kind IN ('NORMAL', 'CONDITIONAL', 'DEFAULT', 'EXCEPTION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_business_flow_edge_bpmn_sequence_flow_kind'
          AND conrelid = 'business_flow_edge'::regclass
    ) THEN
        ALTER TABLE business_flow_edge
            ADD CONSTRAINT ck_business_flow_edge_bpmn_sequence_flow_kind
            CHECK (bpmn_sequence_flow_kind IS NULL OR bpmn_sequence_flow_kind IN ('NORMAL', 'CONDITIONAL', 'DEFAULT', 'EXCEPTION'));
    END IF;
END $$;

COMMENT ON COLUMN swimlane_component_node.bpmn_element_type IS 'BPMN 元素类型：EVENT / TASK / GATEWAY / SUB_PROCESS / CALL_ACTIVITY / DATA_OBJECT / TEXT_ANNOTATION';
COMMENT ON COLUMN swimlane_component_node.mes_semantics_json IS 'MES 业务语义：变量、系统配置、主配方、处方、物料、批记录、审计追踪等';
COMMENT ON COLUMN business_flow_node.bpmn_element_type IS 'BPMN 元素类型，实例节点可覆盖来源组件';
COMMENT ON COLUMN business_flow_node.mes_semantics_json IS 'MES 业务语义，实例节点可覆盖来源组件';
COMMENT ON COLUMN swimlane_component_edge.bpmn_flow_type IS 'BPMN 连线类型：SEQUENCE / MESSAGE / ASSOCIATION';
COMMENT ON COLUMN business_flow_edge.bpmn_flow_type IS 'BPMN 连线类型，实例连线可覆盖来源组件';
COMMENT ON COLUMN swimlane_component_edge.mes_semantics_json IS '连线上的 MES 数据契约和业务语义';
COMMENT ON COLUMN business_flow_edge.mes_semantics_json IS '实例连线上的 MES 数据契约和业务语义';
