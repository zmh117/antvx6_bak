## Why

流程容器能力在实际测试中没有达到预期：内部节点拖出、解绑、重新拖回和移动容器的行为容易产生父子关系残留与视觉不一致。继续扩展该能力会增加业务流程图、泳道组件、协作、历史和 Agent Context 的复杂度。

当前决策是删除流程容器产品能力，保留数据库字段用于旧数据兼容；用户侧不再能新建、配置、拖入拖出或缩放流程容器。

## What Changes

- 从 BPMN 工具箱删除“流程容器”入口。
- 从业务图属性面板和泳道组件属性面板删除“流程容器”配置区。
- 移除 X6 流程容器拖入、拖出、高亮、缩放、嵌套和非空删除保护交互。
- 打开旧图时过滤旧流程容器节点，保留原内部节点并恢复为泳道顶层节点。
- 保留 `processContainerJson`、`containerNodeKey` / `process_container_json`、`container_node_key` 字段，避免数据库破坏性删除。
- Agent Context 不再输出流程容器结构或容器边作用域。

## Capabilities

### Modified Capabilities

- `business-flow-process-container-interaction`: 从“提供流程容器交互”改为“禁用流程容器能力并兼容旧数据”。

## Impact

- 前端业务流程编辑器：工具箱、属性面板、X6 渲染/拖拽/缩放、实时保存、协作缓存。
- 泳道组件编辑器：工具箱节点拖放、属性面板、模板渲染和发布草稿。
- 业务流程数据模型：继续保留旧字段，但新画布状态不再写入容器归属。
- Agent Context：过滤旧流程容器节点，不再输出 `containers` 语义。
