export type SwimlaneComponentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type SwimlaneComponentVersionStatus = 'DRAFT' | 'PUBLISHED'
export type BusinessFlowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type BusinessFlowDomainRole = 'owner' | 'editor' | 'viewer'
export type LaneInstanceStatus = 'ACTIVE' | 'REMOVED'

export type BusinessFlowNodeType =
  | 'START'
  | 'END'
  | 'TASK'
  | 'EVENT'
  | 'GATEWAY'
  | 'SUB_PROCESS'
  | 'DATA_OBJECT'
  | 'DATA_INPUT'
  | 'DATA_OUTPUT'
  | 'DATA_STORE'

export type BusinessFlowEdgeEndpointType = 'NODE' | 'LANE'

export type BusinessFlowEdgeType =
  | 'SEQUENCE'
  | 'MESSAGE'
  | 'ASSOCIATION'
  | 'TRIGGER'
  | 'DATA_FLOW'
  | 'CALL'
  | 'DEPENDENCY'
  | 'EXCEPTION'

export type BusinessFlowErRefType = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECK'

export type BusinessFlowJson = Record<string, unknown>

export type TaskUiElementType =
  | 'ContextMenu'
  | 'Button'
  | 'Checkbox'
  | 'DataTable'
  | 'DatePicker'
  | 'Input'
  | 'Label'
  | 'RadioGroup'
  | 'Select'
  | 'Textarea'

export type TaskUiActionType =
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'input'
  | 'clear'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'toggle'
  | 'selectDate'
  | 'selectRange'
  | 'search'
  | 'filter'
  | 'sort'
  | 'selectRow'
  | 'assertVisible'
  | 'assertText'
  | 'assertValue'
  | 'assertCell'
  | 'selectMenuItem'

export type TaskUiTaskType = 'userTask' | 'serviceTask' | 'manualTask'

export type TaskUiValueSource = 'fixed' | 'testData' | 'previousStep' | 'apiResponse'

export type TaskUiOption = {
  label: string
  value: string
  businessMeaning?: string | null
}

export type TaskUiColumn = {
  title: string
  field: string
}

export type TaskUiAssertion =
  | string
  | {
      assertionType?: string | null
      target?: string | null
      expected?: unknown
      description?: string | null
    }

export type TaskUiPageContext = {
  pageName?: string | null
  urlPattern?: string | null
  routePattern?: string | null
  moduleName?: string | null
}

export type TaskUiOperationStep = {
  id: string
  stepNo: number
  elementType: TaskUiElementType | string
  elementName: string
  actionType: TaskUiActionType | string
  elementLocationHint?: string | null
  value?: unknown
  valueSource?: TaskUiValueSource | string | null
  required?: boolean
  businessMeaning?: string | null
  expectedState?: string | null
  expectedResult?: string | null
  screenshotRequired?: boolean
  waitCondition?: string | null
  negativeTestHints?: string[]
  buttonText?: string | null
  buttonRole?: string | null
  disabledCondition?: string | null
  confirmRequired?: boolean
  loadingExpected?: boolean
  inputType?: string | null
  placeholder?: string | null
  minLength?: number | null
  maxLength?: number | null
  pattern?: string | null
  defaultValue?: unknown
  testValues?: string[]
  invalidValues?: string[]
  clearBeforeInput?: boolean
  rows?: number | null
  allowLineBreak?: boolean
  sensitive?: boolean
  options?: TaskUiOption[]
  multiple?: boolean
  searchable?: boolean
  clearable?: boolean
  selectedValue?: unknown
  disabledOptions?: string[]
  optionSource?: string | null
  optionApiRef?: string | null
  layout?: string | null
  checked?: boolean
  requiredToSubmit?: boolean
  labelText?: string | null
  checkedMeaning?: string | null
  uncheckedMeaning?: string | null
  pickerType?: string | null
  dateFormat?: string | null
  minDate?: string | null
  maxDate?: string | null
  disabledDates?: string[]
  presets?: TaskUiOption[]
  selectedDate?: string | null
  selectedRange?: { start?: string | null; end?: string | null } | null
  timezone?: string | null
  columns?: TaskUiColumn[]
  rowKey?: string | null
  pagination?: boolean
  sortableColumns?: string[]
  filterableColumns?: string[]
  selectable?: boolean
  rowActions?: TaskUiOption[]
  expectedRows?: Record<string, unknown>[]
  assertionRules?: string[]
  triggerElement?: string | null
  triggerAction?: string | null
  menuItems?: TaskUiOption[]
  selectedMenuItem?: string | null
  disabledMenuItems?: string[]
  visibleCondition?: string | null
  associatedControl?: string | null
  requiredMark?: boolean
  accessibilityName?: string | null
  expectedText?: string | null
}

