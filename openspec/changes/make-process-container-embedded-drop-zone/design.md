## Context

业务流程图当前已经具备 BPMN 节点集合、泳道父子关系、Task UI 上下文、`processContainerJson` 和 `containerNodeKey` 等基础字段。现状的问题不是缺少字段，而是流程容器的交互语义没有达到用户预期：用户希望容器是画布上的一个可见框，能够像泳道一样承载内部 BPMN 元素，并且支持拖拽过程中实时进出、即时显示内部元素。

现有泳道交互已经使用 X6 parent/child 表达父子关系。流程容器应复用这一模型，但不能只在保存时推导父子关系；画布交互、增量保存、协作同步、历史恢复和 Agent context 都必须以同一套容器层级为准。

## Goals / Non-Goals

**Goals:**

- 流程容器在画布上表现为可承载内容的框，内部区域清晰可见。
- BPMN 节点可通过拖拽实时进入或离开流程容器。
- 拖入后节点成为容器内部节点，拖出后恢复为泳道顶层节点。
- 容器内部节点、内部连线、跨容器边界连线都能正常显示、保存、协作同步和恢复。
- 移动流程容器时，内部节点和连线视觉上跟随容器移动。
- Agent context 输出容器层级、内部节点列表和边作用域，便于 Agent 理解子流程。

**Non-Goals:**

- 不删除 BPMN 节点本身或 BPMN 工具箱。
- 不重新引入业务语义 Profile 节点面板。
- 不在本变更中实现任意深度容器嵌套；第一版限制流程容器不能再拖入流程容器。
- 不把流程容器做成独立小画布或 iframe；它仍然是主 X6 图中的节点与嵌入关系。
- 不要求自动迁移旧 Call Activity；旧图兼容读取保存即可。

## Decisions

### Decision 1: 以 X6 parent/child 作为画布事实，以 `containerNodeKey` 作为持久化事实

拖入容器时，前端 SHALL 调用容器节点 `addChild(child)`，并同步写入节点数据 `containerNodeKey = container.nodeKey`。拖出容器时，前端 SHALL 将节点重新挂到所属泳道，并清空 `containerNodeKey`。

Rationale: X6 parent/child 决定实时画布行为，`containerNodeKey` 决定 API、协作、历史和 Agent context。两者必须在同一交互事务中更新，不能只依赖保存时补算。

Alternatives considered:

- 只存 `containerNodeKey`，渲染时按字段重建层级。这样无法满足实时拖入拖出体验。
- 只依赖 X6 parent，不落结构化字段。这样后端、历史和 Agent context 无法稳定读取层级。

### Decision 2: 拖拽过程需要容器命中态，拖拽结束提交重归属

拖动普通 BPMN 节点时，前端 SHALL 根据节点中心点或主要交叠区域计算当前命中的流程容器，并在拖动过程中给目标容器展示高亮命中态。拖拽结束时，前端 SHALL 在一个批处理中完成：

- 绝对坐标读取。
- parent 切换。
- 相对坐标转换。
- `containerNodeKey` 更新。
- 容器和泳道尺寸归一化。
- 边刷新与保存状态标记。

Rationale: 拖动过程中给用户实时反馈，结束时一次性提交模型变化，可以避免每一帧都改 X6 parent 导致抖动，同时满足“实时知道能拖进去”的交互要求。

Alternatives considered:

- 每一帧都重新 parent。风险是边刷新和布局归一化频繁触发，容易造成拖拽卡顿和闪烁。
- 只在拖拽结束后静默归属。用户无法判断是否拖入成功，不符合需求。

### Decision 3: 容器内部布局使用本地坐标，容器自身可随内容扩展

容器内部节点的 `position` SHALL 按容器相对坐标保存。容器应有标题区和内容区，节点拖入后不得被标题区遮挡；当内部节点超出内容区时，容器 SHALL 自动扩展到可容纳内部元素。容器移动时不改内部节点相对坐标。

Rationale: 与泳道的相对坐标模型一致，能保证保存、恢复、组件放置后的视觉结构稳定。

