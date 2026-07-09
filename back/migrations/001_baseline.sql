-- AntV X6 Graph Workbench baseline schema.
-- Consolidated from historical migrations 001-020 into a single fresh-install baseline.
-- Existing databases that already contain public.er_graph should not re-run this file.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE public.app_migration_state (
    migration_key text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.app_migration_state IS '应用迁移执行状态表';

COMMENT ON COLUMN public.app_migration_state.migration_key IS '迁移唯一标识';

COMMENT ON COLUMN public.app_migration_state.applied_at IS '迁移完成时间';

CREATE TABLE public.app_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.app_session IS '用户登录会话表';

COMMENT ON COLUMN public.app_session.id IS '记录主键';

COMMENT ON COLUMN public.app_session.user_id IS '关联 app_user.id 的记录主键';

COMMENT ON COLUMN public.app_session.refresh_token_hash IS '业务字段：refresh_token_hash';

COMMENT ON COLUMN public.app_session.expires_at IS '业务字段：expires_at';

COMMENT ON COLUMN public.app_session.revoked_at IS '业务字段：revoked_at';

COMMENT ON COLUMN public.app_session.created_at IS '创建审计信息';

CREATE TABLE public.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.app_user IS '应用用户表';

COMMENT ON COLUMN public.app_user.id IS '记录主键';

COMMENT ON COLUMN public.app_user.email IS '业务字段：email';

COMMENT ON COLUMN public.app_user.display_name IS '业务字段：display_name';

COMMENT ON COLUMN public.app_user.password_hash IS '业务字段：password_hash';

COMMENT ON COLUMN public.app_user.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.app_user.created_at IS '创建审计信息';

COMMENT ON COLUMN public.app_user.updated_at IS '更新审计信息';

CREATE TABLE public.business_flow (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    current_version bigint DEFAULT 1 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    collab_revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT ck_business_flow_status CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])))
);

COMMENT ON TABLE public.business_flow IS '业务流程图主表';

COMMENT ON COLUMN public.business_flow.id IS '记录主键';

COMMENT ON COLUMN public.business_flow.product_id IS '关联 product.id 的记录主键';

COMMENT ON COLUMN public.business_flow.name IS '显示名称';

COMMENT ON COLUMN public.business_flow.code IS '业务编码';

COMMENT ON COLUMN public.business_flow.description IS '业务说明';

COMMENT ON COLUMN public.business_flow.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow.current_version IS '版本号';

COMMENT ON COLUMN public.business_flow.created_by IS '创建审计信息';

COMMENT ON COLUMN public.business_flow.created_at IS '创建审计信息';

COMMENT ON COLUMN public.business_flow.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.business_flow.deleted_at IS '软删除审计信息';

COMMENT ON COLUMN public.business_flow.collab_revision IS '业务字段：collab_revision';

CREATE TABLE public.business_flow_change_batch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    base_version bigint NOT NULL,
    new_version bigint NOT NULL,
    source text DEFAULT 'USER'::text NOT NULL,
    summary text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.business_flow_change_batch IS '业务流程增量变更批次表';

COMMENT ON COLUMN public.business_flow_change_batch.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_change_batch.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_change_batch.base_version IS '版本号';

COMMENT ON COLUMN public.business_flow_change_batch.new_version IS '版本号';

COMMENT ON COLUMN public.business_flow_change_batch.source IS '业务字段：source';

COMMENT ON COLUMN public.business_flow_change_batch.summary IS '业务字段：summary';

COMMENT ON COLUMN public.business_flow_change_batch.created_by IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_change_batch.created_at IS '创建审计信息';

CREATE TABLE public.business_flow_change_op (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    op_seq integer NOT NULL,
    op_type text NOT NULL,
    target_type text NOT NULL,
    target_key text NOT NULL,
    patch_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    inverse_patch_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.business_flow_change_op IS '业务流程增量变更操作表';

COMMENT ON COLUMN public.business_flow_change_op.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_change_op.batch_id IS '关联 business_flow_change_batch.id 的记录主键';

COMMENT ON COLUMN public.business_flow_change_op.op_seq IS '业务字段：op_seq';

COMMENT ON COLUMN public.business_flow_change_op.op_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_change_op.target_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_change_op.target_key IS '稳定业务标识';

COMMENT ON COLUMN public.business_flow_change_op.patch_json IS '正向变更补丁 JSON';

COMMENT ON COLUMN public.business_flow_change_op.inverse_patch_json IS '反向恢复补丁 JSON';

COMMENT ON COLUMN public.business_flow_change_op.summary IS '业务字段：summary';

COMMENT ON COLUMN public.business_flow_change_op.created_at IS '创建审计信息';

CREATE TABLE public.business_flow_edge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    lane_instance_id uuid,
    edge_key text NOT NULL,
    source_type text NOT NULL,
    source_node_id uuid,
    source_lane_instance_id uuid,
    source_port text,
    target_type text NOT NULL,
    target_node_id uuid,
    target_lane_instance_id uuid,
    target_port text,
    edge_type text DEFAULT 'SEQUENCE'::text NOT NULL,
    label text,
    origin_component_edge_key text,
    is_overridden boolean DEFAULT false NOT NULL,
    style_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    properties_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bpmn_flow_type text,
    bpmn_sequence_flow_kind text,
    bpmn_semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ck_business_flow_edge_bpmn_flow_type CHECK (((bpmn_flow_type IS NULL) OR (bpmn_flow_type = ANY (ARRAY['SEQUENCE'::text, 'MESSAGE'::text, 'ASSOCIATION'::text])))),
    CONSTRAINT ck_business_flow_edge_bpmn_sequence_flow_kind CHECK (((bpmn_sequence_flow_kind IS NULL) OR (bpmn_sequence_flow_kind = ANY (ARRAY['NORMAL'::text, 'CONDITIONAL'::text, 'DEFAULT'::text, 'EXCEPTION'::text])))),
    CONSTRAINT ck_business_flow_edge_source_endpoint CHECK ((((source_type = 'NODE'::text) AND (source_node_id IS NOT NULL) AND (source_lane_instance_id IS NULL)) OR ((source_type = 'LANE'::text) AND (source_lane_instance_id IS NOT NULL) AND (source_node_id IS NULL)))),
    CONSTRAINT ck_business_flow_edge_source_type CHECK ((source_type = ANY (ARRAY['NODE'::text, 'LANE'::text]))),
    CONSTRAINT ck_business_flow_edge_target_endpoint CHECK ((((target_type = 'NODE'::text) AND (target_node_id IS NOT NULL) AND (target_lane_instance_id IS NULL)) OR ((target_type = 'LANE'::text) AND (target_lane_instance_id IS NOT NULL) AND (target_node_id IS NULL)))),
    CONSTRAINT ck_business_flow_edge_target_type CHECK ((target_type = ANY (ARRAY['NODE'::text, 'LANE'::text]))),
    CONSTRAINT ck_business_flow_edge_type CHECK ((edge_type = ANY (ARRAY['SEQUENCE'::text, 'MESSAGE'::text, 'ASSOCIATION'::text, 'TRIGGER'::text, 'DATA_FLOW'::text, 'CALL'::text, 'DEPENDENCY'::text, 'EXCEPTION'::text])))
);

COMMENT ON TABLE public.business_flow_edge IS '业务流程图 BPMN 连线实例表';

COMMENT ON COLUMN public.business_flow_edge.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_edge.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.lane_instance_id IS '关联 business_flow_lane_instance.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.edge_key IS '连线稳定业务键';

COMMENT ON COLUMN public.business_flow_edge.source_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_edge.source_node_id IS '关联 business_flow_node.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.source_lane_instance_id IS '关联 business_flow_lane_instance.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.source_port IS '业务字段：source_port';

COMMENT ON COLUMN public.business_flow_edge.target_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_edge.target_node_id IS '关联 business_flow_node.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.target_lane_instance_id IS '关联 business_flow_lane_instance.id 的记录主键';

COMMENT ON COLUMN public.business_flow_edge.target_port IS '业务字段：target_port';

COMMENT ON COLUMN public.business_flow_edge.edge_type IS '连线兼容类型标识';

COMMENT ON COLUMN public.business_flow_edge.label IS '连线显示名称';

COMMENT ON COLUMN public.business_flow_edge.origin_component_edge_key IS '稳定业务标识';

COMMENT ON COLUMN public.business_flow_edge.is_overridden IS '布尔状态标记';

COMMENT ON COLUMN public.business_flow_edge.style_json IS '画布样式 JSON';

COMMENT ON COLUMN public.business_flow_edge.properties_json IS '扩展属性 JSON';

COMMENT ON COLUMN public.business_flow_edge.created_at IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_edge.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.business_flow_edge.bpmn_flow_type IS 'BPMN 连线类型';

COMMENT ON COLUMN public.business_flow_edge.bpmn_sequence_flow_kind IS 'BPMN 顺序流类型';

COMMENT ON COLUMN public.business_flow_edge.bpmn_semantic_json IS 'BPMN 类型专属业务语义 JSON';