export type TaskUiContext = {
  taskName?: string | null
  taskType?: TaskUiTaskType | string | null
  actor?: string | null
  businessIntent?: string | null
  businessRules?: string[]
  preconditions?: string[]
  postconditions?: string[]
  page?: TaskUiPageContext | null
  uiSteps: TaskUiOperationStep[]
  inputDataRefs?: string[]
  outputDataRefs?: string[]
  expectedResults?: string[]
  assertions?: TaskUiAssertion[]
  mockRequirements?: string[]
}

export type BpmnElementType =
  | 'EVENT'
  | 'TASK'
  | 'GATEWAY'
  | 'SUB_PROCESS'
  | 'DATA_OBJECT'
  | 'DATA_INPUT'
  | 'DATA_OUTPUT'
  | 'DATA_STORE'

export type BpmnEventKind = 'START' | 'INTERMEDIATE' | 'END'
export type BpmnEventDefinition = 'NONE'
export type BpmnTaskType = 'NONE'
export type BpmnGatewayType =
  | 'EXCLUSIVE'
  | 'PARALLEL'
  | 'INCLUSIVE'
  | 'COMPLEX'
export type BpmnSubProcessKind = 'EMBEDDED' | 'TRANSACTION'
export type BpmnFlowType = 'SEQUENCE' | 'MESSAGE' | 'ASSOCIATION'
export type BpmnSequenceFlowKind = 'NORMAL' | 'CONDITIONAL' | 'DEFAULT' | 'EXCEPTION'

export type BpmnNodeProfile = {
  bpmnElementType: BpmnElementType
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
}

export type BpmnEdgeProfile = {
  bpmnFlowType: BpmnFlowType
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
}

export type BpmnSemanticType =
  | 'startEvent'
  | 'intermediateEvent'
  | 'endEvent'
  | 'transaction'
  | 'exclusiveGateway'
  | 'inclusiveGateway'
  | 'parallelGateway'
  | 'complexGateway'
  | 'dataObject'
  | 'dataInput'
  | 'dataOutput'
  | 'dataStore'
  | 'sequenceFlow'
  | 'messageFlow'
  | 'association'

export type BpmnBranchCondition = {
  flowId: string
  label: string
  condition: string
}

type BpmnSemanticBase<T extends BpmnSemanticType> = {
  schemaVersion: 1
  semanticType: T
}