Alternatives considered:

- 内部节点继续保存为泳道相对坐标。这样容器移动后内部结构难以恢复，也不利于组件模板复用。

### Decision 4: 边允许跨容器边界，但必须标记作用域

连线校验 SHALL 继续允许容器内部节点连接外部节点。系统 SHALL 在 Agent context 中输出：

- `insideContainer`: source 与 target 在同一流程容器内。
- `crossContainerBoundary`: source 与 target 只有一端在某个流程容器内，或位于不同流程容器。
- `topLevel`: source 与 target 都不在流程容器内。

Rationale: 跨边界连线是合法业务流转，不应阻断；但 Agent 需要知道这条边是否代表子流程与外部流程交接。

### Decision 5: 删除容器时保护内部节点

当流程容器包含内部节点时，删除操作 SHALL 阻断并提示用户先移出或删除内部节点。第一版不做级联删除。

Rationale: 静默删除容器会丢失内部流程，风险高；阻断行为和现有保护逻辑一致。

### Decision 6: 组件模板和业务图实例使用同一套容器语义

泳道组件编辑器、组件发布、组件放置到业务图实例时，SHALL 保留容器节点、内部节点、容器父子关系和相对坐标。放置组件时，节点 key 重映射 SHALL 同步重写 `containerNodeKey`。

Rationale: 用户会把 MES 生产制造流程沉淀为组件模板。模板和实例行为不一致会直接破坏复用。

## Risks / Trade-offs

- [Risk] X6 parent 切换、边刷新和 lane/container 自动 fit 同时发生，可能造成拖拽闪烁。Mitigation: 拖动中只显示命中态，拖拽结束批处理提交，并避免在每一帧做全量 normalize。
- [Risk] 容器和泳道都有父子关系，节点 parent 只能有一个。Mitigation: 画布 parent 使用直接父级：容器内节点 parent 为容器；泳道归属通过 `laneInstanceKey` 保留。
- [Risk] 容器自动扩展可能撑大泳道。Mitigation: 先 fit 容器，再 fit 泳道；拖出节点后允许容器按策略收缩，但不低于最小尺寸。
- [Risk] 协作用户同时拖动同一节点可能出现归属冲突。Mitigation: 以最后提交的节点 `containerNodeKey` 和位置为准，Yjs/materialize 路径必须幂等重建 parent。
- [Risk] 第一版不支持容器嵌套，部分复杂流程需要后续扩展。Mitigation: 明确阻止流程容器拖入流程容器，并返回可理解的 UI 提示或质量问题。

## Migration Plan

1. 复用现有 nullable `container_node_key` 和 `process_container_json` 字段；若环境缺少迁移，则补齐非破坏性迁移。
2. 前端先实现业务流程编辑器中的容器命中态、拖入拖出、parent 切换和保存。
3. 将同一交互能力抽到 X6 基础层，复用到泳道组件编辑器。
4. 补齐 API normalization、增量 ops、Yjs 文档、materialize、历史恢复和组件放置的 `containerNodeKey` 透传与重映射。
5. 补齐 Agent context 的容器层级与 `edgeScope` 输出。
6. 使用前端构建、后端编译、OpenSpec 校验和浏览器拖拽验证确认体验闭环。

Rollback 策略：新增/复用字段保持 nullable。若交互能力需要回退，旧图仍可按普通 BPMN 节点打开；已有 `containerNodeKey` 可被忽略为顶层节点渲染，但不得删除数据。

## Open Questions

- 容器内部节点拖出时，是否需要自动吸附到原泳道的某个安全空白位置，还是保持鼠标释放位置？建议第一版保持释放位置并做最小边界夹紧。
- 容器标题区是否允许放置节点？建议第一版不允许，标题区只用于选择和拖动容器。
- 可复用调用模式是否需要只显示引用流程摘要而不允许内部节点？用户当前要求“可以拖其他元素进去”，建议第一版 `embedded` 和 `reusableCall` 都使用同一容器交互，但 `reusableCall` 额外提示需要填写被调用流程引用。