CREATE TABLE public.business_flow_lane_instance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    instance_key text NOT NULL,
    component_id uuid NOT NULL,
    component_version_id uuid NOT NULL,
    display_name text NOT NULL,
    owner_role text,
    position_x numeric DEFAULT 0 NOT NULL,
    position_y numeric DEFAULT 0 NOT NULL,
    width numeric DEFAULT 240 NOT NULL,
    height numeric DEFAULT 600 NOT NULL,
    z_index integer DEFAULT 0 NOT NULL,
    layout_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    override_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_business_flow_lane_instance_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'REMOVED'::text])))
);

COMMENT ON TABLE public.business_flow_lane_instance IS '业务流程图泳道实例表';

COMMENT ON COLUMN public.business_flow_lane_instance.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_lane_instance.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_lane_instance.instance_key IS '泳道实例稳定业务键';

COMMENT ON COLUMN public.business_flow_lane_instance.component_id IS '关联 swimlane_component.id 的记录主键';

COMMENT ON COLUMN public.business_flow_lane_instance.component_version_id IS '关联 swimlane_component_version.id 的记录主键';

COMMENT ON COLUMN public.business_flow_lane_instance.display_name IS '业务字段：display_name';

COMMENT ON COLUMN public.business_flow_lane_instance.owner_role IS '业务字段：owner_role';

COMMENT ON COLUMN public.business_flow_lane_instance.position_x IS '画布坐标';

COMMENT ON COLUMN public.business_flow_lane_instance.position_y IS '画布坐标';

COMMENT ON COLUMN public.business_flow_lane_instance.width IS '画布尺寸';

COMMENT ON COLUMN public.business_flow_lane_instance.height IS '画布尺寸';

COMMENT ON COLUMN public.business_flow_lane_instance.z_index IS '画布层级顺序';

COMMENT ON COLUMN public.business_flow_lane_instance.layout_json IS '布局配置 JSON';

COMMENT ON COLUMN public.business_flow_lane_instance.override_json IS '实例覆盖配置 JSON';

COMMENT ON COLUMN public.business_flow_lane_instance.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_lane_instance.created_by IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_lane_instance.created_at IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_lane_instance.updated_at IS '更新审计信息';

CREATE TABLE public.business_flow_member (
    business_flow_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_business_flow_member_role CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))
);

COMMENT ON TABLE public.business_flow_member IS '业务流程图成员及权限表';

COMMENT ON COLUMN public.business_flow_member.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_member.user_id IS '关联 app_user.id 的记录主键';

COMMENT ON COLUMN public.business_flow_member.role IS '业务字段：role';

COMMENT ON COLUMN public.business_flow_member.created_at IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_member.updated_at IS '更新审计信息';

CREATE TABLE public.business_flow_node (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    lane_instance_id uuid,
    node_key text NOT NULL,
    origin_component_node_key text,
    node_type text NOT NULL,
    title text NOT NULL,
    position_x numeric DEFAULT 0 NOT NULL,
    position_y numeric DEFAULT 0 NOT NULL,
    width numeric DEFAULT 120 NOT NULL,
    height numeric DEFAULT 60 NOT NULL,
    is_overridden boolean DEFAULT false NOT NULL,
    style_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    properties_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bpmn_element_type text,
    bpmn_event_kind text,
    bpmn_event_definition text,
    bpmn_task_type text,
    bpmn_gateway_type text,
    bpmn_subprocess_kind text,
    task_ui_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    bpmn_semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ck_business_flow_node_bpmn_element_type CHECK ((bpmn_element_type = ANY (ARRAY['EVENT'::text, 'TASK'::text, 'GATEWAY'::text, 'SUB_PROCESS'::text, 'DATA_OBJECT'::text, 'DATA_INPUT'::text, 'DATA_OUTPUT'::text, 'DATA_STORE'::text]))),
    CONSTRAINT ck_business_flow_node_bpmn_event_definition CHECK (((bpmn_event_definition IS NULL) OR (bpmn_event_definition = ANY (ARRAY['NONE'::text, 'MESSAGE'::text, 'TIMER'::text, 'ERROR'::text, 'ESCALATION'::text, 'CONDITIONAL'::text, 'SIGNAL'::text, 'LINK'::text, 'MULTIPLE'::text, 'TERMINATE'::text, 'CANCEL'::text, 'COMPENSATION'::text])))),
    CONSTRAINT ck_business_flow_node_bpmn_event_kind CHECK (((bpmn_event_kind IS NULL) OR (bpmn_event_kind = ANY (ARRAY['START'::text, 'INTERMEDIATE'::text, 'END'::text])))),
    CONSTRAINT ck_business_flow_node_bpmn_gateway_type CHECK (((bpmn_gateway_type IS NULL) OR (bpmn_gateway_type = ANY (ARRAY['EXCLUSIVE'::text, 'INCLUSIVE'::text, 'PARALLEL'::text, 'COMPLEX'::text])))),
    CONSTRAINT ck_business_flow_node_bpmn_profile CHECK ((((node_type = 'START'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'START'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'END'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'END'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'EVENT'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'INTERMEDIATE'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'TASK'::text) AND (bpmn_element_type = 'TASK'::text) AND (COALESCE(bpmn_task_type, 'NONE'::text) = 'NONE'::text)) OR ((node_type = 'GATEWAY'::text) AND (bpmn_element_type = 'GATEWAY'::text) AND (bpmn_gateway_type = ANY (ARRAY['EXCLUSIVE'::text, 'INCLUSIVE'::text, 'PARALLEL'::text, 'COMPLEX'::text]))) OR ((node_type = 'SUB_PROCESS'::text) AND (bpmn_element_type = 'SUB_PROCESS'::text) AND (bpmn_subprocess_kind = ANY (ARRAY['EMBEDDED'::text, 'TRANSACTION'::text]))) OR ((node_type = 'DATA_OBJECT'::text) AND (bpmn_element_type = 'DATA_OBJECT'::text)) OR ((node_type = 'DATA_INPUT'::text) AND (bpmn_element_type = 'DATA_INPUT'::text)) OR ((node_type = 'DATA_OUTPUT'::text) AND (bpmn_element_type = 'DATA_OUTPUT'::text)) OR ((node_type = 'DATA_STORE'::text) AND (bpmn_element_type = 'DATA_STORE'::text)))),
    CONSTRAINT ck_business_flow_node_bpmn_subprocess_kind CHECK (((bpmn_subprocess_kind IS NULL) OR (bpmn_subprocess_kind = ANY (ARRAY['EMBEDDED'::text, 'TRANSACTION'::text])))),
    CONSTRAINT ck_business_flow_node_bpmn_task_type CHECK (((bpmn_task_type IS NULL) OR (bpmn_task_type = 'NONE'::text))),
    CONSTRAINT ck_business_flow_node_type CHECK ((node_type = ANY (ARRAY['START'::text, 'END'::text, 'EVENT'::text, 'TASK'::text, 'GATEWAY'::text, 'SUB_PROCESS'::text, 'DATA_OBJECT'::text, 'DATA_INPUT'::text, 'DATA_OUTPUT'::text, 'DATA_STORE'::text])))
);

COMMENT ON TABLE public.business_flow_node IS '业务流程图 BPMN 节点实例表';

COMMENT ON COLUMN public.business_flow_node.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_node.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_node.lane_instance_id IS '关联 business_flow_lane_instance.id 的记录主键';

COMMENT ON COLUMN public.business_flow_node.node_key IS '节点稳定业务键';

COMMENT ON COLUMN public.business_flow_node.origin_component_node_key IS '稳定业务标识';

COMMENT ON COLUMN public.business_flow_node.node_type IS '节点兼容类型标识';

COMMENT ON COLUMN public.business_flow_node.title IS '画布显示名称';

COMMENT ON COLUMN public.business_flow_node.position_x IS '画布坐标';

COMMENT ON COLUMN public.business_flow_node.position_y IS '画布坐标';

COMMENT ON COLUMN public.business_flow_node.width IS '画布尺寸';

COMMENT ON COLUMN public.business_flow_node.height IS '画布尺寸';

COMMENT ON COLUMN public.business_flow_node.is_overridden IS '布尔状态标记';

COMMENT ON COLUMN public.business_flow_node.style_json IS '画布样式 JSON';

COMMENT ON COLUMN public.business_flow_node.properties_json IS '扩展属性 JSON';

COMMENT ON COLUMN public.business_flow_node.created_at IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_node.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.business_flow_node.bpmn_element_type IS 'BPMN 元素类型';

COMMENT ON COLUMN public.business_flow_node.bpmn_event_kind IS 'BPMN 事件阶段';

COMMENT ON COLUMN public.business_flow_node.bpmn_event_definition IS 'BPMN 事件定义';

COMMENT ON COLUMN public.business_flow_node.bpmn_task_type IS 'BPMN 任务类型';

COMMENT ON COLUMN public.business_flow_node.bpmn_gateway_type IS 'BPMN 网关类型';

COMMENT ON COLUMN public.business_flow_node.bpmn_subprocess_kind IS 'BPMN 子流程类型';

