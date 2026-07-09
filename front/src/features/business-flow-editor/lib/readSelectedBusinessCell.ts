import type { Cell, Edge } from '@antv/x6'

import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BusinessFlowNodeErRef,
  ProcessContainerConfig,
  TaskUiContext,
} from '@/entities/business-flow'
import {
  normalizeTaskUiContext,
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
} from '@/entities/business-flow'
import { readCellData } from '@/features/business-flow/infrastructure/x6/businessFlowX6'

export type ErGraphOption = { id: string; name: string }

export type SelectedBusinessCell =
  | { kind: 'lane'; cell: Cell; displayName: string; ownerRole: string }
  | {
      kind: 'node'
      cell: Cell
      title: string
      description: string
      actor: string
      businessRule: string
      inputSummary: string
      outputSummary: string
      semanticProfileKey: string
      semanticProfileVersion: number | null
      semanticPayloadJson: Record<string, unknown>
      taskUiJson: TaskUiContext | null
      processContainerJson: ProcessContainerConfig | null
      containerNodeKey: string | null
      bpmnProfile: BpmnNodeProfile
      erRefs: BusinessFlowNodeErRef[]
    }
  | {
      kind: 'edge'
      cell: Edge
      label: string
      semanticProfileKey: string
      semanticProfileVersion: number | null
      semanticPayloadJson: Record<string, unknown>
      bpmnProfile: BpmnEdgeProfile
    }
  | null

export function readSelectedBusinessCell(cell: Cell): SelectedBusinessCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    const bpmnProfile = normalizeBpmnEdgeProfile({
      edgeType: data.edgeType,
      bpmnFlowType: data.bpmnFlowType,
      bpmnSequenceFlowKind: data.bpmnSequenceFlowKind,
      bpmnMessageName: data.bpmnMessageName,
      bpmnConditionExpression: data.bpmnConditionExpression,
      propertiesJson: data.propertiesJson,
    })
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
      semanticProfileKey: data.semanticProfileKey ?? '',
      semanticProfileVersion: data.semanticProfileVersion ?? null,
      semanticPayloadJson: data.semanticPayloadJson ?? {},
      bpmnProfile,
    }
  }
  if (data.cellRole === 'LANE_INSTANCE') {
    return {
      kind: 'lane',
      cell,
      displayName: String(cell.attr('label/text') ?? data.title ?? ''),
      ownerRole: String(cell.attr('owner/text') ?? ''),
    }
  }
  if (data.cellRole === 'FLOW_NODE') {
    const bpmnProfile = normalizeBpmnNodeProfile({
      nodeType: data.nodeType,
      bpmnElementType: data.bpmnElementType,
      bpmnEventKind: data.bpmnEventKind,
      bpmnEventDefinition: data.bpmnEventDefinition,
      bpmnTaskType: data.bpmnTaskType,
      bpmnGatewayType: data.bpmnGatewayType,
      bpmnSubProcessKind: data.bpmnSubProcessKind,
      bpmnCallActivityRef: data.bpmnCallActivityRef,
      propertiesJson: data.propertiesJson,
    })
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      description: data.description ?? '',
      actor: data.actor ?? '',
      businessRule: data.businessRule ?? '',
      inputSummary: data.inputSummary ?? '',
      outputSummary: data.outputSummary ?? '',
      semanticProfileKey: data.semanticProfileKey ?? '',
      semanticProfileVersion: data.semanticProfileVersion ?? null,
      semanticPayloadJson: data.semanticPayloadJson ?? {},
      taskUiJson: bpmnProfile.bpmnElementType === 'TASK'
        ? normalizeTaskUiContext(data.taskUiJson, { taskName: data.title ?? String(cell.attr('label/text') ?? '') })
        : data.taskUiJson ?? null,
      processContainerJson: data.processContainerJson ?? null,
      containerNodeKey: data.containerNodeKey ?? null,
      bpmnProfile,
      erRefs: data.erRefs ?? [],
    }
  }
  return null
}
