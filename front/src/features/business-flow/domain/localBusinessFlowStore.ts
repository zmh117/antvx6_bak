import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BusinessFlowEdgeRecord,
  BusinessFlowEdgeType,
  BusinessFlowLaneInstance,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  BusinessFlowNodeType,
  CanvasPosition,
  CanvasSize,
  LocalBusinessFlowCanvas,
  ProcessContainerConfig,
  SwimlaneComponent,
  SwimlaneComponentEdge,
  SwimlaneComponentListItem,
  SwimlaneComponentNode,
  SwimlaneComponentVersion,
  TaskUiContext,
} from '@/entities/business-flow'
import {
  bpmnNodeSize,
  bpmnNodeTitle,
  legacyEdgeTypeForBpmn,
  legacyNodeTypeForBpmn,
  mergeBpmnIntoProperties,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
} from '@/entities/business-flow'

const STORAGE_KEY = 'antvx6:business-flow-demo:v1'
const DEFAULT_PRODUCT_ID = 'default-product'
const DEFAULT_LANE_SIZE: CanvasSize = { width: 360, height: 360 }

type StoreShape = {
  schemaVersion: 1
  components: SwimlaneComponent[]
  canvases: LocalBusinessFlowCanvas[]
}

export type ComponentEditorNodeDraft = {
  nodeKey: string
  nodeType: BusinessFlowNodeType
  bpmnElementType?: BpmnNodeProfile['bpmnElementType'] | null
  bpmnEventKind?: BpmnNodeProfile['bpmnEventKind'] | null
  bpmnEventDefinition?: BpmnNodeProfile['bpmnEventDefinition'] | null
  bpmnTaskType?: BpmnNodeProfile['bpmnTaskType'] | null
  bpmnGatewayType?: BpmnNodeProfile['bpmnGatewayType'] | null
  bpmnSubProcessKind?: BpmnNodeProfile['bpmnSubProcessKind'] | null
  bpmnCallActivityRef?: string | null
  title: string
  description?: string | null
  actor?: string | null
  businessRule?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
  semanticProfileKey?: string | null
  semanticProfileVersion?: number | null
  semanticPayloadJson?: Record<string, unknown> | null
  taskUiJson?: TaskUiContext | null
  processContainerJson?: ProcessContainerConfig | null
  containerNodeKey?: string | null
  erRefs?: BusinessFlowNodeErRef[]
  position: CanvasPosition
  size: CanvasSize
  styleJson?: Record<string, unknown> | null
  propertiesJson?: Record<string, unknown> | null
}

export type ComponentEditorEdgeDraft = {
  edgeKey: string
  sourceNodeKey: string
  targetNodeKey: string
  sourcePort?: string | null
  targetPort?: string | null
  edgeType: BusinessFlowEdgeType
  bpmnFlowType?: BpmnEdgeProfile['bpmnFlowType'] | null
  bpmnSequenceFlowKind?: BpmnEdgeProfile['bpmnSequenceFlowKind'] | null
  bpmnMessageName?: string | null
  bpmnConditionExpression?: string | null
  label?: string | null
  conditionText?: string | null
  dataContractJson?: Record<string, unknown> | null
  semanticProfileKey?: string | null
  semanticProfileVersion?: number | null
  semanticPayloadJson?: Record<string, unknown> | null
  styleJson?: Record<string, unknown> | null
  propertiesJson?: Record<string, unknown> | null
}

export type BusinessFlowCanvasDraft = Pick<
  LocalBusinessFlowCanvas,
  'businessFlowId' | 'name' | 'code' | 'description' | 'laneInstances' | 'nodes' | 'edges'
>

export type BusinessFlowMetaInput = {
  id: string
  name?: string | null
  code?: string | null
  description?: string | null
}

function nowIso() {
  return new Date().toISOString()
}