COMMENT ON COLUMN public.business_flow_node.task_ui_json IS '任务页面及 UI 操作步骤 JSON';

COMMENT ON COLUMN public.business_flow_node.bpmn_semantic_json IS 'BPMN 类型专属业务语义 JSON';

CREATE TABLE public.business_flow_node_er_ref (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    business_flow_node_id uuid NOT NULL,
    er_diagram_id uuid NOT NULL,
    er_table_key text NOT NULL,
    er_column_key text,
    ref_type text DEFAULT 'READ'::text NOT NULL,
    description text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_business_flow_node_er_ref_type CHECK ((ref_type = ANY (ARRAY['READ'::text, 'CREATE'::text, 'UPDATE'::text, 'DELETE'::text, 'CHECK'::text])))
);

COMMENT ON TABLE public.business_flow_node_er_ref IS '业务流程数据节点 ER 字段绑定表';

COMMENT ON COLUMN public.business_flow_node_er_ref.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_node_er_ref.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_node_er_ref.business_flow_node_id IS '关联 business_flow_node.id 的记录主键';

COMMENT ON COLUMN public.business_flow_node_er_ref.er_diagram_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.business_flow_node_er_ref.er_table_key IS '稳定业务标识';

COMMENT ON COLUMN public.business_flow_node_er_ref.er_column_key IS '稳定业务标识';

COMMENT ON COLUMN public.business_flow_node_er_ref.ref_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.business_flow_node_er_ref.description IS '业务说明';

COMMENT ON COLUMN public.business_flow_node_er_ref.created_by IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_node_er_ref.created_at IS '创建审计信息';

CREATE TABLE public.business_flow_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_flow_id uuid NOT NULL,
    version bigint NOT NULL,
    canvas_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.business_flow_snapshot IS '业务流程版本快照表';

COMMENT ON COLUMN public.business_flow_snapshot.id IS '记录主键';

COMMENT ON COLUMN public.business_flow_snapshot.business_flow_id IS '关联 business_flow.id 的记录主键';

COMMENT ON COLUMN public.business_flow_snapshot.version IS '数据版本号';

COMMENT ON COLUMN public.business_flow_snapshot.canvas_json IS '画布结构 JSON';

COMMENT ON COLUMN public.business_flow_snapshot.semantic_json IS '业务语义快照 JSON';

COMMENT ON COLUMN public.business_flow_snapshot.created_by IS '创建审计信息';

COMMENT ON COLUMN public.business_flow_snapshot.created_at IS '创建审计信息';

CREATE TABLE public.collab_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    ydoc_state bytea DEFAULT '\x'::bytea NOT NULL,
    server_version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_collab_document_owner_type CHECK ((owner_type = ANY (ARRAY['BUSINESS_FLOW'::text, 'SWIMLANE_COMPONENT_DRAFT'::text])))
);

COMMENT ON TABLE public.collab_document IS '通用协作文档表';

COMMENT ON COLUMN public.collab_document.id IS '记录主键';

COMMENT ON COLUMN public.collab_document.owner_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.collab_document.owner_id IS '外部关联记录主键';

COMMENT ON COLUMN public.collab_document.ydoc_state IS '业务字段：ydoc_state';

COMMENT ON COLUMN public.collab_document.server_version IS '版本号';

COMMENT ON COLUMN public.collab_document.created_at IS '创建审计信息';

COMMENT ON COLUMN public.collab_document.updated_at IS '更新审计信息';

CREATE TABLE public.collab_update (
    id bigint NOT NULL,
    document_id uuid NOT NULL,
    client_id text,
    update_seq bigint NOT NULL,
    update_data bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text,
    update_size bigint,
    origin text
);

COMMENT ON TABLE public.collab_update IS '通用协作增量更新表';

COMMENT ON COLUMN public.collab_update.id IS '记录主键';

COMMENT ON COLUMN public.collab_update.document_id IS '关联 collab_document.id 的记录主键';

COMMENT ON COLUMN public.collab_update.client_id IS '外部关联记录主键';

COMMENT ON COLUMN public.collab_update.update_seq IS '业务字段：update_seq';

COMMENT ON COLUMN public.collab_update.update_data IS '业务字段：update_data';

COMMENT ON COLUMN public.collab_update.created_at IS '创建审计信息';

COMMENT ON COLUMN public.collab_update.user_id IS '外部关联记录主键';

COMMENT ON COLUMN public.collab_update.update_size IS '业务字段：update_size';

COMMENT ON COLUMN public.collab_update.origin IS '业务字段：origin';

CREATE SEQUENCE public.collab_update_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.collab_update_id_seq OWNED BY public.collab_update.id;

