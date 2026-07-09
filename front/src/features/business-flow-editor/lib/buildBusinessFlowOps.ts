import type {
  BusinessFlowChangeOpBody,
  BusinessFlowEdgeRecord,
  BusinessFlowNodeErRef,
  BusinessFlowNodeRecord,
  LocalBusinessFlowCanvas,
} from '@/entities/business-flow'
import {
  bpmnSemanticDisplayName,
  edgeSemanticType,
  isDataBpmnElement,
  nodeSemanticType,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
  normalizeBpmnSemantic,
  normalizeTaskUiContext,
  taskUiTaskName,
} from '@/entities/business-flow'
import type { flowDraftFromGraph } from '@/features/business-flow/infrastructure/x6/businessFlowX6'

type FlowDraft = ReturnType<typeof flowDraftFromGraph>

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null)
}

function laneKeyForNode(draft: FlowDraft, node: BusinessFlowNodeRecord) {
  return draft.laneInstances.find(
    (lane) => lane.laneInstanceId === node.laneInstanceId,
  )?.instanceKey
}

function edgePatch(edge: BusinessFlowEdgeRecord): Record<string, unknown> {
  const profile = normalizeBpmnEdgeProfile(edge)
  const bpmnSemanticJson = normalizeBpmnSemantic(
    edge.bpmnSemanticJson,
    edgeSemanticType(profile),
    edge.label ?? '',
  )
  return {
    sourceNodeKey: edge.sourceNodeKey,
    targetNodeKey: edge.targetNodeKey,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    edgeType: edge.edgeType,
    bpmnFlowType: edge.bpmnFlowType,
    bpmnSequenceFlowKind: edge.bpmnSequenceFlowKind,
    bpmnMessageName: edge.bpmnMessageName,
    bpmnConditionExpression: edge.bpmnConditionExpression,
    label: bpmnSemanticDisplayName(bpmnSemanticJson, edge.label ?? ''),
    conditionText: edge.conditionText,
    dataContractJson: edge.dataContract ?? {},
    semanticProfileKey: edge.semanticProfileKey ?? null,
    semanticProfileVersion: edge.semanticProfileVersion ?? null,
    semanticPayloadJson: edge.semanticPayloadJson ?? {},
    bpmnSemanticJson,
    styleJson: edge.styleJson ?? {},
    propertiesJson: edge.propertiesJson ?? {},
  }
}

function nodePatch(
  draft: FlowDraft,
  node: BusinessFlowNodeRecord,
): Record<string, unknown> {
  const isTask = node.bpmnElementType === 'TASK'
  const profile = normalizeBpmnNodeProfile(node)
  const semanticType = nodeSemanticType(profile)
  const bpmnSemanticJson = semanticType
    ? normalizeBpmnSemantic(node.bpmnSemanticJson, semanticType, node.title)
    : null
  const taskUiJson = isTask ? normalizeTaskUiContext(node.taskUiJson, { taskName: node.title }) : node.taskUiJson ?? {}
  const title = isTask
    ? taskUiTaskName(taskUiJson, node.title)
    : bpmnSemanticDisplayName(bpmnSemanticJson, node.title)
  return {
    laneInstanceKey: laneKeyForNode(draft, node),
    nodeType: node.nodeType,
    bpmnElementType: node.bpmnElementType,
    bpmnEventKind: node.bpmnEventKind,
    bpmnEventDefinition: node.bpmnEventDefinition,
    bpmnTaskType: node.bpmnTaskType,
    bpmnGatewayType: node.bpmnGatewayType,
    bpmnSubProcessKind: node.bpmnSubProcessKind,
    bpmnCallActivityRef: node.bpmnCallActivityRef,
    title,
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    description: null,
    actor: null,
    businessRule: null,
    inputSummary: null,
    outputSummary: null,
    semanticProfileKey: node.semanticProfileKey ?? null,
    semanticProfileVersion: node.semanticProfileVersion ?? null,
    semanticPayloadJson: node.semanticPayloadJson ?? {},
    bpmnSemanticJson: bpmnSemanticJson ?? {},
    taskUiJson,
    processContainerJson: node.processContainerJson ?? {},
    containerNodeKey: node.containerNodeKey ?? null,
    styleJson: node.styleJson ?? {},
    propertiesJson: node.propertiesJson ?? {},
  }
}

