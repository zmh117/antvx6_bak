## ADDED Requirements

### Requirement: 非 Task 元素使用类型专属中文属性面板
系统 SHALL 为当前工具箱中的 12 个非 Task 节点和 Sequence、Message、Association 连线提供类型专属属性面板，并且 SHALL 使用中文字段、中文分组、中文枚举选项和中文质量提示。

#### Scenario: 选择非 Task 节点
- **WHEN** 用户选择开始事件、中间事件、结束事件、事务、四类网关或四类数据节点
- **THEN** 属性面板 SHALL 根据该节点的固定 BPMN 类型展示专属中文字段
- **AND** 属性面板 MUST NOT 显示标题、描述、角色、业务规则、输入摘要、输出摘要、BPMN 节点或 BPMN 节点类型

#### Scenario: 选择 BPMN 连线
- **WHEN** 用户选择 Sequence、Message 或 Association 连线
- **THEN** 属性面板 SHALL 根据连线的固定 BPMN 类型展示专属中文字段
- **AND** 属性面板 MUST NOT 暴露内部 BPMN 连线类型编辑区或已废弃的业务语义 Profile

#### Scenario: 工具箱范围保持不变
- **WHEN** 本变更完成
- **THEN** 工具箱 SHALL 继续只包含现有节点与连线类型
- **AND** 系统 MUST NOT 因本变更新增边界事件、Rule、Pool、Lane、子流程或调用活动

### Requirement: 专属名称驱动画布显示
系统 SHALL 为每种非 Task 节点和连线提供符合其业务含义的中文名称字段，并将该名称同步为画布显示文字。

#### Scenario: 修改事件名称
- **WHEN** 用户修改开始事件、中间事件或结束事件的“事件名称”
- **THEN** 画布节点文字 SHALL 实时更新为该名称
- **AND** 结构化语义 SHALL 保存稳定英文 key `eventName`

#### Scenario: 修改其他元素名称
- **WHEN** 用户修改事务名称、决策名称、网关名称、数据名称、路径名称、消息名称或关联名称
- **THEN** 画布显示文字 SHALL 与专属名称保持一致
- **AND** 底层 `title` 或 `label` SHALL 仅作为显示兼容缓存

### Requirement: 开始事件保存触发语义
系统 SHALL 允许开始事件描述流程因何启动、由谁发起、需要哪些数据和校验。

#### Scenario: 配置开始事件
- **WHEN** 用户编辑开始事件
- **THEN** 属性面板 SHALL 提供事件名称、触发方式、触发来源、启动条件、输入数据、发起方、触发频率和启动前校验规则
- **AND** 触发方式 SHALL 使用中文选项映射到稳定英文枚举

#### Scenario: 开始事件信息不完整
- **WHEN** 开始事件缺少事件名称、触发方式或启动条件
- **THEN** 系统 SHALL 输出可定位到该节点的中文建模质量问题

### Requirement: 中间事件保存等待与抛出语义
系统 SHALL 允许中间事件描述捕获或抛出行为、事件定义、超时和业务含义，但 MUST NOT 暴露当前工具箱不存在的边界事件挂载能力。

#### Scenario: 配置中间事件
- **WHEN** 用户编辑中间事件
- **THEN** 属性面板 SHALL 提供事件名称、捕获或抛出、事件定义、是否中断、超时时间、消息名称、错误码、升级码和业务含义
- **AND** 系统 SHALL 根据事件定义动态展示适用字段

#### Scenario: 不提供边界事件字段
- **WHEN** 用户编辑中间事件
- **THEN** 属性面板 MUST NOT 提供挂载活动、边界位置或边界事件类型
- **AND** 数据模型 MUST NOT 将中间事件伪装为当前工具箱不存在的边界事件

### Requirement: 结束事件保存最终结果语义
系统 SHALL 允许结束事件描述流程的结果类型、最终业务状态、输出、通知、审计和回滚要求。

#### Scenario: 配置结束事件
- **WHEN** 用户编辑结束事件
- **THEN** 属性面板 SHALL 提供事件名称、结果类型、最终业务状态、输出数据、通知对象、是否需要审计和是否需要回滚或补偿

#### Scenario: 结束状态缺失
- **WHEN** 结束事件缺少事件名称、结果类型或最终业务状态
- **THEN** 系统 SHALL 输出中文建模质量问题

### Requirement: 事务保存提交取消与补偿语义
系统 SHALL 为事务节点保存成功条件、取消条件、补偿策略和一致性要求，使 Agent 能生成成功、失败、超时和补偿测试场景。

#### Scenario: 配置事务
- **WHEN** 用户编辑事务节点
- **THEN** 属性面板 SHALL 提供事务名称、事务类型、成功条件、取消触发条件、补偿策略、补偿顺序、一致性级别、事务超时、隔离性说明、补偿活动、部分成功策略和是否审计