CREATE TABLE public.er_business_flow (
    graph_id uuid NOT NULL,
    flow_key text NOT NULL,
    name text NOT NULL,
    description text,
    flow_json jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_business_flow IS '旧版 ER 业务流程表';

COMMENT ON COLUMN public.er_business_flow.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_business_flow.flow_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow.name IS '显示名称';

COMMENT ON COLUMN public.er_business_flow.description IS '业务说明';

COMMENT ON COLUMN public.er_business_flow.flow_json IS '结构化扩展数据 JSON';

COMMENT ON COLUMN public.er_business_flow.version IS '数据版本号';

COMMENT ON COLUMN public.er_business_flow.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_business_flow.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_business_flow.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_business_flow_er_binding (
    graph_id uuid NOT NULL,
    flow_key text NOT NULL,
    binding_key text NOT NULL,
    step_key text NOT NULL,
    table_key text,
    column_key text,
    relation_key text,
    usage_type text DEFAULT 'read'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_business_flow_er_binding IS '旧版业务流程 ER 绑定表';

COMMENT ON COLUMN public.er_business_flow_er_binding.graph_id IS '关联 er_business_flow.flow_key 的记录主键';

COMMENT ON COLUMN public.er_business_flow_er_binding.flow_key IS '关联 er_business_flow.flow_key 的记录主键';

COMMENT ON COLUMN public.er_business_flow_er_binding.binding_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow_er_binding.step_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow_er_binding.table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow_er_binding.column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow_er_binding.relation_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_flow_er_binding.usage_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_business_flow_er_binding.description IS '业务说明';

COMMENT ON COLUMN public.er_business_flow_er_binding.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_business_flow_er_binding.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_business_flow_er_binding.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_business_path (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    path_key text NOT NULL,
    name text NOT NULL,
    intent text,
    description text,
    business_domain text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    table_keys text[] DEFAULT '{}'::text[] NOT NULL,
    relation_keys text[] DEFAULT '{}'::text[] NOT NULL,
    path_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(4,3) DEFAULT 1.0 NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_business_path IS 'ER 业务访问路径定义';

COMMENT ON COLUMN public.er_business_path.id IS '记录主键';

COMMENT ON COLUMN public.er_business_path.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_business_path.path_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_business_path.name IS '显示名称';

COMMENT ON COLUMN public.er_business_path.intent IS '业务字段：intent';

COMMENT ON COLUMN public.er_business_path.description IS '业务说明';

COMMENT ON COLUMN public.er_business_path.business_domain IS '业务字段：business_domain';

COMMENT ON COLUMN public.er_business_path.tags IS '业务字段：tags';

COMMENT ON COLUMN public.er_business_path.table_keys IS '业务字段：table_keys';

COMMENT ON COLUMN public.er_business_path.relation_keys IS '业务字段：relation_keys';

COMMENT ON COLUMN public.er_business_path.path_json IS '结构化扩展数据 JSON';

COMMENT ON COLUMN public.er_business_path.confidence IS '业务字段：confidence';

COMMENT ON COLUMN public.er_business_path.version IS '数据版本号';

COMMENT ON COLUMN public.er_business_path.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_business_path.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_business_path.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_business_path.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_business_path.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_change_log (
    id bigint NOT NULL,
    graph_id uuid NOT NULL,
    change_type text NOT NULL,
    entity_type text NOT NULL,
    entity_key text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    client_id text,
    user_id text,
    graph_version bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.er_change_log IS 'ER 图变更日志表';

COMMENT ON COLUMN public.er_change_log.id IS '记录主键';

COMMENT ON COLUMN public.er_change_log.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_change_log.change_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_change_log.entity_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_change_log.entity_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_change_log.before_data IS '业务字段：before_data';

COMMENT ON COLUMN public.er_change_log.after_data IS '业务字段：after_data';

COMMENT ON COLUMN public.er_change_log.client_id IS '外部关联记录主键';

COMMENT ON COLUMN public.er_change_log.user_id IS '外部关联记录主键';

COMMENT ON COLUMN public.er_change_log.graph_version IS '版本号';

COMMENT ON COLUMN public.er_change_log.created_at IS '创建审计信息';

CREATE SEQUENCE public.er_change_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.er_change_log_id_seq OWNED BY public.er_change_log.id;

CREATE TABLE public.er_column (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    table_key text NOT NULL,
    column_key text NOT NULL,
    column_name text NOT NULL,
    data_type text,
    business_name text,
    description text,
    comment text,
    default_value text,
    nullable boolean,
    is_primary_key boolean DEFAULT false NOT NULL,
    is_unique boolean DEFAULT false NOT NULL,
    is_indexed boolean DEFAULT false NOT NULL,
    key_type text,
    column_role text,
    enum_enabled boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    raw_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_column IS 'ER 字段定义';

COMMENT ON COLUMN public.er_column.id IS '记录主键';

COMMENT ON COLUMN public.er_column.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_column.table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_column.column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_column.column_name IS '业务字段：column_name';

COMMENT ON COLUMN public.er_column.data_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_column.business_name IS '业务字段：business_name';

COMMENT ON COLUMN public.er_column.description IS '业务说明';

COMMENT ON COLUMN public.er_column.comment IS '业务字段：comment';

COMMENT ON COLUMN public.er_column.default_value IS '业务字段：default_value';

COMMENT ON COLUMN public.er_column.nullable IS '业务字段：nullable';

COMMENT ON COLUMN public.er_column.is_primary_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_column.is_unique IS '布尔状态标记';

COMMENT ON COLUMN public.er_column.is_indexed IS '布尔状态标记';

COMMENT ON COLUMN public.er_column.key_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_column.column_role IS '业务字段：column_role';

COMMENT ON COLUMN public.er_column.enum_enabled IS '业务字段：enum_enabled';

COMMENT ON COLUMN public.er_column.sort_order IS '业务字段：sort_order';

COMMENT ON COLUMN public.er_column.tags IS '业务字段：tags';

COMMENT ON COLUMN public.er_column.raw_data IS '业务字段：raw_data';

COMMENT ON COLUMN public.er_column.version IS '数据版本号';

COMMENT ON COLUMN public.er_column.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_column.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_column.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_column.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_column.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_column_enum_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    table_key text NOT NULL,
    column_key text NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    raw_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_column_enum_value IS 'ER 字段枚举值定义';

COMMENT ON COLUMN public.er_column_enum_value.id IS '记录主键';

COMMENT ON COLUMN public.er_column_enum_value.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_column_enum_value.table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_column_enum_value.column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_column_enum_value.value IS '业务字段：value';

COMMENT ON COLUMN public.er_column_enum_value.label IS '连线显示名称';

COMMENT ON COLUMN public.er_column_enum_value.description IS '业务说明';

COMMENT ON COLUMN public.er_column_enum_value.sort_order IS '业务字段：sort_order';

COMMENT ON COLUMN public.er_column_enum_value.enabled IS '业务字段：enabled';

COMMENT ON COLUMN public.er_column_enum_value.raw_data IS '业务字段：raw_data';

COMMENT ON COLUMN public.er_column_enum_value.version IS '数据版本号';

COMMENT ON COLUMN public.er_column_enum_value.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_column_enum_value.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_column_enum_value.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_column_enum_value.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_column_enum_value.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_database_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_key text NOT NULL,
    name text NOT NULL,
    db_type text NOT NULL,
    host text NOT NULL,
    port integer NOT NULL,
    database_name text NOT NULL,
    schema_name text,
    username text NOT NULL,
    password_ciphertext text,
    password_ref text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT er_database_connection_db_type_check CHECK ((db_type = ANY (ARRAY['mysql'::text, 'oracle'::text, 'sqlserver'::text]))),
    CONSTRAINT er_database_connection_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

COMMENT ON TABLE public.er_database_connection IS '外部数据库连接配置表';

COMMENT ON COLUMN public.er_database_connection.id IS '记录主键';

COMMENT ON COLUMN public.er_database_connection.connection_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_database_connection.name IS '显示名称';

COMMENT ON COLUMN public.er_database_connection.db_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_database_connection.host IS '业务字段：host';

COMMENT ON COLUMN public.er_database_connection.port IS '业务字段：port';

COMMENT ON COLUMN public.er_database_connection.database_name IS '业务字段：database_name';

COMMENT ON COLUMN public.er_database_connection.schema_name IS '业务字段：schema_name';

COMMENT ON COLUMN public.er_database_connection.username IS '业务字段：username';

COMMENT ON COLUMN public.er_database_connection.password_ciphertext IS '业务字段：password_ciphertext';

COMMENT ON COLUMN public.er_database_connection.password_ref IS '业务字段：password_ref';

COMMENT ON COLUMN public.er_database_connection.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_database_connection.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_database_connection.updated_at IS '更新审计信息';

CREATE TABLE public.er_graph (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    business_domain text,
    status text DEFAULT 'active'::text NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_connection_id uuid,
    collab_revision bigint DEFAULT 1 NOT NULL,
    product_id uuid
);

COMMENT ON TABLE public.er_graph IS 'ER 图主表';

COMMENT ON COLUMN public.er_graph.id IS '记录主键';

COMMENT ON COLUMN public.er_graph.name IS '显示名称';

COMMENT ON COLUMN public.er_graph.description IS '业务说明';

COMMENT ON COLUMN public.er_graph.business_domain IS '业务字段：business_domain';

COMMENT ON COLUMN public.er_graph.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_graph.version IS '数据版本号';

COMMENT ON COLUMN public.er_graph.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_graph.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_graph.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_graph.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_graph.source_connection_id IS '关联 er_database_connection.id 的记录主键';

COMMENT ON COLUMN public.er_graph.collab_revision IS '业务字段：collab_revision';

COMMENT ON COLUMN public.er_graph.product_id IS '关联 product.id 的记录主键';

CREATE TABLE public.er_graph_member (
    graph_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT er_graph_member_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))
);

COMMENT ON TABLE public.er_graph_member IS 'ER 图成员及权限表';

COMMENT ON COLUMN public.er_graph_member.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_graph_member.user_id IS '关联 app_user.id 的记录主键';

COMMENT ON COLUMN public.er_graph_member.role IS '业务字段：role';

COMMENT ON COLUMN public.er_graph_member.created_at IS '创建审计信息';

CREATE TABLE public.er_graph_snapshot (
    graph_id uuid NOT NULL,
    x6_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    business_json jsonb,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.er_graph_snapshot IS 'ER 图版本快照表';

COMMENT ON COLUMN public.er_graph_snapshot.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_graph_snapshot.x6_json IS '结构化扩展数据 JSON';

COMMENT ON COLUMN public.er_graph_snapshot.business_json IS '结构化扩展数据 JSON';

COMMENT ON COLUMN public.er_graph_snapshot.version IS '数据版本号';

COMMENT ON COLUMN public.er_graph_snapshot.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_graph_snapshot.updated_at IS '更新审计信息';

CREATE TABLE public.er_relation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    relation_key text NOT NULL,
    source_table_key text NOT NULL,
    source_column_key text NOT NULL,
    target_table_key text NOT NULL,
    target_column_key text NOT NULL,
    relation_type text DEFAULT 'logical_relation'::text NOT NULL,
    relationship text,
    cardinality text,
    relation_name text,
    description text,
    join_condition text,
    direction text DEFAULT 'source_to_target'::text NOT NULL,
    confidence numeric(4,3) DEFAULT 1.0 NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    raw_edge jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    match_operator text DEFAULT 'eq'::text NOT NULL
);

COMMENT ON TABLE public.er_relation IS 'ER 实体关系定义';

COMMENT ON COLUMN public.er_relation.id IS '记录主键';

COMMENT ON COLUMN public.er_relation.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_relation.relation_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_relation.source_table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_relation.source_column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_relation.target_table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_relation.target_column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_relation.relation_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_relation.relationship IS '业务字段：relationship';

COMMENT ON COLUMN public.er_relation.cardinality IS '业务字段：cardinality';

COMMENT ON COLUMN public.er_relation.relation_name IS '业务字段：relation_name';

COMMENT ON COLUMN public.er_relation.description IS '业务说明';

COMMENT ON COLUMN public.er_relation.join_condition IS '业务字段：join_condition';

COMMENT ON COLUMN public.er_relation.direction IS '业务字段：direction';

COMMENT ON COLUMN public.er_relation.confidence IS '业务字段：confidence';

COMMENT ON COLUMN public.er_relation.source IS '业务字段：source';

COMMENT ON COLUMN public.er_relation.verified IS '业务字段：verified';

COMMENT ON COLUMN public.er_relation.tags IS '业务字段：tags';

COMMENT ON COLUMN public.er_relation.raw_edge IS '业务字段：raw_edge';

COMMENT ON COLUMN public.er_relation.version IS '数据版本号';

COMMENT ON COLUMN public.er_relation.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_relation.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_relation.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_relation.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_relation.deleted_at IS '软删除审计信息';

COMMENT ON COLUMN public.er_relation.match_operator IS '业务字段：match_operator';

CREATE TABLE public.er_search_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    doc_key text NOT NULL,
    doc_type text NOT NULL,
    ref_table_key text,
    ref_column_key text,
    ref_relation_key text,
    title text,
    content text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.er_search_document IS 'ER Agent 检索文档表';

COMMENT ON COLUMN public.er_search_document.id IS '记录主键';

COMMENT ON COLUMN public.er_search_document.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_search_document.doc_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_search_document.doc_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_search_document.ref_table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_search_document.ref_column_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_search_document.ref_relation_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_search_document.title IS '画布显示名称';

COMMENT ON COLUMN public.er_search_document.content IS '业务字段：content';

COMMENT ON COLUMN public.er_search_document.tags IS '业务字段：tags';

COMMENT ON COLUMN public.er_search_document.version IS '数据版本号';

COMMENT ON COLUMN public.er_search_document.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_search_document.updated_at IS '更新审计信息';

CREATE TABLE public.er_table (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    table_key text NOT NULL,
    table_name text NOT NULL,
    business_name text,
    description text,
    business_domain text,
    table_type text DEFAULT 'business'::text NOT NULL,
    importance integer DEFAULT 3 NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    comment text,
    x numeric,
    y numeric,
    width numeric,
    height numeric,
    raw_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

COMMENT ON TABLE public.er_table IS 'ER 实体表定义';

COMMENT ON COLUMN public.er_table.id IS '记录主键';

COMMENT ON COLUMN public.er_table.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_table.table_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_table.table_name IS '业务字段：table_name';

COMMENT ON COLUMN public.er_table.business_name IS '业务字段：business_name';

COMMENT ON COLUMN public.er_table.description IS '业务说明';

COMMENT ON COLUMN public.er_table.business_domain IS '业务字段：business_domain';

COMMENT ON COLUMN public.er_table.table_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_table.importance IS '业务字段：importance';

COMMENT ON COLUMN public.er_table.tags IS '业务字段：tags';

COMMENT ON COLUMN public.er_table.comment IS '业务字段：comment';

COMMENT ON COLUMN public.er_table.x IS '业务字段：x';

COMMENT ON COLUMN public.er_table.y IS '业务字段：y';

COMMENT ON COLUMN public.er_table.width IS '画布尺寸';

COMMENT ON COLUMN public.er_table.height IS '画布尺寸';

COMMENT ON COLUMN public.er_table.raw_data IS '业务字段：raw_data';

COMMENT ON COLUMN public.er_table.version IS '数据版本号';

COMMENT ON COLUMN public.er_table.created_by IS '创建审计信息';

COMMENT ON COLUMN public.er_table.updated_by IS '更新审计信息';

COMMENT ON COLUMN public.er_table.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_table.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.er_table.deleted_at IS '软删除审计信息';

CREATE TABLE public.er_validation_issue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    graph_id uuid NOT NULL,
    issue_type text NOT NULL,
    severity text NOT NULL,
    ref_type text NOT NULL,
    ref_key text NOT NULL,
    message text NOT NULL,
    suggestion text,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.er_validation_issue IS 'ER 模型校验问题表';

COMMENT ON COLUMN public.er_validation_issue.id IS '记录主键';

COMMENT ON COLUMN public.er_validation_issue.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_validation_issue.issue_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_validation_issue.severity IS '业务字段：severity';

COMMENT ON COLUMN public.er_validation_issue.ref_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.er_validation_issue.ref_key IS '稳定业务标识';

COMMENT ON COLUMN public.er_validation_issue.message IS '业务字段：message';

COMMENT ON COLUMN public.er_validation_issue.suggestion IS '业务字段：suggestion';

COMMENT ON COLUMN public.er_validation_issue.resolved IS '业务字段：resolved';

COMMENT ON COLUMN public.er_validation_issue.created_at IS '创建审计信息';

CREATE TABLE public.er_yjs_doc (
    graph_id uuid NOT NULL,
    state bytea NOT NULL,
    state_vector bytea,
    version bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.er_yjs_doc IS 'ER 图协作文档表';

COMMENT ON COLUMN public.er_yjs_doc.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_yjs_doc.state IS '业务字段：state';

COMMENT ON COLUMN public.er_yjs_doc.state_vector IS '业务字段：state_vector';

COMMENT ON COLUMN public.er_yjs_doc.version IS '数据版本号';

COMMENT ON COLUMN public.er_yjs_doc.updated_at IS '更新审计信息';

CREATE TABLE public.er_yjs_update (
    id bigint NOT NULL,
    graph_id uuid NOT NULL,
    client_id text,
    update_bin bytea NOT NULL,
    seq bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    update_size integer DEFAULT 0 NOT NULL,
    origin text
);

COMMENT ON TABLE public.er_yjs_update IS 'ER 图协作增量更新表';

COMMENT ON COLUMN public.er_yjs_update.id IS '记录主键';

COMMENT ON COLUMN public.er_yjs_update.graph_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.er_yjs_update.client_id IS '外部关联记录主键';

COMMENT ON COLUMN public.er_yjs_update.update_bin IS '业务字段：update_bin';

COMMENT ON COLUMN public.er_yjs_update.seq IS '业务字段：seq';

COMMENT ON COLUMN public.er_yjs_update.created_at IS '创建审计信息';

COMMENT ON COLUMN public.er_yjs_update.user_id IS '关联 app_user.id 的记录主键';

COMMENT ON COLUMN public.er_yjs_update.update_size IS '业务字段：update_size';

COMMENT ON COLUMN public.er_yjs_update.origin IS '业务字段：origin';

CREATE SEQUENCE public.er_yjs_update_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.er_yjs_update_id_seq OWNED BY public.er_yjs_update.id;

CREATE TABLE public.product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.product IS '产品主数据表';

COMMENT ON COLUMN public.product.id IS '记录主键';

COMMENT ON COLUMN public.product.code IS '业务编码';

COMMENT ON COLUMN public.product.name IS '显示名称';

COMMENT ON COLUMN public.product.description IS '业务说明';

COMMENT ON COLUMN public.product.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.product.created_by IS '创建审计信息';

COMMENT ON COLUMN public.product.created_at IS '创建审计信息';

COMMENT ON COLUMN public.product.updated_at IS '更新审计信息';

CREATE TABLE public.product_member (
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_product_member_role CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))
);

COMMENT ON TABLE public.product_member IS '产品成员及权限表';

COMMENT ON COLUMN public.product_member.product_id IS '关联 product.id 的记录主键';

COMMENT ON COLUMN public.product_member.user_id IS '关联 app_user.id 的记录主键';

COMMENT ON COLUMN public.product_member.role IS '业务字段：role';

COMMENT ON COLUMN public.product_member.created_at IS '创建审计信息';

COMMENT ON COLUMN public.product_member.updated_at IS '更新审计信息';

CREATE TABLE public.swimlane_component (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text,
    owner_role text,
    description text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    current_version_no integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ck_swimlane_component_status CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])))
);

