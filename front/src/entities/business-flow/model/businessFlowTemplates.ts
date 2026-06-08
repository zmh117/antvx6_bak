import type {
  BusinessFlowEdge,
  BusinessFlowNode,
  BusinessFlowSaveBody,
} from './businessFlowSchema'

export type BusinessFlowTemplateKey = 'blank' | 'leave_request_bpmn'

export type BusinessFlowTemplate = {
  key: BusinessFlowTemplateKey
  label: string
  description: string
  createBody: (meta: { name: string; description?: string | null }) => BusinessFlowSaveBody
}

const leaveRequestNodes: BusinessFlowNode[] = [
  {
    id: 'lane-employee',
    type: 'lane',
    label: '员工',
    position: { x: 60, y: 60 },
    size: { width: 240, height: 600 },
  },
  {
    id: 'lane-system',
    type: 'lane',
    label: '系统',
    position: { x: 320, y: 60 },
    size: { width: 240, height: 600 },
  },
  {
    id: 'lane-leader',
    type: 'lane',
    label: '直属领导',
    position: { x: 580, y: 60 },
    size: { width: 240, height: 600 },
  },
  {
    id: 'start',
    type: 'start_event',
    label: '开始',
    position: { x: 160, y: 100 },
    size: { width: 40, height: 40 },
    lane_id: 'lane-employee',
  },
  {
    id: 'apply',
    type: 'activity',
    label: '提交请假申请',
    position: { x: 120, y: 190 },
    size: { width: 120, height: 60 },
    lane_id: 'lane-employee',
  },
  {
    id: 'check',
    type: 'activity',
    label: '自动校验',
    position: { x: 380, y: 110 },
    size: { width: 120, height: 60 },
    lane_id: 'lane-system',
  },
  {
    id: 'approve',
    type: 'activity',
    label: '领导审批',
    position: { x: 640, y: 110 },
    size: { width: 120, height: 60 },
    lane_id: 'lane-leader',
  },
  {
    id: 'exgw',
    type: 'exclusive_gateway',
    label: '审批分支',
    position: { x: 680, y: 260 },
    size: { width: 44, height: 44 },
    lane_id: 'lane-leader',
  },
  {
    id: 'subproc',
    type: 'subprocess',
    label: '补充资料',
    details: '1、病例证明（如有）\n2、工作 backup',
    position: { x: 100, y: 330 },
    size: { width: 160, height: 70 },
    lane_id: 'lane-employee',
  },
  {
    id: 'record',
    type: 'activity',
    label: '备案与系统更新',
    position: { x: 380, y: 330 },
    size: { width: 140, height: 60 },
    lane_id: 'lane-system',
  },
  {
    id: 'pgw1',
    type: 'parallel_gateway',
    label: '并行通知',
    position: { x: 430, y: 480 },
    size: { width: 44, height: 44 },
    lane_id: 'lane-system',
  },
  {
    id: 'notify-hr',
    type: 'activity',
    label: '通知 HR',
    position: { x: 390, y: 560 },
    size: { width: 120, height: 60 },
    lane_id: 'lane-system',
  },
  {
    id: 'confirm',
    type: 'activity',
    label: '确认请假安排',
    position: { x: 120, y: 520 },
    size: { width: 120, height: 60 },
    lane_id: 'lane-employee',
  },
  {
    id: 'pgw2',
    type: 'parallel_gateway',
    label: '结束汇聚',
    position: { x: 160, y: 650 },
    size: { width: 44, height: 44 },
    lane_id: 'lane-employee',
  },
  {
    id: 'end',
    type: 'end_event',
    label: '结束',
    position: { x: 160, y: 720 },
    size: { width: 44, height: 44 },
    lane_id: 'lane-employee',
  },
]

const leaveRequestEdges: BusinessFlowEdge[] = [
  { id: 'edge-start-apply', source: 'start', target: 'apply' },
  { id: 'edge-apply-check', source: 'apply', target: 'check', dashed: true },
  { id: 'edge-check-approve', source: 'check', target: 'approve', dashed: true },
  { id: 'edge-approve-exgw', source: 'approve', target: 'exgw' },
  { id: 'edge-exgw-subproc', source: 'exgw', target: 'subproc', label: '资料不齐', dashed: true },
  { id: 'edge-subproc-record', source: 'subproc', target: 'record', label: '补充完成', dashed: true },
  { id: 'edge-exgw-record', source: 'exgw', target: 'record', label: '审批通过', dashed: true },
  { id: 'edge-record-pgw1', source: 'record', target: 'pgw1' },
  { id: 'edge-pgw1-notify', source: 'pgw1', target: 'notify-hr' },
  { id: 'edge-pgw1-confirm', source: 'pgw1', target: 'confirm', dashed: true },
  { id: 'edge-confirm-pgw2', source: 'confirm', target: 'pgw2' },
  { id: 'edge-pgw2-end', source: 'pgw2', target: 'end' },
]

export const BUSINESS_FLOW_TEMPLATES: BusinessFlowTemplate[] = [
  {
    key: 'blank',
    label: '空白业务图',
    description: '创建空画布，自行添加泳道、任务、网关和连线。',
    createBody: (meta) => ({
      name: meta.name,
      description: meta.description || null,
      nodes: [],
      edges: [],
      bindings: [],
    }),
  },
  {
    key: 'leave_request_bpmn',
    label: '请假 BPMN 模板',
    description: '复用 X6 官网 BPMN 示例结构，创建后可继续编辑和绑定 ER 元素。',
    createBody: (meta) => ({
      name: meta.name,
      description: meta.description || '员工请假审批业务流程模板',
      nodes: leaveRequestNodes,
      edges: leaveRequestEdges,
      bindings: [],
    }),
  },
]

export function getBusinessFlowTemplate(key: BusinessFlowTemplateKey) {
  return BUSINESS_FLOW_TEMPLATES.find((template) => template.key === key) ?? BUSINESS_FLOW_TEMPLATES[0]
}