export type BpmnSemanticJson =
  | (BpmnSemanticBase<'startEvent'> & {
      eventName: string; triggerType: string; triggerSource: string
      startCondition: string; inputDataRefs: string[]; initiator: string
      frequency: string; preCheckRules: string[]
    })
  | (BpmnSemanticBase<'intermediateEvent'> & {
      eventName: string; catchOrThrow: string; eventDefinition: string
      interrupting: boolean; timeout: string; messageName: string
      errorCode: string; escalationCode: string; businessMeaning: string
    })
  | (BpmnSemanticBase<'endEvent'> & {
      eventName: string; resultType: string; finalBusinessState: string
      outputDataRefs: string[]; notifyTargets: string[]
      auditRequired: boolean; rollbackRequired: boolean
    })
  | (BpmnSemanticBase<'transaction'> & {
      transactionName: string; transactionType: string; successCriteria: string[]
      cancelTriggers: string[]; compensationPolicy: string
      compensationOrder: string; consistencyLevel: string; timeout: string
      isolationNote: string; compensationTasks: string[]
      partialSuccessPolicy: string; auditRequired: boolean
    })
  | (BpmnSemanticBase<'exclusiveGateway'> & {
      decisionName: string; decisionVariable: string
      branches: BpmnBranchCondition[]; defaultFlowId: string
      conditionExpressionType: string; mutuallyExclusive: boolean
      coverageRequired: boolean
    })
  | (BpmnSemanticBase<'inclusiveGateway'> & {
      decisionName: string; branchConditions: BpmnBranchCondition[]
      allowMultipleBranches: boolean; mergePolicy: string
      minSelectedBranches: number | null; coverageRequired: boolean
    })
  | (BpmnSemanticBase<'parallelGateway'> & {
      gatewayName: string; parallelMode: string; waitForAll: boolean
      expectedBranches: string[]; partialFailurePolicy: string
      timeout: string; concurrencyLimit: number | null
    })
  | (BpmnSemanticBase<'complexGateway'> & {
      gatewayName: string; activationCondition: string
      completionCondition: string; requiredCount: number | null
      totalCount: number | null; customRule: string; explanation: string
    })
  | (BpmnSemanticBase<'dataObject'> & {
      dataName: string; entityName: string; schemaRef: string
      lifecycleState: string; ownerActivityRef: string
      readByRefs: string[]; writeByRefs: string[]
    })
  | (BpmnSemanticBase<'dataInput'> & {
      dataName: string; sourceType: string; sourceRef: string
      required: boolean; validationRules: string[]; exampleValue: string
      sensitiveLevel: string; defaultValue: string
    })
  | (BpmnSemanticBase<'dataOutput'> & {
      dataName: string; targetType: string; targetRef: string
      outputContract: string; transformRule: string
      successOutput: string; failureOutput: string
    })
  | (BpmnSemanticBase<'dataStore'> & {
      dataName: string; storeType: string; systemRef: string
      accessMode: string; consistencyLevel: string
      retentionPolicy: string; privacyLevel: string
    })
  | (BpmnSemanticBase<'sequenceFlow'> & {
      flowName: string; flowKind: string; conditionText: string
      conditionExpression: string; conditionExpressionType: string
      priority: number | null; isDefault: boolean; businessRuleRefs: string[]
      testScenarioType: string; expectedResult: string
    })
  | (BpmnSemanticBase<'messageFlow'> & {
      messageName: string; businessMeaning: string; senderRef: string
      receiverRef: string; payloadDataRefs: string[]; deliveryMode: string
      timeout: string; testScenarioType: string; expectedResult: string
    })
  | (BpmnSemanticBase<'association'> & {
      associationName: string; businessMeaning: string; direction: string
      dataRole: string; testScenarioType: string; expectedResult: string
    })

export type CanvasPosition = {
  x: number
  y: number
}

export type CanvasSize = {
  width: number
  height: number
}

export type SwimlaneComponentNode = {
  id: string
  componentVersionId: string
  nodeKey: string
  nodeType: BusinessFlowNodeType
  bpmnElementType?: BpmnElementType | null
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  title: string
  bpmnSemanticJson?: BpmnSemanticJson | null
  taskUiJson?: TaskUiContext | null
  position: CanvasPosition
  size: CanvasSize
  erRefs?: BusinessFlowNodeErRef[]
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
}

export type SwimlaneComponentEdge = {
  id: string
  componentVersionId: string
  edgeKey: string
  sourceNodeKey: string
  targetNodeKey: string
  sourcePort?: string | null
  targetPort?: string | null
  edgeType: BusinessFlowEdgeType
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  label?: string | null
  bpmnSemanticJson?: BpmnSemanticJson | null
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
}

export type SwimlaneComponentVersion = {
  id: string
  componentId: string
  versionNo: number
  versionName?: string | null
  status: SwimlaneComponentVersionStatus
  canvasJson?: BusinessFlowJson | null
  semanticJson?: BusinessFlowJson | null
  thumbnailUrl?: string | null
  checksum?: string | null
  createdAt: string
  publishedAt?: string | null
  nodes: SwimlaneComponentNode[]
  edges: SwimlaneComponentEdge[]
}