COMMENT ON TABLE public.swimlane_component IS '泳道组件主表';

COMMENT ON COLUMN public.swimlane_component.id IS '记录主键';

COMMENT ON COLUMN public.swimlane_component.product_id IS '关联 product.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component.code IS '业务编码';

COMMENT ON COLUMN public.swimlane_component.name IS '显示名称';

COMMENT ON COLUMN public.swimlane_component.category IS '业务字段：category';

COMMENT ON COLUMN public.swimlane_component.owner_role IS '业务字段：owner_role';

COMMENT ON COLUMN public.swimlane_component.description IS '业务说明';

COMMENT ON COLUMN public.swimlane_component.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.swimlane_component.current_version_no IS '版本序号';

COMMENT ON COLUMN public.swimlane_component.created_by IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component.created_at IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component.updated_at IS '更新审计信息';

COMMENT ON COLUMN public.swimlane_component.deleted_at IS '软删除审计信息';

CREATE TABLE public.swimlane_component_edge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_version_id uuid NOT NULL,
    edge_key text NOT NULL,
    source_node_key text NOT NULL,
    target_node_key text NOT NULL,
    source_port text,
    target_port text,
    edge_type text DEFAULT 'SEQUENCE'::text NOT NULL,
    label text,
    style_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    properties_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bpmn_flow_type text,
    bpmn_sequence_flow_kind text,
    bpmn_semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ck_swimlane_component_edge_bpmn_flow_type CHECK (((bpmn_flow_type IS NULL) OR (bpmn_flow_type = ANY (ARRAY['SEQUENCE'::text, 'MESSAGE'::text, 'ASSOCIATION'::text])))),
    CONSTRAINT ck_swimlane_component_edge_bpmn_sequence_flow_kind CHECK (((bpmn_sequence_flow_kind IS NULL) OR (bpmn_sequence_flow_kind = ANY (ARRAY['NORMAL'::text, 'CONDITIONAL'::text, 'DEFAULT'::text, 'EXCEPTION'::text])))),
    CONSTRAINT ck_swimlane_component_edge_type CHECK ((edge_type = ANY (ARRAY['SEQUENCE'::text, 'MESSAGE'::text, 'ASSOCIATION'::text, 'TRIGGER'::text, 'DATA_FLOW'::text, 'CALL'::text, 'DEPENDENCY'::text, 'EXCEPTION'::text])))
);

COMMENT ON TABLE public.swimlane_component_edge IS '泳道组件 BPMN 连线表';

COMMENT ON COLUMN public.swimlane_component_edge.id IS '记录主键';

