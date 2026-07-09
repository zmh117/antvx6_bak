BEGIN;

DO $$
DECLARE
    item RECORD;
    table_comment TEXT;
    column_comment TEXT;
    foreign_key_target TEXT;
BEGIN
    FOR item IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        table_comment := CASE item.table_name
            WHEN 'app_migration_state' THEN '应用迁移执行状态表'
            WHEN 'app_user' THEN '应用用户表'
            WHEN 'app_session' THEN '用户登录会话表'
            WHEN 'product' THEN '产品主数据表'
            WHEN 'product_member' THEN '产品成员及权限表'
            WHEN 'er_graph' THEN 'ER 图主表'
            WHEN 'er_graph_member' THEN 'ER 图成员及权限表'
            WHEN 'er_graph_snapshot' THEN 'ER 图版本快照表'
            WHEN 'er_table' THEN 'ER 实体表定义'
            WHEN 'er_column' THEN 'ER 字段定义'
            WHEN 'er_column_enum_value' THEN 'ER 字段枚举值定义'
            WHEN 'er_relation' THEN 'ER 实体关系定义'
            WHEN 'er_business_path' THEN 'ER 业务访问路径定义'
            WHEN 'er_search_document' THEN 'ER Agent 检索文档表'
            WHEN 'er_validation_issue' THEN 'ER 模型校验问题表'
            WHEN 'er_change_log' THEN 'ER 图变更日志表'
            WHEN 'er_yjs_doc' THEN 'ER 图协作文档表'
            WHEN 'er_yjs_update' THEN 'ER 图协作增量更新表'
            WHEN 'er_business_flow' THEN '旧版 ER 业务流程表'
            WHEN 'er_business_flow_er_binding' THEN '旧版业务流程 ER 绑定表'
            WHEN 'er_database_connection' THEN '外部数据库连接配置表'
            WHEN 'swimlane_component' THEN '泳道组件主表'
            WHEN 'swimlane_component_version' THEN '泳道组件版本表'
            WHEN 'swimlane_component_node' THEN '泳道组件 BPMN 节点表'
            WHEN 'swimlane_component_edge' THEN '泳道组件 BPMN 连线表'
            WHEN 'swimlane_component_node_er_ref' THEN '泳道组件数据节点 ER 字段绑定表'
            WHEN 'business_flow' THEN '业务流程图主表'
            WHEN 'business_flow_member' THEN '业务流程图成员及权限表'
            WHEN 'business_flow_lane_instance' THEN '业务流程图泳道实例表'
            WHEN 'business_flow_node' THEN '业务流程图 BPMN 节点实例表'
            WHEN 'business_flow_edge' THEN '业务流程图 BPMN 连线实例表'
            WHEN 'business_flow_node_er_ref' THEN '业务流程数据节点 ER 字段绑定表'
            WHEN 'business_flow_change_batch' THEN '业务流程增量变更批次表'
            WHEN 'business_flow_change_op' THEN '业务流程增量变更操作表'
            WHEN 'business_flow_snapshot' THEN '业务流程版本快照表'
            WHEN 'collab_document' THEN '通用协作文档表'
            WHEN 'collab_update' THEN '通用协作增量更新表'
            ELSE '应用业务数据表：' || item.table_name
        END;
        EXECUTE format(
            'COMMENT ON TABLE %I.%I IS %L',
            item.table_schema,
            item.table_name,
            table_comment
        );
    END LOOP;

    FOR item IN
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
    LOOP
        SELECT ccu.table_name || '.' || ccu.column_name
        INTO foreign_key_target
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = item.table_schema
          AND tc.table_name = item.table_name
          AND kcu.column_name = item.column_name
        LIMIT 1;

        column_comment := CASE
            WHEN item.column_name = 'id' THEN '记录主键'
            WHEN item.column_name = 'migration_key' THEN '迁移唯一标识'
            WHEN item.column_name = 'applied_at' THEN '迁移完成时间'
            WHEN item.column_name = 'name' THEN '显示名称'
            WHEN item.column_name = 'code' THEN '业务编码'
            WHEN item.column_name = 'description' THEN '业务说明'
            WHEN item.column_name = 'status' THEN '当前生命周期状态，取值由表约束和领域枚举限定'
            WHEN item.column_name = 'title' THEN '画布显示名称'
            WHEN item.column_name = 'label' THEN '连线显示名称'
            WHEN item.column_name = 'node_key' THEN '节点稳定业务键'
            WHEN item.column_name = 'edge_key' THEN '连线稳定业务键'
            WHEN item.column_name = 'instance_key' THEN '泳道实例稳定业务键'
            WHEN item.column_name = 'node_type' THEN '节点兼容类型标识'
            WHEN item.column_name = 'edge_type' THEN '连线兼容类型标识'
            WHEN item.column_name = 'bpmn_element_type' THEN 'BPMN 元素类型'
            WHEN item.column_name = 'bpmn_event_kind' THEN 'BPMN 事件阶段'
            WHEN item.column_name = 'bpmn_event_definition' THEN 'BPMN 事件定义'
            WHEN item.column_name = 'bpmn_task_type' THEN 'BPMN 任务类型'
            WHEN item.column_name = 'bpmn_gateway_type' THEN 'BPMN 网关类型'
            WHEN item.column_name = 'bpmn_subprocess_kind' THEN 'BPMN 子流程类型'
            WHEN item.column_name = 'bpmn_flow_type' THEN 'BPMN 连线类型'
            WHEN item.column_name = 'bpmn_sequence_flow_kind' THEN 'BPMN 顺序流类型'
            WHEN item.column_name = 'bpmn_semantic_json' THEN 'BPMN 类型专属业务语义 JSON'
            WHEN item.column_name = 'task_ui_json' THEN '任务页面及 UI 操作步骤 JSON'
            WHEN item.column_name = 'properties_json' THEN '扩展属性 JSON'
            WHEN item.column_name = 'style_json' THEN '画布样式 JSON'
            WHEN item.column_name = 'canvas_json' THEN '画布结构 JSON'
            WHEN item.column_name = 'semantic_json' THEN '业务语义快照 JSON'
            WHEN item.column_name = 'layout_json' THEN '布局配置 JSON'
            WHEN item.column_name = 'override_json' THEN '实例覆盖配置 JSON'
            WHEN item.column_name = 'patch_json' THEN '正向变更补丁 JSON'
            WHEN item.column_name = 'inverse_patch_json' THEN '反向恢复补丁 JSON'
            WHEN item.column_name LIKE '%\_json' ESCAPE '\' THEN '结构化扩展数据 JSON'
            WHEN foreign_key_target IS NOT NULL THEN '关联 ' || foreign_key_target || ' 的记录主键'
            WHEN item.column_name LIKE '%\_id' ESCAPE '\' THEN '外部关联记录主键'
            WHEN item.column_name LIKE '%\_key' ESCAPE '\' THEN '稳定业务标识'
            WHEN item.column_name LIKE '%\_type' ESCAPE '\' THEN '类型判别值，取值由表约束和领域枚举限定'
            WHEN item.column_name LIKE 'created\_%' ESCAPE '\' THEN '创建审计信息'
            WHEN item.column_name LIKE 'updated\_%' ESCAPE '\' THEN '更新审计信息'
            WHEN item.column_name LIKE 'deleted\_%' ESCAPE '\' THEN '软删除审计信息'
            WHEN item.column_name LIKE 'published\_%' ESCAPE '\' THEN '发布审计信息'
            WHEN item.column_name IN ('position_x', 'position_y') THEN '画布坐标'
            WHEN item.column_name IN ('width', 'height') THEN '画布尺寸'
            WHEN item.column_name = 'z_index' THEN '画布层级顺序'
            WHEN item.column_name = 'version' THEN '数据版本号'
            WHEN item.column_name LIKE '%\_version' ESCAPE '\' THEN '版本号'
            WHEN item.column_name LIKE '%\_version_no' ESCAPE '\' THEN '版本序号'
            WHEN item.column_name LIKE 'is\_%' ESCAPE '\' THEN '布尔状态标记'
            ELSE '业务字段：' || item.column_name
        END;
        EXECUTE format(
            'COMMENT ON COLUMN %I.%I.%I IS %L',
            item.table_schema,
            item.table_name,
            item.column_name,
            column_comment
        );
    END LOOP;
END;
$$;

INSERT INTO app_migration_state(migration_key)
VALUES ('020_schema_comments')
ON CONFLICT (migration_key) DO UPDATE
SET applied_at = EXCLUDED.applied_at;

COMMIT;