function sameJson(left: unknown, right: unknown) {
  return stableJson(left ?? null) === stableJson(right ?? null)
}

function nodeBpmnChanged(prev: BusinessFlowNodeRecord, node: BusinessFlowNodeRecord) {
  return (
    prev.nodeType !== node.nodeType ||
    prev.bpmnElementType !== node.bpmnElementType ||
    prev.bpmnEventKind !== node.bpmnEventKind ||
    prev.bpmnEventDefinition !== node.bpmnEventDefinition ||
    prev.bpmnTaskType !== node.bpmnTaskType ||
    prev.bpmnGatewayType !== node.bpmnGatewayType ||
    prev.bpmnSubProcessKind !== node.bpmnSubProcessKind ||
    (prev.bpmnCallActivityRef ?? '') !== (node.bpmnCallActivityRef ?? '')
  )
}

function edgeBpmnChanged(prev: BusinessFlowEdgeRecord, edge: BusinessFlowEdgeRecord) {
  return (
    prev.bpmnFlowType !== edge.bpmnFlowType ||
    prev.bpmnSequenceFlowKind !== edge.bpmnSequenceFlowKind ||
    (prev.bpmnMessageName ?? '') !== (edge.bpmnMessageName ?? '') ||
    (prev.bpmnConditionExpression ?? '') !==
      (edge.bpmnConditionExpression ?? '')
  )
}

function erRefSignature(ref: BusinessFlowNodeErRef) {
  return `${ref.erDiagramId}:${ref.erTableKey}:${ref.erColumnKey ?? ''}`
}

/** 对单个节点的 ER 绑定做增删改 diff，生成 ER_REF 变更操作。 */
function buildErRefOps(
  nodeKey: string,
  nodeTitle: string,
  prevRefs: BusinessFlowNodeErRef[],
  nextRefs: BusinessFlowNodeErRef[],
): BusinessFlowChangeOpBody[] {
  const ops: BusinessFlowChangeOpBody[] = []
  const nextById = new Map(
    nextRefs.filter((ref) => ref.id).map((ref) => [ref.id as string, ref]),
  )
  const prevSignatures = new Set(prevRefs.map(erRefSignature))

  prevRefs.forEach((ref) => {
    if (!ref.id) return
    const next = nextById.get(ref.id)
    if (!next) {
      ops.push({
        opType: 'REMOVE_NODE_ER_REF',
        targetType: 'ER_REF',
        targetKey: ref.id,
        patch: { nodeKey, title: nodeTitle },
        summary: `移除 ER 绑定：${nodeTitle}`,
      })
      return
    }
    if (
      next.refType !== ref.refType ||
      (next.description ?? '') !== (ref.description ?? '')
    ) {
      ops.push({
        opType: 'UPDATE_NODE_ER_REF',
        targetType: 'ER_REF',
        targetKey: ref.id,
        patch: {
          refType: next.refType,
          description: next.description ?? null,
        },
        summary: `更新 ER 绑定：${nodeTitle}`,
      })
    }
  })

  nextRefs.forEach((ref) => {
    if (ref.id) return
    if (prevSignatures.has(erRefSignature(ref))) return
    ops.push({
      opType: 'ADD_NODE_ER_REF',
      targetType: 'ER_REF',
      targetKey: nodeKey,
      patch: {
        nodeKey,
        erDiagramId: ref.erDiagramId,
        erTableKey: ref.erTableKey,
        erColumnKey: ref.erColumnKey ?? null,
        refType: ref.refType,
        description: ref.description ?? null,
      },
      summary: `新增 ER 绑定：${nodeTitle}`,
    })
  })

  return ops
}