COMMENT ON COLUMN public.swimlane_component_edge.component_version_id IS '关联 swimlane_component_version.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_edge.edge_key IS '连线稳定业务键';

COMMENT ON COLUMN public.swimlane_component_edge.source_node_key IS '稳定业务标识';

COMMENT ON COLUMN public.swimlane_component_edge.target_node_key IS '稳定业务标识';

COMMENT ON COLUMN public.swimlane_component_edge.source_port IS '业务字段：source_port';

COMMENT ON COLUMN public.swimlane_component_edge.target_port IS '业务字段：target_port';

COMMENT ON COLUMN public.swimlane_component_edge.edge_type IS '连线兼容类型标识';

COMMENT ON COLUMN public.swimlane_component_edge.label IS '连线显示名称';

COMMENT ON COLUMN public.swimlane_component_edge.style_json IS '画布样式 JSON';

COMMENT ON COLUMN public.swimlane_component_edge.properties_json IS '扩展属性 JSON';

COMMENT ON COLUMN public.swimlane_component_edge.created_at IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component_edge.bpmn_flow_type IS 'BPMN 连线类型';

COMMENT ON COLUMN public.swimlane_component_edge.bpmn_sequence_flow_kind IS 'BPMN 顺序流类型';

COMMENT ON COLUMN public.swimlane_component_edge.bpmn_semantic_json IS 'BPMN 类型专属业务语义 JSON';

CREATE TABLE public.swimlane_component_node (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_version_id uuid NOT NULL,
    node_key text NOT NULL,
    node_type text NOT NULL,
    title text NOT NULL,
    position_x numeric DEFAULT 0 NOT NULL,
    position_y numeric DEFAULT 0 NOT NULL,
    width numeric DEFAULT 120 NOT NULL,
    height numeric DEFAULT 60 NOT NULL,
    style_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    properties_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bpmn_element_type text,
    bpmn_event_kind text,
    bpmn_event_definition text,
    bpmn_task_type text,
    bpmn_gateway_type text,
    bpmn_subprocess_kind text,
    task_ui_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    bpmn_semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ck_swimlane_component_node_bpmn_element_type CHECK ((bpmn_element_type = ANY (ARRAY['EVENT'::text, 'TASK'::text, 'GATEWAY'::text, 'SUB_PROCESS'::text, 'DATA_OBJECT'::text, 'DATA_INPUT'::text, 'DATA_OUTPUT'::text, 'DATA_STORE'::text]))),
    CONSTRAINT ck_swimlane_component_node_bpmn_event_definition CHECK (((bpmn_event_definition IS NULL) OR (bpmn_event_definition = ANY (ARRAY['NONE'::text, 'MESSAGE'::text, 'TIMER'::text, 'ERROR'::text, 'ESCALATION'::text, 'CONDITIONAL'::text, 'SIGNAL'::text, 'LINK'::text, 'MULTIPLE'::text, 'TERMINATE'::text, 'CANCEL'::text, 'COMPENSATION'::text])))),
    CONSTRAINT ck_swimlane_component_node_bpmn_event_kind CHECK (((bpmn_event_kind IS NULL) OR (bpmn_event_kind = ANY (ARRAY['START'::text, 'INTERMEDIATE'::text, 'END'::text])))),
    CONSTRAINT ck_swimlane_component_node_bpmn_gateway_type CHECK (((bpmn_gateway_type IS NULL) OR (bpmn_gateway_type = ANY (ARRAY['EXCLUSIVE'::text, 'INCLUSIVE'::text, 'PARALLEL'::text, 'COMPLEX'::text])))),
    CONSTRAINT ck_swimlane_component_node_bpmn_profile CHECK ((((node_type = 'START'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'START'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'END'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'END'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'EVENT'::text) AND (bpmn_element_type = 'EVENT'::text) AND (bpmn_event_kind = 'INTERMEDIATE'::text) AND (bpmn_event_definition = 'NONE'::text)) OR ((node_type = 'TASK'::text) AND (bpmn_element_type = 'TASK'::text) AND (COALESCE(bpmn_task_type, 'NONE'::text) = 'NONE'::text)) OR ((node_type = 'GATEWAY'::text) AND (bpmn_element_type = 'GATEWAY'::text) AND (bpmn_gateway_type = ANY (ARRAY['EXCLUSIVE'::text, 'INCLUSIVE'::text, 'PARALLEL'::text, 'COMPLEX'::text]))) OR ((node_type = 'SUB_PROCESS'::text) AND (bpmn_element_type = 'SUB_PROCESS'::text) AND (bpmn_subprocess_kind = ANY (ARRAY['EMBEDDED'::text, 'TRANSACTION'::text]))) OR ((node_type = 'DATA_OBJECT'::text) AND (bpmn_element_type = 'DATA_OBJECT'::text)) OR ((node_type = 'DATA_INPUT'::text) AND (bpmn_element_type = 'DATA_INPUT'::text)) OR ((node_type = 'DATA_OUTPUT'::text) AND (bpmn_element_type = 'DATA_OUTPUT'::text)) OR ((node_type = 'DATA_STORE'::text) AND (bpmn_element_type = 'DATA_STORE'::text)))),
    CONSTRAINT ck_swimlane_component_node_bpmn_subprocess_kind CHECK (((bpmn_subprocess_kind IS NULL) OR (bpmn_subprocess_kind = ANY (ARRAY['EMBEDDED'::text, 'TRANSACTION'::text])))),
    CONSTRAINT ck_swimlane_component_node_bpmn_task_type CHECK (((bpmn_task_type IS NULL) OR (bpmn_task_type = 'NONE'::text))),
    CONSTRAINT ck_swimlane_component_node_type CHECK ((node_type = ANY (ARRAY['START'::text, 'END'::text, 'EVENT'::text, 'TASK'::text, 'GATEWAY'::text, 'SUB_PROCESS'::text, 'DATA_OBJECT'::text, 'DATA_INPUT'::text, 'DATA_OUTPUT'::text, 'DATA_STORE'::text])))
);

COMMENT ON TABLE public.swimlane_component_node IS '泳道组件 BPMN 节点表';

COMMENT ON COLUMN public.swimlane_component_node.id IS '记录主键';

COMMENT ON COLUMN public.swimlane_component_node.component_version_id IS '关联 swimlane_component_version.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_node.node_key IS '节点稳定业务键';

COMMENT ON COLUMN public.swimlane_component_node.node_type IS '节点兼容类型标识';

COMMENT ON COLUMN public.swimlane_component_node.title IS '画布显示名称';

COMMENT ON COLUMN public.swimlane_component_node.position_x IS '画布坐标';

COMMENT ON COLUMN public.swimlane_component_node.position_y IS '画布坐标';

COMMENT ON COLUMN public.swimlane_component_node.width IS '画布尺寸';

COMMENT ON COLUMN public.swimlane_component_node.height IS '画布尺寸';

COMMENT ON COLUMN public.swimlane_component_node.style_json IS '画布样式 JSON';

COMMENT ON COLUMN public.swimlane_component_node.properties_json IS '扩展属性 JSON';

COMMENT ON COLUMN public.swimlane_component_node.created_at IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_element_type IS 'BPMN 元素类型';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_event_kind IS 'BPMN 事件阶段';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_event_definition IS 'BPMN 事件定义';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_task_type IS 'BPMN 任务类型';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_gateway_type IS 'BPMN 网关类型';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_subprocess_kind IS 'BPMN 子流程类型';

COMMENT ON COLUMN public.swimlane_component_node.task_ui_json IS '任务页面及 UI 操作步骤 JSON';

COMMENT ON COLUMN public.swimlane_component_node.bpmn_semantic_json IS 'BPMN 类型专属业务语义 JSON';

CREATE TABLE public.swimlane_component_node_er_ref (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_version_id uuid NOT NULL,
    swimlane_component_node_id uuid CONSTRAINT swimlane_component_node_er__swimlane_component_node_id_not_null NOT NULL,
    er_diagram_id uuid NOT NULL,
    er_table_key text NOT NULL,
    er_column_key text,
    ref_type text DEFAULT 'READ'::text NOT NULL,
    description text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_swimlane_component_node_er_ref_type CHECK ((ref_type = ANY (ARRAY['READ'::text, 'CREATE'::text, 'UPDATE'::text, 'DELETE'::text, 'CHECK'::text])))
);

COMMENT ON TABLE public.swimlane_component_node_er_ref IS '泳道组件数据节点 ER 字段绑定表';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.id IS '记录主键';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.component_version_id IS '关联 swimlane_component_version.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.swimlane_component_node_id IS '关联 swimlane_component_node.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.er_diagram_id IS '关联 er_graph.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.er_table_key IS '稳定业务标识';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.er_column_key IS '稳定业务标识';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.ref_type IS '类型判别值，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.description IS '业务说明';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.created_by IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component_node_er_ref.created_at IS '创建审计信息';

CREATE TABLE public.swimlane_component_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    version_no integer NOT NULL,
    version_name text,
    canvas_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    semantic_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    thumbnail_url text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    checksum text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT ck_swimlane_component_version_status CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text])))
);