export function createLocalId(prefix: string) {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${uuid.replaceAll('-', '').slice(0, 14)}`
}

function makeComponentNode(
  componentVersionId: string,
  nodeType: BusinessFlowNodeType,
  title: string,
  position: CanvasPosition,
  size?: CanvasSize,
  extra?: Partial<SwimlaneComponentNode>,
): SwimlaneComponentNode {
  const nodeKey = extra?.nodeKey ?? createLocalId('cmp_node')
  const bpmnProfile = normalizeBpmnNodeProfile({
    nodeType,
    bpmnElementType: extra?.bpmnElementType,
    bpmnEventKind: extra?.bpmnEventKind,
    bpmnEventDefinition: extra?.bpmnEventDefinition,
    bpmnTaskType: extra?.bpmnTaskType,
    bpmnGatewayType: extra?.bpmnGatewayType,
    bpmnSubProcessKind: extra?.bpmnSubProcessKind,
    bpmnCallActivityRef: extra?.bpmnCallActivityRef,
    propertiesJson: extra?.propertiesJson,
  })
  const nextNodeType = extra?.nodeType ?? legacyNodeTypeForBpmn(bpmnProfile)
  return {
    id: createLocalId('scn'),
    componentVersionId,
    ...extra,
    nodeKey,
    nodeType: nextNodeType,
    ...bpmnProfile,
    title: extra?.title ?? title,
    description: extra?.description ?? null,
    actor: extra?.actor ?? null,
    businessRule: extra?.businessRule ?? null,
    inputSummary: extra?.inputSummary ?? null,
    outputSummary: extra?.outputSummary ?? null,
    semanticProfileKey: extra?.semanticProfileKey ?? null,
    semanticProfileVersion: extra?.semanticProfileVersion ?? null,
    semanticPayloadJson: extra?.semanticPayloadJson ?? {},
    taskUiJson: extra?.taskUiJson ?? null,
    processContainerJson: extra?.processContainerJson ?? null,
    containerNodeKey: extra?.containerNodeKey ?? null,
    erRefs: extra?.erRefs ?? [],
    position: extra?.position ?? position,
    size: extra?.size ?? size ?? bpmnNodeSize(bpmnProfile),
    styleJson: extra?.styleJson ?? null,
    propertiesJson: mergeBpmnIntoProperties(extra?.propertiesJson, bpmnProfile),
  }
}

function makeComponentEdge(
  componentVersionId: string,
  sourceNodeKey: string,
  targetNodeKey: string,
  label?: string | null,
): SwimlaneComponentEdge {
  const bpmnProfile = normalizeBpmnEdgeProfile({ edgeType: 'SEQUENCE' })
  return {
    id: createLocalId('sce'),
    componentVersionId,
    edgeKey: createLocalId('cmp_edge'),
    sourceNodeKey,
    targetNodeKey,
    sourcePort: null,
    targetPort: null,
    edgeType: legacyEdgeTypeForBpmn(bpmnProfile),
    ...bpmnProfile,
    label: label ?? null,
    conditionText: label ?? null,
    dataContractJson: null,
    semanticProfileKey: null,
    semanticProfileVersion: null,
    semanticPayloadJson: {},
    styleJson: null,
    propertiesJson: mergeBpmnIntoProperties(null, bpmnProfile),
  }
}

function makeSeedComponent(
  code: string,
  name: string,
  category: string,
  ownerRole: string,
  description: string,
  nodeSpecs: Array<{
    key: string
    type: BusinessFlowNodeType
    title: string
    x: number
    y: number
    businessRule?: string
  }>,
  edgeSpecs: Array<{ source: string; target: string; label?: string | null }>,
): SwimlaneComponent {
  const createdAt = nowIso()
  const componentId = `cmp_${code}`
  const versionId = `${componentId}_v1`
  const nodes = nodeSpecs.map((spec) =>
    makeComponentNode(
      versionId,
      spec.type,
      spec.title,
      { x: spec.x, y: spec.y },
      undefined,
      {
        nodeKey: spec.key,
        businessRule: spec.businessRule ?? null,
      },
    ),
  )
  const edges = edgeSpecs.map((spec) =>
    makeComponentEdge(versionId, spec.source, spec.target, spec.label),
  )
  return {
    id: componentId,
    productId: DEFAULT_PRODUCT_ID,
    code,
    name,
    category,
    ownerRole,
    description,
    status: 'PUBLISHED',
    currentVersionNo: 1,
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        componentId,
        versionNo: 1,
        versionName: 'v1',
        status: 'PUBLISHED',
        canvasJson: null,
        semanticJson: null,
        thumbnailUrl: null,
        checksum: null,
        createdAt,
        publishedAt: createdAt,
        nodes,
        edges,
      },
    ],
  }
}

function seedStore(): StoreShape {
  return {
    schemaVersion: 1,
    components: [
      makeSeedComponent(
        'inventory',
        '库存处理',
        '订单流程',
        '库存系统',
        '负责查询库存、锁定库存和释放库存。',
        [
          { key: 'inventory_start', type: 'START', title: '收到订单', x: 132, y: 36 },
          { key: 'inventory_query', type: 'TASK', title: '查询库存', x: 92, y: 124 },
          { key: 'inventory_decide', type: 'GATEWAY', title: '库存充足?', x: 118, y: 218 },
          { key: 'inventory_lock', type: 'TASK', title: '锁定库存', x: 92, y: 318 },
        ],
        [
          { source: 'inventory_start', target: 'inventory_query' },
          { source: 'inventory_query', target: 'inventory_decide' },
          { source: 'inventory_decide', target: 'inventory_lock', label: '充足' },
        ],
      ),
      makeSeedComponent(
        'payment',
        '支付处理',
        '订单流程',
        '支付系统',
        '负责发起支付、确认支付结果和失败补偿。',
        [
          { key: 'payment_start', type: 'EVENT', title: '允许支付', x: 132, y: 42 },
          { key: 'payment_create', type: 'TASK', title: '创建支付单', x: 92, y: 130 },
          { key: 'payment_wait', type: 'TASK', title: '用户支付', x: 92, y: 224 },
          { key: 'payment_done', type: 'END', title: '支付成功', x: 132, y: 328 },
        ],
        [
          { source: 'payment_start', target: 'payment_create' },
          { source: 'payment_create', target: 'payment_wait' },
          { source: 'payment_wait', target: 'payment_done' },
        ],
      ),
      makeSeedComponent(
        'shipping',
        '发货处理',
        '订单流程',
        '履约系统',
        '负责生成发货任务、拣货和通知物流。',
        [
          { key: 'shipping_start', type: 'EVENT', title: '支付成功', x: 132, y: 42 },
          { key: 'shipping_pick', type: 'TASK', title: '拣货复核', x: 92, y: 132 },
          { key: 'shipping_label', type: 'TASK', title: '生成面单', x: 92, y: 226 },
          { key: 'shipping_end', type: 'END', title: '通知物流', x: 132, y: 330 },
        ],
        [
          { source: 'shipping_start', target: 'shipping_pick' },
          { source: 'shipping_pick', target: 'shipping_label' },
          { source: 'shipping_label', target: 'shipping_end' },
        ],
      ),
    ],
    canvases: [],
  }
}

function parseStore(raw: string | null): StoreShape | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoreShape
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.components)) return null
    return parsed
  } catch {
    return null
  }
}

export function loadBusinessFlowDemoStore(): StoreShape {
  const parsed = parseStore(window.localStorage.getItem(STORAGE_KEY))
  if (parsed) return parsed
  const seeded = seedStore()
  saveBusinessFlowDemoStore(seeded)
  return seeded
}

function saveBusinessFlowDemoStore(store: StoreShape) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function updateStore(mutator: (store: StoreShape) => StoreShape) {
  const next = mutator(loadBusinessFlowDemoStore())
  saveBusinessFlowDemoStore(next)
  return next
}

export function listSwimlaneComponents() {
  return loadBusinessFlowDemoStore().components
}

export function listPublishedSwimlaneComponentItems(
  productId?: string | null,
): SwimlaneComponentListItem[] {
  return listSwimlaneComponents()
    .filter(
      (component) =>
        component.status === 'PUBLISHED' &&
        (!productId || component.productId === productId),
    )
    .map((component) => {
      const version = getCurrentComponentVersion(component)
      return {
        componentId: component.id,
        componentVersionId: version?.id ?? '',
        productId: component.productId,
        name: component.name,
        category: component.category,
        ownerRole: component.ownerRole,
        versionNo: version?.versionNo ?? component.currentVersionNo,
        thumbnailUrl: version?.thumbnailUrl,
      }
    })
    .filter((item) => item.componentVersionId)
}

export function getSwimlaneComponent(componentId: string) {
  return listSwimlaneComponents().find((component) => component.id === componentId) ?? null
}

export function getCurrentComponentVersion(component: SwimlaneComponent) {
  return (
    component.versions.find((version) => version.versionNo === component.currentVersionNo) ??
    component.versions.at(-1) ??
    null
  )
}

export function getSwimlaneComponentVersion(componentVersionId: string) {
  for (const component of listSwimlaneComponents()) {
    const version = component.versions.find((item) => item.id === componentVersionId)
    if (version) return { component, version }
  }
  return null
}

export function createSwimlaneComponent(productId = DEFAULT_PRODUCT_ID) {
  const timestamp = nowIso()
  const componentId = createLocalId('cmp')
  const versionId = `${componentId}_v1`
  const component: SwimlaneComponent = {
    id: componentId,
    productId,
    code: componentId,
    name: '新泳道组件',
    category: '自定义',
    ownerRole: '业务系统',
    description: '',
    status: 'PUBLISHED',
    currentVersionNo: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    versions: [
      {
        id: versionId,
        componentId,
        versionNo: 1,
        versionName: 'v1',
        status: 'PUBLISHED',
        canvasJson: null,
        semanticJson: null,
        thumbnailUrl: null,
        checksum: null,
        createdAt: timestamp,
        publishedAt: timestamp,
        nodes: [],
        edges: [],
      },
    ],
  }
  updateStore((store) => ({ ...store, components: [component, ...store.components] }))
  return component
}

export function updateSwimlaneComponentMeta(
  componentId: string,
  values: {
    productId?: string | null
    code?: string | null
    name?: string | null
    category?: string | null
    ownerRole?: string | null
    description?: string | null
  },
) {
  const timestamp = nowIso()
  let saved: SwimlaneComponent | null = null
  updateStore((store) => ({
    ...store,
    components: store.components.map((component) => {
      if (component.id !== componentId) return component
      saved = {
        ...component,
        productId: values.productId?.trim() || component.productId,
        code: values.code?.trim() || component.code,
        name: values.name?.trim() || component.name,
        category: values.category ?? null,
        ownerRole: values.ownerRole ?? null,
        description: values.description ?? null,
        updatedAt: timestamp,
      }
      return saved
    }),
  }))
  return saved
}

export function removeSwimlaneComponent(componentId: string) {
  let removed: SwimlaneComponent | null = null
  updateStore((store) => {
    removed = store.components.find((component) => component.id === componentId) ?? null
    return {
      ...store,
      components: store.components.filter((component) => component.id !== componentId),
    }
  })
  return removed
}

export function saveSwimlaneComponentVersion(
  componentId: string,
  values: {
    name: string
    category?: string | null
    ownerRole?: string | null
    description?: string | null
    nodes: ComponentEditorNodeDraft[]
    edges: ComponentEditorEdgeDraft[]
  },
) {
  const timestamp = nowIso()
  let saved: SwimlaneComponent | null = null
  updateStore((store) => ({
    ...store,
    components: store.components.map((component) => {
      if (component.id !== componentId) return component
      const current = getCurrentComponentVersion(component)
      const versionId = current?.id ?? `${component.id}_v1`
      const versionNo = current?.versionNo ?? 1
      const nodes: SwimlaneComponentNode[] = values.nodes.map((node) => {
        const bpmnProfile = normalizeBpmnNodeProfile({
          nodeType: node.nodeType,
          bpmnElementType: node.bpmnElementType,
          bpmnEventKind: node.bpmnEventKind,
          bpmnEventDefinition: node.bpmnEventDefinition,
          bpmnTaskType: node.bpmnTaskType,
          bpmnGatewayType: node.bpmnGatewayType,
          bpmnSubProcessKind: node.bpmnSubProcessKind,
          bpmnCallActivityRef: node.bpmnCallActivityRef,
          propertiesJson: node.propertiesJson,
        })
        return {
          id: createLocalId('scn'),
          componentVersionId: versionId,
          nodeKey: node.nodeKey,
          nodeType: legacyNodeTypeForBpmn(bpmnProfile),
          ...bpmnProfile,
          title: node.title,
          description: node.description ?? null,
          actor: node.actor ?? null,
          businessRule: node.businessRule ?? null,
          inputSummary: node.inputSummary ?? null,
          outputSummary: node.outputSummary ?? null,
          semanticProfileKey: node.semanticProfileKey ?? null,
          semanticProfileVersion: node.semanticProfileVersion ?? null,
          semanticPayloadJson: node.semanticPayloadJson ?? {},
          taskUiJson: node.taskUiJson ?? null,
          processContainerJson: node.processContainerJson ?? null,
          containerNodeKey: node.containerNodeKey ?? null,
          erRefs: node.erRefs ?? [],
          position: node.position,
          size: node.size,
          styleJson: node.styleJson ?? null,
          propertiesJson: mergeBpmnIntoProperties(node.propertiesJson, bpmnProfile),
        }
      })
      const edges: SwimlaneComponentEdge[] = values.edges.map((edge) => {
        const bpmnProfile = normalizeBpmnEdgeProfile({
          edgeType: edge.edgeType,
          bpmnFlowType: edge.bpmnFlowType,
          bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
          bpmnMessageName: edge.bpmnMessageName,
          bpmnConditionExpression: edge.bpmnConditionExpression,
          propertiesJson: edge.propertiesJson,
        })
        return {
          id: createLocalId('sce'),
          componentVersionId: versionId,
          edgeKey: edge.edgeKey,
          sourceNodeKey: edge.sourceNodeKey,
          targetNodeKey: edge.targetNodeKey,
          sourcePort: edge.sourcePort ?? null,
          targetPort: edge.targetPort ?? null,
          edgeType: legacyEdgeTypeForBpmn(bpmnProfile),
          ...bpmnProfile,
          label: edge.label ?? null,
          conditionText: edge.conditionText ?? null,
          dataContractJson: edge.dataContractJson ?? null,
          semanticProfileKey: edge.semanticProfileKey ?? null,
          semanticProfileVersion: edge.semanticProfileVersion ?? null,
          semanticPayloadJson: edge.semanticPayloadJson ?? {},
          styleJson: edge.styleJson ?? null,
          propertiesJson: mergeBpmnIntoProperties(edge.propertiesJson, bpmnProfile),
        }
      })
      const nextVersion: SwimlaneComponentVersion = {
        id: versionId,
        componentId: component.id,
        versionNo,
        versionName: `v${versionNo}`,
        status: 'PUBLISHED',
        canvasJson: null,
        semanticJson: { nodeCount: nodes.length, edgeCount: edges.length },
        thumbnailUrl: null,
        checksum: `${nodes.length}:${edges.length}:${timestamp}`,
        createdAt: current?.createdAt ?? timestamp,
        publishedAt: timestamp,
        nodes,
        edges,
      }
      saved = {
        ...component,
        name: values.name.trim() || component.name,
        category: values.category ?? null,
        ownerRole: values.ownerRole ?? null,
        description: values.description ?? null,
        status: 'PUBLISHED',
        currentVersionNo: versionNo,
        updatedAt: timestamp,
        versions: component.versions.map((version) =>
          version.id === versionId ? nextVersion : version,
        ),
      }
      return saved
    }),
  }))
  return saved
}

export function ensureBusinessFlowCanvas(meta: BusinessFlowMetaInput) {
  const store = loadBusinessFlowDemoStore()
  const existing = store.canvases.find((canvas) => canvas.businessFlowId === meta.id)
  if (existing) {
    if (
      existing.name === (meta.name ?? existing.name) &&
      existing.code === (meta.code ?? existing.code) &&
      existing.description === (meta.description ?? existing.description)
    ) {
      return existing
    }
    return saveBusinessFlowCanvas({
      ...existing,
      name: meta.name ?? existing.name,
      code: meta.code ?? existing.code,
      description: meta.description ?? existing.description,
    })
  }
  const timestamp = nowIso()
  const canvas: LocalBusinessFlowCanvas = {
    businessFlowId: meta.id,
    name: meta.name || '未命名业务图',
    code: meta.code ?? null,
    description: meta.description ?? null,
    version: 1,
    collabRevision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    laneInstances: [],
    nodes: [],
    edges: [],
  }
  updateStore((current) => ({ ...current, canvases: [canvas, ...current.canvases] }))
  return canvas
}

export function getBusinessFlowCanvas(businessFlowId: string) {
  return (
    loadBusinessFlowDemoStore().canvases.find(
      (canvas) => canvas.businessFlowId === businessFlowId,
    ) ?? null
  )
}

export function saveBusinessFlowCanvas(draft: BusinessFlowCanvasDraft & { version?: number }) {
  const timestamp = nowIso()
  const existing = getBusinessFlowCanvas(draft.businessFlowId)
  const canvas: LocalBusinessFlowCanvas = {
    businessFlowId: draft.businessFlowId,
    name: draft.name,
    code: draft.code ?? null,
    description: draft.description ?? null,
    version: draft.version ?? (existing?.version ?? 0) + 1,
    collabRevision: existing?.collabRevision ?? 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    laneInstances: draft.laneInstances,
    nodes: draft.nodes,
    edges: draft.edges,
  }
  updateStore((store) => ({
    ...store,
    canvases: [
      canvas,
      ...store.canvases.filter((item) => item.businessFlowId !== canvas.businessFlowId),
    ],
  }))
  return canvas
}

export function placeSwimlaneComponent(
  businessFlowId: string,
  componentVersionId: string,
  position: CanvasPosition,
) {
  const found = getSwimlaneComponentVersion(componentVersionId)
  const canvas = getBusinessFlowCanvas(businessFlowId)
  if (!found || !canvas) return null
  const timestamp = nowIso()
  const laneKey = createLocalId('lane')
  const laneInstanceId = createLocalId('bli')
  const laneSize = computeLaneSize(found.version.nodes)
  const lane: BusinessFlowLaneInstance = {
    kind: 'LANE_INSTANCE',
    laneInstanceId,
    instanceKey: laneKey,
    businessFlowId,
    componentId: found.component.id,
    componentVersionId: found.version.id,
    componentName: found.component.name,
    componentVersionNo: found.version.versionNo,
    displayName: found.component.name,
    ownerRole: found.component.ownerRole,
    isOverridden: false,
    position,
    size: laneSize,
    zIndex: canvas.laneInstances.length + 1,
    layoutJson: null,
    overrideJson: null,
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const keyMap = new Map(
    found.version.nodes.map((node) => [node.nodeKey, `${laneKey}_${node.nodeKey}`]),
  )
  const nodes: BusinessFlowNodeRecord[] = found.version.nodes.map((node) => {
    const nodeKey = keyMap.get(node.nodeKey) ?? `${laneKey}_${node.nodeKey}`
    return {
      kind: 'BUSINESS_FLOW_NODE',
      businessFlowId,
      nodeId: createLocalId('bfn'),
      nodeKey,
	      laneInstanceId,
	      originComponentNodeKey: node.nodeKey,
	      nodeType: node.nodeType,
	      bpmnElementType: node.bpmnElementType ?? null,
	      bpmnEventKind: node.bpmnEventKind ?? null,
	      bpmnEventDefinition: node.bpmnEventDefinition ?? null,
	      bpmnTaskType: node.bpmnTaskType ?? null,
	      bpmnGatewayType: node.bpmnGatewayType ?? null,
	      bpmnSubProcessKind: node.bpmnSubProcessKind ?? null,
	      bpmnCallActivityRef: node.bpmnCallActivityRef ?? null,
	      title: node.title,
	      description: node.description,
	      actor: node.actor,
	      businessRule: node.businessRule,
	      semanticProfileKey: node.semanticProfileKey,
	      semanticProfileVersion: node.semanticProfileVersion,
	      semanticPayloadJson: node.semanticPayloadJson,
	      taskUiJson: node.taskUiJson ?? null,
	      processContainerJson: node.processContainerJson ?? null,
	      containerNodeKey: node.containerNodeKey ? keyMap.get(node.containerNodeKey) ?? null : null,
	      erRefs: node.erRefs ?? [],
      position: {
        x: position.x + 24 + node.position.x,
        y: position.y + 46 + node.position.y,
      },
	      size: node.size,
	      inputSummary: node.inputSummary,
	      outputSummary: node.outputSummary,
	      isOverridden: false,
	      styleJson: node.styleJson,
	      propertiesJson: node.propertiesJson,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  const edges: BusinessFlowEdgeRecord[] = found.version.edges.flatMap((edge) => {
    const sourceNodeKey = keyMap.get(edge.sourceNodeKey)
    const targetNodeKey = keyMap.get(edge.targetNodeKey)
    if (!sourceNodeKey || !targetNodeKey) return []
    return [
      {
        kind: 'BUSINESS_FLOW_EDGE',
        businessFlowId,
        edgeId: createLocalId('bfe'),
        edgeKey: `${laneKey}_${edge.edgeKey}`,
	        laneInstanceId,
	        edgeType: edge.edgeType,
	        bpmnFlowType: edge.bpmnFlowType ?? null,
	        bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind ?? null,
	        bpmnMessageName: edge.bpmnMessageName ?? null,
	        bpmnConditionExpression: edge.bpmnConditionExpression ?? null,
	        label: edge.label,
	        conditionText: edge.conditionText,
	        dataContract: edge.dataContractJson as BusinessFlowEdgeRecord['dataContract'],
	        semanticProfileKey: edge.semanticProfileKey,
	        semanticProfileVersion: edge.semanticProfileVersion,
	        semanticPayloadJson: edge.semanticPayloadJson,
        isCrossLane: false,
        sourceType: 'NODE',
        sourceNodeKey,
        sourceLaneInstanceKey: null,
        sourcePort: edge.sourcePort,
        targetType: 'NODE',
        targetNodeKey,
        targetLaneInstanceKey: null,
        targetPort: edge.targetPort,
        originComponentEdgeKey: edge.edgeKey,
        isOverridden: false,
        styleJson: edge.styleJson,
        propertiesJson: edge.propertiesJson,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
  })
  const next = saveBusinessFlowCanvas({
    ...canvas,
    laneInstances: [...canvas.laneInstances, lane],
    nodes: [...canvas.nodes, ...nodes],
    edges: [...canvas.edges, ...edges],
  })
  return { canvas: next, laneInstance: lane, nodes, edges }
}

function computeLaneSize(nodes: SwimlaneComponentNode[]): CanvasSize {
  if (nodes.length === 0) return DEFAULT_LANE_SIZE
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.size.width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.size.height))
  return {
    width: Math.max(DEFAULT_LANE_SIZE.width, maxX + 56),
    height: Math.max(DEFAULT_LANE_SIZE.height, maxY + 96),
  }
}

export function newComponentNodeDraft(
  nodeTypeOrProfile: BusinessFlowNodeType | BpmnNodeProfile,
  position: CanvasPosition,
): ComponentEditorNodeDraft {
  const bpmnProfile = normalizeBpmnNodeProfile(
    typeof nodeTypeOrProfile === 'string'
      ? { nodeType: nodeTypeOrProfile }
      : nodeTypeOrProfile,
  )
  const nodeType = legacyNodeTypeForBpmn(bpmnProfile)
  return {
    nodeKey: createLocalId('cmp_node'),
    nodeType,
    ...bpmnProfile,
    title: bpmnNodeTitle(bpmnProfile),
    description: null,
    actor: null,
    businessRule: null,
    inputSummary: null,
    outputSummary: null,
    semanticProfileKey: null,
    semanticProfileVersion: null,
    semanticPayloadJson: {},
    taskUiJson: null,
    processContainerJson: bpmnProfile.bpmnElementType === 'SUB_PROCESS' &&
      bpmnProfile.bpmnSubProcessKind === 'EMBEDDED'
      ? { containerMode: 'embedded', calledProcessRef: null, calledProcessVersion: null }
      : null,
    containerNodeKey: null,
    erRefs: [],
    position,
    size: bpmnNodeSize(bpmnProfile),
    styleJson: null,
    propertiesJson: mergeBpmnIntoProperties(null, bpmnProfile),
  }
}