export function buildBusinessFlowOps(
  previous: LocalBusinessFlowCanvas,
  draft: FlowDraft,
): BusinessFlowChangeOpBody[] {
  const ops: BusinessFlowChangeOpBody[] = []
  const prevLanes = new Map(
    previous.laneInstances.map((lane) => [lane.instanceKey, lane]),
  )
  const nextLanes = new Map(
    draft.laneInstances.map((lane) => [lane.instanceKey, lane]),
  )
  nextLanes.forEach((lane, key) => {
    const prev = prevLanes.get(key)
    if (!prev) return
    if (
      prev.position.x !== lane.position.x ||
      prev.position.y !== lane.position.y ||
      prev.size.width !== lane.size.width ||
      prev.size.height !== lane.size.height ||
      stableJson(prev.layoutJson ?? null) !== stableJson(lane.layoutJson ?? null)
    ) {
      ops.push({
        opType: 'MOVE_LANE_INSTANCE',
        targetType: 'LANE_INSTANCE',
        targetKey: key,
        patch: {
          to: {
            x: lane.position.x,
            y: lane.position.y,
            width: lane.size.width,
            height: lane.size.height,
          },
          layoutJson: lane.layoutJson ?? null,
        },
        summary: `移动泳道：${lane.displayName}`,
      })
    }
    if (
      prev.displayName !== lane.displayName ||
      (prev.ownerRole ?? '') !== (lane.ownerRole ?? '')
    ) {
      ops.push({
        opType: 'RENAME_LANE_INSTANCE',
        targetType: 'LANE_INSTANCE',
        targetKey: key,
        patch: {
          displayName: lane.displayName,
          ownerRole: lane.ownerRole ?? null,
        },
        summary: `更新泳道：${lane.displayName}`,
      })
    }
  })

  const prevNodes = new Map(previous.nodes.map((node) => [node.nodeKey, node]))
  const nextNodes = new Map(draft.nodes.map((node) => [node.nodeKey, node]))
  prevNodes.forEach((node, key) => {
    if (!nextNodes.has(key)) {
      ops.push({
        opType: 'REMOVE_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch: { title: node.title },
        summary: `删除节点：${node.title}`,
      })
    }
  })
  nextNodes.forEach((node, key) => {
    const prev = prevNodes.get(key)
    if (!prev) {
      ops.push({
        opType: 'ADD_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch: nodePatch(draft, node),
        summary: `新增节点：${node.title}`,
      })
      ops.push(...buildErRefOps(
        key,
        node.title,
        [],
        isDataBpmnElement(node.bpmnElementType) ? node.erRefs ?? [] : [],
      ))
      return
    }
    const patch: Record<string, unknown> = {}
    if (
      prev.position.x !== node.position.x ||
      prev.position.y !== node.position.y ||
      prev.size.width !== node.size.width ||
      prev.size.height !== node.size.height
    ) {
      patch.to = {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }
    }
    if (prev.title !== node.title) patch.title = node.title
    if ((prev.description ?? '') !== (node.description ?? ''))
      patch.description = node.description ?? null
    if ((prev.actor ?? '') !== (node.actor ?? ''))
      patch.actor = node.actor ?? null
    if ((prev.businessRule ?? '') !== (node.businessRule ?? ''))
      patch.businessRule = node.businessRule ?? null
    if ((prev.inputSummary ?? '') !== (node.inputSummary ?? ''))
      patch.inputSummary = node.inputSummary ?? null
    if ((prev.outputSummary ?? '') !== (node.outputSummary ?? ''))
      patch.outputSummary = node.outputSummary ?? null
    if ((prev.semanticProfileKey ?? '') !== (node.semanticProfileKey ?? ''))
      patch.semanticProfileKey = node.semanticProfileKey ?? null
    if ((prev.semanticProfileVersion ?? null) !== (node.semanticProfileVersion ?? null))
      patch.semanticProfileVersion = node.semanticProfileVersion ?? null
    if (!sameJson(prev.semanticPayloadJson, node.semanticPayloadJson))
      patch.semanticPayloadJson = node.semanticPayloadJson ?? {}
    if (!sameJson(prev.bpmnSemanticJson, node.bpmnSemanticJson))
      patch.bpmnSemanticJson = node.bpmnSemanticJson ?? {}
    if (!sameJson(prev.taskUiJson, node.taskUiJson))
      patch.taskUiJson = node.taskUiJson ?? {}
    if (!sameJson(prev.processContainerJson, node.processContainerJson))
      patch.processContainerJson = node.processContainerJson ?? {}
    if ((prev.containerNodeKey ?? '') !== (node.containerNodeKey ?? ''))
      patch.containerNodeKey = node.containerNodeKey ?? null
    if (nodeBpmnChanged(prev, node)) {
      Object.assign(patch, {
        nodeType: node.nodeType,
        bpmnElementType: node.bpmnElementType,
        bpmnEventKind: node.bpmnEventKind,
        bpmnEventDefinition: node.bpmnEventDefinition,
        bpmnTaskType: node.bpmnTaskType,
        bpmnGatewayType: node.bpmnGatewayType,
        bpmnSubProcessKind: node.bpmnSubProcessKind,
        bpmnCallActivityRef: node.bpmnCallActivityRef,
      })
    }
    if (!sameJson(prev.styleJson, node.styleJson))
      patch.styleJson = node.styleJson ?? {}
    if (!sameJson(prev.propertiesJson, node.propertiesJson))
      patch.propertiesJson = node.propertiesJson ?? {}
    if (Object.keys(patch).length > 0) {
      ops.push({
        opType: 'UPDATE_NODE',
        targetType: 'NODE',
        targetKey: key,
        patch,
        summary: `更新节点：${node.title}`,
      })
    }
    ops.push(
      ...buildErRefOps(
        key,
        node.title,
        isDataBpmnElement(prev.bpmnElementType) ? prev.erRefs ?? [] : [],
        isDataBpmnElement(node.bpmnElementType) ? node.erRefs ?? [] : [],
      ),
    )
  })

  const prevEdges = new Map(previous.edges.map((edge) => [edge.edgeKey, edge]))
  const nextEdges = new Map(draft.edges.map((edge) => [edge.edgeKey, edge]))
  prevEdges.forEach((edge, key) => {
    if (!nextEdges.has(key)) {
      ops.push({
        opType: 'REMOVE_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: { label: edge.label },
        summary: `删除连线：${edge.label || key}`,
      })
    }
  })
  nextEdges.forEach((edge, key) => {
    const prev = prevEdges.get(key)
    if (!prev) {
      ops.push({
        opType: 'ADD_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: edgePatch(edge),
        summary: `新增连线：${edge.label || key}`,
      })
      return
    }
    if (
      prev.label !== edge.label ||
      prev.edgeType !== edge.edgeType ||
      edgeBpmnChanged(prev, edge) ||
      prev.sourceNodeKey !== edge.sourceNodeKey ||
      prev.targetNodeKey !== edge.targetNodeKey ||
      prev.sourcePort !== edge.sourcePort ||
      prev.targetPort !== edge.targetPort ||
      (prev.conditionText ?? '') !== (edge.conditionText ?? '') ||
      !sameJson(prev.dataContract, edge.dataContract) ||
      (prev.semanticProfileKey ?? '') !== (edge.semanticProfileKey ?? '') ||
      (prev.semanticProfileVersion ?? null) !== (edge.semanticProfileVersion ?? null) ||
      !sameJson(prev.semanticPayloadJson, edge.semanticPayloadJson) ||
      !sameJson(prev.bpmnSemanticJson, edge.bpmnSemanticJson) ||
      !sameJson(prev.styleJson, edge.styleJson) ||
      !sameJson(prev.propertiesJson, edge.propertiesJson)
    ) {
      ops.push({
        opType:
          prev.sourceNodeKey !== edge.sourceNodeKey ||
          prev.targetNodeKey !== edge.targetNodeKey
            ? 'ADD_EDGE'
            : 'UPDATE_EDGE',
        targetType: 'EDGE',
        targetKey: key,
        patch: edgePatch(edge),
        summary: `更新连线：${edge.label || key}`,
      })
    }
  })
  return ops
}

export function isLayoutOnlyBusinessFlowOps(ops: BusinessFlowChangeOpBody[]) {
  return ops.every((op) => {
    if (
      op.opType === 'MOVE_LANE_INSTANCE' ||
      op.opType === 'RESIZE_LANE_INSTANCE'
    )
      return true
    if (op.opType !== 'UPDATE_NODE') return false
    const patch = op.patch
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false
    return Object.keys(patch).every((key) => key === 'to')
  })
}