COMMENT ON TABLE public.swimlane_component_version IS '泳道组件版本表';

COMMENT ON COLUMN public.swimlane_component_version.id IS '记录主键';

COMMENT ON COLUMN public.swimlane_component_version.component_id IS '关联 swimlane_component.id 的记录主键';

COMMENT ON COLUMN public.swimlane_component_version.version_no IS '业务字段：version_no';

COMMENT ON COLUMN public.swimlane_component_version.version_name IS '业务字段：version_name';

COMMENT ON COLUMN public.swimlane_component_version.canvas_json IS '画布结构 JSON';

COMMENT ON COLUMN public.swimlane_component_version.semantic_json IS '业务语义快照 JSON';

COMMENT ON COLUMN public.swimlane_component_version.thumbnail_url IS '业务字段：thumbnail_url';

COMMENT ON COLUMN public.swimlane_component_version.status IS '当前生命周期状态，取值由表约束和领域枚举限定';

COMMENT ON COLUMN public.swimlane_component_version.checksum IS '业务字段：checksum';

COMMENT ON COLUMN public.swimlane_component_version.created_by IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component_version.created_at IS '创建审计信息';

COMMENT ON COLUMN public.swimlane_component_version.published_at IS '发布审计信息';

ALTER TABLE ONLY public.collab_update ALTER COLUMN id SET DEFAULT nextval('public.collab_update_id_seq'::regclass);

ALTER TABLE ONLY public.er_change_log ALTER COLUMN id SET DEFAULT nextval('public.er_change_log_id_seq'::regclass);

ALTER TABLE ONLY public.er_yjs_update ALTER COLUMN id SET DEFAULT nextval('public.er_yjs_update_id_seq'::regclass);

ALTER TABLE ONLY public.app_migration_state
    ADD CONSTRAINT app_migration_state_pkey PRIMARY KEY (migration_key);

ALTER TABLE ONLY public.app_session
    ADD CONSTRAINT app_session_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_change_batch
    ADD CONSTRAINT business_flow_change_batch_business_flow_id_new_version_key UNIQUE (business_flow_id, new_version);

ALTER TABLE ONLY public.business_flow_change_batch
    ADD CONSTRAINT business_flow_change_batch_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_change_op
    ADD CONSTRAINT business_flow_change_op_batch_id_op_seq_key UNIQUE (batch_id, op_seq);

ALTER TABLE ONLY public.business_flow_change_op
    ADD CONSTRAINT business_flow_change_op_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_business_flow_id_edge_key_key UNIQUE (business_flow_id, edge_key);

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_lane_instance
    ADD CONSTRAINT business_flow_lane_instance_business_flow_id_instance_key_key UNIQUE (business_flow_id, instance_key);

ALTER TABLE ONLY public.business_flow_lane_instance
    ADD CONSTRAINT business_flow_lane_instance_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_member
    ADD CONSTRAINT business_flow_member_pkey PRIMARY KEY (business_flow_id, user_id);

ALTER TABLE ONLY public.business_flow_node
    ADD CONSTRAINT business_flow_node_business_flow_id_node_key_key UNIQUE (business_flow_id, node_key);

ALTER TABLE ONLY public.business_flow_node_er_ref
    ADD CONSTRAINT business_flow_node_er_ref_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow_node
    ADD CONSTRAINT business_flow_node_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow
    ADD CONSTRAINT business_flow_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_flow
    ADD CONSTRAINT business_flow_product_id_code_key UNIQUE (product_id, code);

ALTER TABLE ONLY public.business_flow_snapshot
    ADD CONSTRAINT business_flow_snapshot_business_flow_id_version_key UNIQUE (business_flow_id, version);

ALTER TABLE ONLY public.business_flow_snapshot
    ADD CONSTRAINT business_flow_snapshot_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collab_document
    ADD CONSTRAINT collab_document_owner_type_owner_id_key UNIQUE (owner_type, owner_id);

ALTER TABLE ONLY public.collab_document
    ADD CONSTRAINT collab_document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collab_update
    ADD CONSTRAINT collab_update_document_id_update_seq_key UNIQUE (document_id, update_seq);

ALTER TABLE ONLY public.collab_update
    ADD CONSTRAINT collab_update_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_business_flow_er_binding
    ADD CONSTRAINT er_business_flow_er_binding_pkey PRIMARY KEY (graph_id, flow_key, binding_key);

ALTER TABLE ONLY public.er_business_flow
    ADD CONSTRAINT er_business_flow_pkey PRIMARY KEY (graph_id, flow_key);

ALTER TABLE ONLY public.er_business_path
    ADD CONSTRAINT er_business_path_graph_id_path_key_key UNIQUE (graph_id, path_key);

ALTER TABLE ONLY public.er_business_path
    ADD CONSTRAINT er_business_path_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_change_log
    ADD CONSTRAINT er_change_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_column_enum_value
    ADD CONSTRAINT er_column_enum_value_graph_id_table_key_column_key_value_key UNIQUE (graph_id, table_key, column_key, value);

ALTER TABLE ONLY public.er_column_enum_value
    ADD CONSTRAINT er_column_enum_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_column
    ADD CONSTRAINT er_column_graph_id_table_key_column_key_key UNIQUE (graph_id, table_key, column_key);

ALTER TABLE ONLY public.er_column
    ADD CONSTRAINT er_column_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_database_connection
    ADD CONSTRAINT er_database_connection_connection_key_key UNIQUE (connection_key);

ALTER TABLE ONLY public.er_database_connection
    ADD CONSTRAINT er_database_connection_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_graph_member
    ADD CONSTRAINT er_graph_member_pkey PRIMARY KEY (graph_id, user_id);

ALTER TABLE ONLY public.er_graph
    ADD CONSTRAINT er_graph_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_graph_snapshot
    ADD CONSTRAINT er_graph_snapshot_pkey PRIMARY KEY (graph_id);

ALTER TABLE ONLY public.er_relation
    ADD CONSTRAINT er_relation_graph_id_relation_key_key UNIQUE (graph_id, relation_key);

ALTER TABLE ONLY public.er_relation
    ADD CONSTRAINT er_relation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_search_document
    ADD CONSTRAINT er_search_document_graph_id_doc_key_key UNIQUE (graph_id, doc_key);

ALTER TABLE ONLY public.er_search_document
    ADD CONSTRAINT er_search_document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_table
    ADD CONSTRAINT er_table_graph_id_table_key_key UNIQUE (graph_id, table_key);

ALTER TABLE ONLY public.er_table
    ADD CONSTRAINT er_table_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_validation_issue
    ADD CONSTRAINT er_validation_issue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.er_yjs_doc
    ADD CONSTRAINT er_yjs_doc_pkey PRIMARY KEY (graph_id);

ALTER TABLE ONLY public.er_yjs_update
    ADD CONSTRAINT er_yjs_update_graph_id_seq_key UNIQUE (graph_id, seq);

ALTER TABLE ONLY public.er_yjs_update
    ADD CONSTRAINT er_yjs_update_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_code_key UNIQUE (code);

ALTER TABLE ONLY public.product_member
    ADD CONSTRAINT product_member_pkey PRIMARY KEY (product_id, user_id);

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.swimlane_component_edge
    ADD CONSTRAINT swimlane_component_edge_component_version_id_edge_key_key UNIQUE (component_version_id, edge_key);

ALTER TABLE ONLY public.swimlane_component_edge
    ADD CONSTRAINT swimlane_component_edge_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.swimlane_component_node
    ADD CONSTRAINT swimlane_component_node_component_version_id_node_key_key UNIQUE (component_version_id, node_key);

ALTER TABLE ONLY public.swimlane_component_node_er_ref
    ADD CONSTRAINT swimlane_component_node_er_ref_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.swimlane_component_node
    ADD CONSTRAINT swimlane_component_node_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.swimlane_component
    ADD CONSTRAINT swimlane_component_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.swimlane_component
    ADD CONSTRAINT swimlane_component_product_id_code_key UNIQUE (product_id, code);

ALTER TABLE ONLY public.swimlane_component_version
    ADD CONSTRAINT swimlane_component_version_component_id_version_no_key UNIQUE (component_id, version_no);

ALTER TABLE ONLY public.swimlane_component_version
    ADD CONSTRAINT swimlane_component_version_pkey PRIMARY KEY (id);

CREATE INDEX idx_business_flow_change_batch_flow ON public.business_flow_change_batch USING btree (business_flow_id, created_at DESC);

CREATE INDEX idx_business_flow_change_op_batch ON public.business_flow_change_op USING btree (batch_id, op_seq);

CREATE INDEX idx_business_flow_edge_flow ON public.business_flow_edge USING btree (business_flow_id);

CREATE INDEX idx_business_flow_edge_lane ON public.business_flow_edge USING btree (lane_instance_id);

CREATE INDEX idx_business_flow_lane_instance_component_version ON public.business_flow_lane_instance USING btree (component_version_id);