#### Scenario: Saga 事务缺少补偿定义
- **WHEN** 事务类型为 Saga 且未填写取消触发条件、补偿策略或补偿活动
- **THEN** 系统 SHALL 输出中文建模质量问题
- **AND** Agent context SHALL 标记补偿用例生成依据不完整

### Requirement: 网关按类型保存决策与汇聚语义
系统 SHALL 为排他、包容、并行和复杂网关分别保存符合该网关行为的专属字段。

#### Scenario: 配置排他网关
- **WHEN** 用户编辑排他网关
- **THEN** 属性面板 SHALL 提供决策名称、判断变量、分支条件、默认路径、条件表达式类型、条件是否互斥和是否要求分支全覆盖

#### Scenario: 配置包容网关
- **WHEN** 用户编辑包容网关
- **THEN** 属性面板 SHALL 提供决策名称、多个分支条件、是否允许多分支命中、合并策略、最少命中分支数和是否要求分支覆盖

#### Scenario: 配置并行网关
- **WHEN** 用户编辑并行网关
- **THEN** 属性面板 SHALL 提供网关名称、并行模式、是否等待全部分支、预期分支、部分失败策略、等待超时和并发限制

#### Scenario: 配置复杂网关
- **WHEN** 用户编辑复杂网关
- **THEN** 属性面板 SHALL 提供网关名称、激活条件、完成条件、要求完成数量、总分支数量、自定义规则和人类可读说明

#### Scenario: 网关配置与实际连线不一致
- **WHEN** 网关的分支引用、默认路径或预期分支引用不存在的连线，或数量约束与实际分支不一致
- **THEN** 系统 SHALL 输出中文建模质量问题

### Requirement: 数据节点保存来源去向与生命周期语义
系统 SHALL 为数据对象、数据输入、数据输出和数据存储分别保存数据业务语义。

#### Scenario: 配置数据对象
- **WHEN** 用户编辑数据对象
- **THEN** 属性面板 SHALL 提供数据名称、业务实体、数据结构引用、生命周期状态、产生或修改活动、读取活动和写入活动

#### Scenario: 配置数据输入
- **WHEN** 用户编辑数据输入
- **THEN** 属性面板 SHALL 提供数据名称、来源类型、来源引用、是否必填、校验规则、示例值、敏感等级和默认值

#### Scenario: 配置数据输出
- **WHEN** 用户编辑数据输出
- **THEN** 属性面板 SHALL 提供数据名称、目标类型、目标引用、输出契约、转换规则、成功输出和失败输出

#### Scenario: 配置数据存储
- **WHEN** 用户编辑数据存储
- **THEN** 属性面板 SHALL 提供数据名称、存储类型、所属系统、访问模式、一致性级别、保留策略和隐私等级

### Requirement: ER 绑定仅属于四类数据节点
系统 SHALL 仅允许数据对象、数据输入、数据输出和数据存储读取、展示和写入 ER 表字段绑定。

#### Scenario: 数据节点绑定 ER 字段
- **WHEN** 用户选择任一四类数据节点
- **THEN** 属性面板 SHALL 展示 ER 绑定入口
- **AND** 保存、刷新、协作和历史恢复 SHALL 保留 ER 表与字段引用

#### Scenario: 非数据元素不允许 ER 绑定
- **WHEN** 用户选择事件、事务、网关、Task 或任一连线
- **THEN** 属性面板 MUST NOT 展示 ER 绑定入口
- **AND** 新保存数据 MUST NOT 为该元素新增 ER 绑定
- **AND** Agent context MUST NOT 投影该元素遗留的 ER 绑定

### Requirement: 三类连线保存类型专属路径语义
系统 SHALL 为 Sequence、Message 和 Association 连线保存不同的结构化语义，并保持连线条件与网关分支可以相互引用。

#### Scenario: 配置 Sequence 连线
- **WHEN** 用户编辑 Sequence 连线
- **THEN** 属性面板 SHALL 提供路径名称、路径类型、自然语言条件、条件表达式、表达式类型、优先级、是否默认路径、业务规则引用、测试场景类型和预期结果

#### Scenario: 配置 Message 连线
- **WHEN** 用户编辑 Message 连线
- **THEN** 属性面板 SHALL 提供消息名称、业务含义、发送方、接收方、负载数据、投递方式、等待超时、测试场景类型和预期结果

#### Scenario: 配置 Association 连线
- **WHEN** 用户编辑 Association 连线
- **THEN** 属性面板 SHALL 提供关联名称、关联含义、关联方向、数据角色、测试场景类型和预期结果

#### Scenario: 默认路径冲突
- **WHEN** 同一网关存在多条默认 Sequence 连线，或默认路径与网关 `defaultFlowId` 不一致
- **THEN** 系统 SHALL 输出中文建模质量问题

