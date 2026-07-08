## Context

业务流程图已经具备通用 BPMN 节点、泳道、Task UI 上下文、协作和 Agent Context。流程容器原本试图在通用 BPMN 子流程上叠加一个可嵌入框能力，但测试暴露出父子关系解绑、重新拖回、容器移动等交互复杂度。

本次变更不删除数据库字段，只删除产品能力和运行时语义。旧数据进入前端或 Agent Context 时应被安全降级：旧流程容器节点不再展示，旧内部节点恢复为普通泳道节点。

## Goals / Non-Goals

**Goals:**

- 用户不能从工具箱新增流程容器。
- 用户不能在属性面板配置流程容器。
- X6 不再支持流程容器拖入、拖出、高亮、缩放、嵌套或非空删除保护。
- 旧流程容器节点在打开旧图或旧组件模板时被过滤。
- 旧内部节点保留，并按原容器偏移恢复到泳道顶层。
- 数据库字段暂不做破坏性删除。
- Agent Context 不再暴露流程容器结构。

**Non-Goals:**

- 不删除 `process_container_json` 和 `container_node_key` 数据库列。
- 不迁移清空历史数据库数据。
- 不删除 Task UI Steps/Page 能力。
- 不删除普通 BPMN 事务节点。

## Decisions

### Decision 1: 前端运行时清洗旧流程容器

前端在业务图和组件模板进入 X6 之前识别旧流程容器节点，并从画布数据中过滤这些节点。识别条件为 `SUB_PROCESS/EMBEDDED` 且存在历史 `processContainerJson.containerMode`。

旧内部节点不删除；如果其 `containerNodeKey` 指向被过滤的容器，则将容器相对偏移加回节点位置，并清空 `containerNodeKey`。

### Decision 2: 删除 X6 容器交互，不保留隐藏能力

X6 层不再提供流程容器命中态、拖入拖出、parent/child 重归属、容器缩放、容器 fit 或非空删除保护。保留的父子关系只用于泳道。

### Decision 3: 后端字段兼容，业务语义忽略

后端继续读取和写入现有数据库结构，但 `process_container_json` 被规整为空对象，Agent Context 过滤旧流程容器节点，并将边作用域视为普通顶层连线。

### Decision 4: OpenSpec 记录保留删除决策

该变更原本用于增强流程容器，现调整为移除流程容器能力。后续若重新引入，需要另开变更并重新定义交互、数据和验证边界。

## Risks / Trade-offs

- [Risk] 旧数据库仍保留流程容器字段，直接查库会看到历史数据。Mitigation: 产品运行时和 Agent Context 忽略该语义，数据库清理留给后续显式迁移。
- [Risk] 旧内部节点恢复为泳道顶层后位置可能与原容器布局略有差异。Mitigation: 使用容器偏移恢复绝对视觉位置。
- [Risk] 第三方直接调用 API 仍可能提交旧字段。Mitigation: 前端不再生成字段，后端语义层不再把字段解释为流程容器能力。

## Migration Plan

1. 删除工具箱和属性面板入口。
2. 移除 X6 流程容器交互。
3. 在前端画布和协作层清洗旧流程容器。
4. 在 Agent Context 中过滤旧流程容器结构。
5. 保留数据库字段，暂不做破坏性迁移。
6. 运行前端构建、后端编译和 OpenSpec strict 校验。