CREATE INDEX idx_business_flow_lane_instance_flow ON public.business_flow_lane_instance USING btree (business_flow_id, status);

CREATE INDEX idx_business_flow_member_user ON public.business_flow_member USING btree (user_id);

CREATE INDEX idx_business_flow_node_er_ref_er ON public.business_flow_node_er_ref USING btree (er_diagram_id, er_table_key, er_column_key);

CREATE INDEX idx_business_flow_node_er_ref_flow ON public.business_flow_node_er_ref USING btree (business_flow_id);

CREATE INDEX idx_business_flow_node_er_ref_node ON public.business_flow_node_er_ref USING btree (business_flow_node_id);

CREATE INDEX idx_business_flow_node_flow ON public.business_flow_node USING btree (business_flow_id);

CREATE INDEX idx_business_flow_node_lane ON public.business_flow_node USING btree (lane_instance_id);

CREATE INDEX idx_business_flow_product ON public.business_flow USING btree (product_id, status) WHERE (deleted_at IS NULL);

CREATE INDEX idx_business_flow_snapshot_flow ON public.business_flow_snapshot USING btree (business_flow_id, version DESC);

CREATE INDEX idx_collab_document_owner ON public.collab_document USING btree (owner_type, owner_id);

CREATE INDEX idx_collab_update_document ON public.collab_update USING btree (document_id, update_seq);

CREATE INDEX idx_er_business_flow_binding_graph ON public.er_business_flow_er_binding USING btree (graph_id, flow_key) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_business_flow_graph ON public.er_business_flow USING btree (graph_id) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_column_graph_table ON public.er_column USING btree (graph_id, table_key) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_database_connection_type ON public.er_database_connection USING btree (db_type, status);

CREATE INDEX idx_er_graph_member_user ON public.er_graph_member USING btree (user_id);

CREATE INDEX idx_er_graph_product ON public.er_graph USING btree (product_id);

CREATE INDEX idx_er_graph_source_connection ON public.er_graph USING btree (source_connection_id);

CREATE INDEX idx_er_relation_graph ON public.er_relation USING btree (graph_id) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_relation_source ON public.er_relation USING btree (graph_id, source_table_key, source_column_key) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_relation_target ON public.er_relation USING btree (graph_id, target_table_key, target_column_key) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_search_document_graph ON public.er_search_document USING btree (graph_id);

CREATE INDEX idx_er_table_graph ON public.er_table USING btree (graph_id) WHERE (deleted_at IS NULL);

CREATE INDEX idx_er_yjs_update_graph_created ON public.er_yjs_update USING btree (graph_id, created_at);

CREATE INDEX idx_product_member_user ON public.product_member USING btree (user_id);

CREATE INDEX idx_swimlane_component_edge_version ON public.swimlane_component_edge USING btree (component_version_id);

CREATE INDEX idx_swimlane_component_node_er_ref_er ON public.swimlane_component_node_er_ref USING btree (er_diagram_id, er_table_key, er_column_key);

CREATE INDEX idx_swimlane_component_node_er_ref_node ON public.swimlane_component_node_er_ref USING btree (swimlane_component_node_id);

CREATE INDEX idx_swimlane_component_node_er_ref_version ON public.swimlane_component_node_er_ref USING btree (component_version_id);

CREATE INDEX idx_swimlane_component_node_version ON public.swimlane_component_node USING btree (component_version_id);

CREATE INDEX idx_swimlane_component_product ON public.swimlane_component USING btree (product_id, status) WHERE (deleted_at IS NULL);

CREATE INDEX idx_swimlane_component_version_component ON public.swimlane_component_version USING btree (component_id, status, version_no);

ALTER TABLE ONLY public.app_session
    ADD CONSTRAINT app_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_change_batch
    ADD CONSTRAINT business_flow_change_batch_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_change_op
    ADD CONSTRAINT business_flow_change_op_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.business_flow_change_batch(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_lane_instance_id_fkey FOREIGN KEY (lane_instance_id) REFERENCES public.business_flow_lane_instance(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_source_lane_instance_id_fkey FOREIGN KEY (source_lane_instance_id) REFERENCES public.business_flow_lane_instance(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.business_flow_node(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_target_lane_instance_id_fkey FOREIGN KEY (target_lane_instance_id) REFERENCES public.business_flow_lane_instance(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_edge
    ADD CONSTRAINT business_flow_edge_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.business_flow_node(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_lane_instance
    ADD CONSTRAINT business_flow_lane_instance_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_lane_instance
    ADD CONSTRAINT business_flow_lane_instance_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.swimlane_component(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.business_flow_lane_instance
    ADD CONSTRAINT business_flow_lane_instance_component_version_id_fkey FOREIGN KEY (component_version_id) REFERENCES public.swimlane_component_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.business_flow_member
    ADD CONSTRAINT business_flow_member_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_member
    ADD CONSTRAINT business_flow_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_node
    ADD CONSTRAINT business_flow_node_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_node_er_ref
    ADD CONSTRAINT business_flow_node_er_ref_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_node_er_ref
    ADD CONSTRAINT business_flow_node_er_ref_business_flow_node_id_fkey FOREIGN KEY (business_flow_node_id) REFERENCES public.business_flow_node(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_node_er_ref
    ADD CONSTRAINT business_flow_node_er_ref_er_diagram_id_fkey FOREIGN KEY (er_diagram_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_node
    ADD CONSTRAINT business_flow_node_lane_instance_id_fkey FOREIGN KEY (lane_instance_id) REFERENCES public.business_flow_lane_instance(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow
    ADD CONSTRAINT business_flow_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_flow_snapshot
    ADD CONSTRAINT business_flow_snapshot_business_flow_id_fkey FOREIGN KEY (business_flow_id) REFERENCES public.business_flow(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collab_update
    ADD CONSTRAINT collab_update_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.collab_document(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_business_flow_er_binding
    ADD CONSTRAINT er_business_flow_er_binding_graph_id_flow_key_fkey FOREIGN KEY (graph_id, flow_key) REFERENCES public.er_business_flow(graph_id, flow_key) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_business_flow
    ADD CONSTRAINT er_business_flow_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_business_path
    ADD CONSTRAINT er_business_path_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_change_log
    ADD CONSTRAINT er_change_log_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_column_enum_value
    ADD CONSTRAINT er_column_enum_value_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_column
    ADD CONSTRAINT er_column_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_graph_member
    ADD CONSTRAINT er_graph_member_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_graph_member
    ADD CONSTRAINT er_graph_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_graph_snapshot
    ADD CONSTRAINT er_graph_snapshot_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_graph
    ADD CONSTRAINT er_graph_source_connection_id_fkey FOREIGN KEY (source_connection_id) REFERENCES public.er_database_connection(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.er_relation
    ADD CONSTRAINT er_relation_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_search_document
    ADD CONSTRAINT er_search_document_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_table
    ADD CONSTRAINT er_table_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_validation_issue
    ADD CONSTRAINT er_validation_issue_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_yjs_doc
    ADD CONSTRAINT er_yjs_doc_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_yjs_update
    ADD CONSTRAINT er_yjs_update_graph_id_fkey FOREIGN KEY (graph_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.er_yjs_update
    ADD CONSTRAINT er_yjs_update_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.er_graph
    ADD CONSTRAINT fk_er_graph_product FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE ONLY public.product_member
    ADD CONSTRAINT product_member_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_member
    ADD CONSTRAINT product_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_edge
    ADD CONSTRAINT swimlane_component_edge_component_version_id_fkey FOREIGN KEY (component_version_id) REFERENCES public.swimlane_component_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_node
    ADD CONSTRAINT swimlane_component_node_component_version_id_fkey FOREIGN KEY (component_version_id) REFERENCES public.swimlane_component_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_node_er_ref
    ADD CONSTRAINT swimlane_component_node_er_ref_component_version_id_fkey FOREIGN KEY (component_version_id) REFERENCES public.swimlane_component_version(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_node_er_ref
    ADD CONSTRAINT swimlane_component_node_er_ref_er_diagram_id_fkey FOREIGN KEY (er_diagram_id) REFERENCES public.er_graph(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_node_er_ref
    ADD CONSTRAINT swimlane_component_node_er_ref_swimlane_component_node_id_fkey FOREIGN KEY (swimlane_component_node_id) REFERENCES public.swimlane_component_node(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component
    ADD CONSTRAINT swimlane_component_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.swimlane_component_version
    ADD CONSTRAINT swimlane_component_version_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.swimlane_component(id) ON DELETE CASCADE;

-- Default product / ER graph for local development
INSERT INTO public.product (id, code, name, description, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default Product',
    'Default product created for existing ER diagrams and business flows',
    'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.er_graph (id, name, description, business_domain, product_id)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default ER graph',
    'default',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.er_graph_snapshot (graph_id, x6_json, business_json)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '{"nodes":[],"edges":[]}'::jsonb,
    '[]'::jsonb
)
ON CONFLICT (graph_id) DO NOTHING;

INSERT INTO public.app_migration_state (migration_key)
VALUES ('001_baseline')
ON CONFLICT (migration_key) DO NOTHING;