### Requirement: 非 Task 语义使用稳定英文 JSON 模型
系统 SHALL 使用按元素类型区分的结构化 JSON 模型保存非 Task 节点和连线语义，并在 TypeScript 与 Python 领域层执行相同的归一化和校验。

#### Scenario: 保存专属字段
- **WHEN** 用户保存任一非 Task 节点或 BPMN 连线
- **THEN** 系统 SHALL 保存 `schemaVersion`、`semanticType` 和对应类型的稳定英文 key
- **AND** 前端 MUST NOT 要求用户理解或填写英文 key

#### Scenario: 类型与语义不匹配
- **WHEN** 节点或连线的内部 BPMN profile 与 `semanticType` 不匹配
- **THEN** 后端 MUST 拒绝该不一致写入或将其归一化为空的正确类型模型
- **AND** 系统 MUST NOT 把一种类型的专属字段解释为另一种类型

#### Scenario: 不复用业务语义 Profile
- **WHEN** 系统读写新的 BPMN 专属语义
- **THEN** 系统 MUST NOT 依赖 `semanticProfileKey`、`semanticProfileVersion` 或通用 `semanticPayloadJson` 选择表单

### Requirement: 新语义贯穿完整图生命周期
系统 SHALL 在业务流程图和泳道组件的创建、编辑、保存、发布、放置、协作、历史和恢复链路中保留非 Task 节点与连线语义。

#### Scenario: 保存并刷新业务图
- **WHEN** 用户编辑多个类型的节点和连线并保存后刷新
- **THEN** 专属名称、结构化字段、画布文字和合法 ER 绑定 SHALL 保持一致

#### Scenario: 发布并放置泳道组件
- **WHEN** 用户发布包含新语义的泳道组件并将其放置到业务流程图
- **THEN** 实例节点和连线 SHALL 继承对应专属语义

#### Scenario: 两个协作者编辑不同元素
- **WHEN** 两个协作者同时编辑不同节点或连线的专属字段
- **THEN** Yjs 增量同步 SHALL 保留双方修改
- **AND** 系统 MUST NOT 以全图旧快照覆盖无关元素

#### Scenario: 恢复历史版本
- **WHEN** 用户恢复包含新语义的历史版本
- **THEN** 结构化语义、画布显示和 ER 绑定 SHALL 恢复到该版本
- **AND** 协作物化状态 SHALL 与恢复后的权威数据一致

### Requirement: Agent context 读取结构化 BPMN 语义
系统 SHALL 从结构化语义层向 Agent 输出非 Task 节点、连线、网关分支和数据 ER 引用，使 Agent 无需读取数据库表或猜测画布图形。

#### Scenario: Agent 读取业务流程图
- **WHEN** Agent 调用现有图上下文接口
- **THEN** `documents` 和结构化业务流程上下文 SHALL 包含节点与连线的类型专属语义
- **AND** 响应 SHALL 继续保持既有 `text + documents` 兼容

#### Scenario: Agent 生成路径测试
- **WHEN** 图中包含网关分支、Sequence 条件、事务取消条件和补偿策略
- **THEN** Agent context SHALL 输出可关联的稳定节点 key 与连线 key
- **AND** Agent SHALL 能区分正常、异常、边界和补偿路径依据

#### Scenario: Agent 读取数据关联
- **WHEN** 四类数据节点存在 ER 绑定
- **THEN** Agent context SHALL 将数据语义与 ER 表字段引用一起输出
- **AND** 非数据元素的旧 ER 绑定 MUST NOT 出现在新语义中

### Requirement: 旧字段兼容但停止承担业务语义
系统 SHALL 保留旧数据库列和内部 BPMN profile 以兼容旧图、渲染与连接校验，但 SHALL 停止在新 UI、领域语义和 Agent context 中使用旧通用字段。

#### Scenario: 打开只有旧标题的节点
- **WHEN** 用户打开尚无新语义 JSON 的旧图
- **THEN** 系统 SHALL 使用旧 `title` 或 `label` 回填对应类型的专属名称
- **AND** 其他专属字段 SHALL 初始化为空的正确类型模型

#### Scenario: 打开包含旧备注的节点
- **WHEN** 旧节点仍包含描述、角色、业务规则、输入摘要或输出摘要
- **THEN** 新属性面板 MUST NOT 展示这些字段
- **AND** Agent context MUST NOT 将这些字段当作新 BPMN 业务语义

#### Scenario: 保存迁移后的旧节点
- **WHEN** 用户编辑并保存由旧图回填的节点
- **THEN** 系统 SHALL 写入新的结构化语义
- **AND** 旧数据库列 MUST NOT 被物理删除
- **AND** `title` 或 `label` SHALL 仅同步专属名称作为画布兼容缓存