export type SwimlaneComponent = {
  id: string
  productId: string
  code: string
  name: string
  category?: string | null
  ownerRole?: string | null
  description?: string | null
  status: SwimlaneComponentStatus
  currentVersionNo: number
  createdAt: string
  updatedAt: string
  versions: SwimlaneComponentVersion[]
}

export type SwimlaneComponentListItem = {
  componentId: string
  componentVersionId: string
  productId: string
  name: string
  category?: string | null
  ownerRole?: string | null
  versionNo: number
  thumbnailUrl?: string | null
}

export type LaneInstanceData = {
  kind: 'LANE_INSTANCE'
  laneInstanceId: string
  instanceKey: string
  componentId: string
  componentVersionId: string
  componentName: string
  componentVersionNo: number
  displayName: string
  ownerRole?: string | null
  isOverridden: boolean
}

export type BusinessFlowLaneInstance = LaneInstanceData & {
  businessFlowId: string
  position: CanvasPosition
  size: CanvasSize
  zIndex: number
  layoutJson?: BusinessFlowJson | null
  overrideJson?: BusinessFlowJson | null
  status: LaneInstanceStatus
  createdAt: string
  updatedAt: string
}

export type BusinessFlowNodeErRef = {
  id?: string
  erDiagramId: string
  erTableKey: string
  erColumnKey?: string | null
  refType: BusinessFlowErRefType
  description?: string | null
}

export type BusinessFlowNodeData = {
  kind: 'BUSINESS_FLOW_NODE'
  nodeId: string
  nodeKey: string
  laneInstanceId: string
  originComponentNodeKey?: string | null
  nodeType: BusinessFlowNodeType
  bpmnElementType?: BpmnElementType | null
  bpmnEventKind?: BpmnEventKind | null
  bpmnEventDefinition?: BpmnEventDefinition | null
  bpmnTaskType?: BpmnTaskType | null
  bpmnGatewayType?: BpmnGatewayType | null
  bpmnSubProcessKind?: BpmnSubProcessKind | null
  title: string
  bpmnSemanticJson?: BpmnSemanticJson | null
  taskUiJson?: TaskUiContext | null
  erRefs?: BusinessFlowNodeErRef[]
}

export type BusinessFlowNodeRecord = BusinessFlowNodeData & {
  businessFlowId: string
  position: CanvasPosition
  size: CanvasSize
  isOverridden: boolean
  taskUiJson?: TaskUiContext | null
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
  createdAt: string
  updatedAt: string
}

export type BusinessFlowEdgeData = {
  kind: 'BUSINESS_FLOW_EDGE'
  edgeId: string
  edgeKey: string
  edgeType: BusinessFlowEdgeType
  bpmnFlowType?: BpmnFlowType | null
  bpmnSequenceFlowKind?: BpmnSequenceFlowKind | null
  label?: string | null
  bpmnSemanticJson?: BpmnSemanticJson | null
  isCrossLane: boolean
}

export type BusinessFlowEdgeRecord = BusinessFlowEdgeData & {
  businessFlowId: string
  laneInstanceId?: string | null
  sourceType: BusinessFlowEdgeEndpointType
  sourceNodeKey?: string | null
  sourceLaneInstanceKey?: string | null
  sourcePort?: string | null
  targetType: BusinessFlowEdgeEndpointType
  targetNodeKey?: string | null
  targetLaneInstanceKey?: string | null
  targetPort?: string | null
  originComponentEdgeKey?: string | null
  isOverridden: boolean
  styleJson?: BusinessFlowJson | null
  propertiesJson?: BusinessFlowJson | null
  createdAt: string
  updatedAt: string
}

export type LocalBusinessFlowCanvas = {
  businessFlowId: string
  name: string
  code?: string | null
  description?: string | null
  version: number
  collabRevision: number
  createdAt: string
  updatedAt: string
  laneInstances: BusinessFlowLaneInstance[]
  nodes: BusinessFlowNodeRecord[]
  edges: BusinessFlowEdgeRecord[]
}

export type BusinessFlowCellData = LaneInstanceData | BusinessFlowNodeData | BusinessFlowEdgeData

export type BusinessFlowMemberModel = {
  userId: string
  email: string
  displayName: string
  role: BusinessFlowDomainRole
  createdAt: string
  isCreator?: boolean
}
