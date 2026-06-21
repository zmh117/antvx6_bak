import * as Y from 'yjs'

function asObject(value) {
  if (!value) return {}
  if (value instanceof Y.Map) return Object.fromEntries(value.entries())
  return typeof value === 'object' ? { ...value } : {}
}

function setMapObject(rootMap, key, value) {
  const child = new Y.Map()
  Object.entries(value).forEach(([k, v]) => {
    if (v !== undefined) child.set(k, v)
  })
  rootMap.set(key, child)
}

function clearYMap(map) {
  Array.from(map.keys()).forEach((key) => map.delete(key))
}

function jsonValue(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function businessFlowRefSignature(ref) {
  return `${ref.er_diagram_id || ref.erDiagramId || ''}:${ref.er_table_key || ref.erTableKey || ''}:${ref.er_column_key || ref.erColumnKey || ''}`
}

export function businessFlowErRefKey(nodeKey, ref) {
  return ref.id || `${nodeKey}:${businessFlowRefSignature(ref)}`
}

export function seedBusinessFlowDocFromRows(doc, rows, collabRevision = null) {
  const lanes = doc.getMap('lanes')
  const nodes = doc.getMap('nodes')
  const edges = doc.getMap('edges')
  const erRefs = doc.getMap('erRefs')
  const meta = doc.getMap('meta')

  doc.transact(() => {
    clearYMap(lanes)
    clearYMap(nodes)
    clearYMap(edges)
    clearYMap(erRefs)
    meta.set('schemaVersion', 1)
    meta.set('documentType', 'BUSINESS_FLOW')
    meta.set('businessFlowId', rows.businessFlowId)
    if (collabRevision) meta.set('collabRevision', collabRevision)
    meta.set('updatedAt', new Date().toISOString())

    for (const lane of rows.lanes) {
      setMapObject(lanes, lane.instance_key, {
        id: lane.id,
        instance_key: lane.instance_key,
        component_id: lane.component_id,
        component_version_id: lane.component_version_id,
        component_name: lane.component_name || lane.display_name,
        component_version_no: lane.component_version_no || 1,
        display_name: lane.display_name,
        owner_role: lane.owner_role,
        position_x: numberValue(lane.position_x),
        position_y: numberValue(lane.position_y),
        width: numberValue(lane.width, 360),
        height: numberValue(lane.height, 360),
        z_index: numberValue(lane.z_index),
        layout_json: jsonValue(lane.layout_json),
        override_json: jsonValue(lane.override_json),
      })
    }

    for (const node of rows.nodes) {
      setMapObject(nodes, node.node_key, {
        id: node.id,
        lane_instance_id: node.lane_instance_id,
        lane_instance_key: node.lane_instance_key,
        node_key: node.node_key,
        origin_component_node_key: node.origin_component_node_key,
        node_type: node.node_type || 'TASK',
        title: node.title || '任务',
        description: node.description,
        actor: node.actor,
        business_rule: node.business_rule,
        input_summary: node.input_summary,
        output_summary: node.output_summary,
        position_x: numberValue(node.position_x),
        position_y: numberValue(node.position_y),
        width: numberValue(node.width, 120),
        height: numberValue(node.height, 60),
        is_overridden: Boolean(node.is_overridden),
        style_json: jsonValue(node.style_json),
        properties_json: jsonValue(node.properties_json),
      })
      for (const ref of node.er_refs || []) {
        setMapObject(erRefs, businessFlowErRefKey(node.node_key, ref), {
          id: ref.id,
          node_key: node.node_key,
          er_diagram_id: ref.er_diagram_id,
          er_table_key: ref.er_table_key,
          er_column_key: ref.er_column_key,
          ref_type: ref.ref_type || 'READ',
          description: ref.description,
        })
      }
    }

    for (const edge of rows.edges) {
      setMapObject(edges, edge.edge_key, {
        id: edge.id,
        lane_instance_id: edge.lane_instance_id,
        lane_instance_key: edge.lane_instance_key,
        edge_key: edge.edge_key,
        source_type: edge.source_type || 'NODE',
        source_node_key: edge.source_node_key,
        source_lane_instance_key: edge.source_lane_instance_key,
        source_port: edge.source_port,
        target_type: edge.target_type || 'NODE',
        target_node_key: edge.target_node_key,
        target_lane_instance_key: edge.target_lane_instance_key,
        target_port: edge.target_port,
        edge_type: edge.edge_type || 'SEQUENCE',
        label: edge.label,
        condition_text: edge.condition_text,
        data_contract_json: jsonValue(edge.data_contract_json),
        origin_component_edge_key: edge.origin_component_edge_key,
        is_overridden: Boolean(edge.is_overridden),
        style_json: jsonValue(edge.style_json),
        properties_json: jsonValue(edge.properties_json),
      })
    }
  }, 'seed')
}

export function businessFlowProjectionFromDoc(doc) {
  const lanesMap = doc.getMap('lanes')
  const nodesMap = doc.getMap('nodes')
  const edgesMap = doc.getMap('edges')
  const erRefsMap = doc.getMap('erRefs')
  const metaMap = doc.getMap('meta')
  const businessFlowId = String(metaMap.get('businessFlowId') || '')

  const refsByNodeKey = new Map()
  for (const value of erRefsMap.values()) {
    const ref = asObject(value)
    const nodeKey = String(ref.node_key || ref.nodeKey || '')
    if (!nodeKey) continue
    const refs = refsByNodeKey.get(nodeKey) || []
    refs.push({
      id: ref.id || undefined,
      er_diagram_id: ref.er_diagram_id || ref.erDiagramId,
      er_table_key: ref.er_table_key || ref.erTableKey,
      er_column_key: ref.er_column_key || ref.erColumnKey || null,
      ref_type: ref.ref_type || ref.refType || 'READ',
      description: ref.description || null,
    })
    refsByNodeKey.set(nodeKey, refs)
  }

  const lane_instances = Array.from(lanesMap.values()).map((value) => {
    const lane = asObject(value)
    return {
      id: lane.id,
      instance_key: lane.instance_key || lane.instanceKey,
      component_id: lane.component_id || lane.componentId,
      component_version_id: lane.component_version_id || lane.componentVersionId,
      component_name: lane.component_name || lane.componentName || lane.display_name || lane.displayName,
      component_version_no: numberValue(lane.component_version_no || lane.componentVersionNo, 1),
      display_name: lane.display_name || lane.displayName || '',
      owner_role: lane.owner_role || lane.ownerRole || null,
      position_x: numberValue(lane.position_x ?? lane.x),
      position_y: numberValue(lane.position_y ?? lane.y),
      width: numberValue(lane.width, 360),
      height: numberValue(lane.height, 360),
      z_index: numberValue(lane.z_index || lane.zIndex),
      layout_json: jsonValue(lane.layout_json || lane.layoutJson),
      override_json: jsonValue(lane.override_json || lane.overrideJson),
    }
  }).sort((a, b) => a.z_index - b.z_index || String(a.instance_key).localeCompare(String(b.instance_key)))

  const laneKeyById = new Map(
    lane_instances
      .filter((lane) => lane.id && lane.instance_key)
      .map((lane) => [String(lane.id), String(lane.instance_key)]),
  )

  const nodes = Array.from(nodesMap.values()).map((value) => {
    const node = asObject(value)
    const nodeKey = String(node.node_key || node.nodeKey || '')
    return {
      id: node.id,
      lane_instance_id: node.lane_instance_id || node.laneInstanceId || null,
      lane_instance_key:
        node.lane_instance_key ||
        node.laneInstanceKey ||
        laneKeyById.get(String(node.lane_instance_id || node.laneInstanceId || '')) ||
        null,
      node_key: nodeKey,
      origin_component_node_key: node.origin_component_node_key || node.originComponentNodeKey || null,
      node_type: node.node_type || node.nodeType || 'TASK',
      title: node.title || '任务',
      description: node.description || null,
      actor: node.actor || null,
      business_rule: node.business_rule || node.businessRule || null,
      input_summary: node.input_summary || node.inputSummary || null,
      output_summary: node.output_summary || node.outputSummary || null,
      position_x: numberValue(node.position_x ?? node.x),
      position_y: numberValue(node.position_y ?? node.y),
      width: numberValue(node.width, 120),
      height: numberValue(node.height, 60),
      is_overridden: Boolean(node.is_overridden ?? node.isOverridden),
      style_json: jsonValue(node.style_json || node.styleJson),
      properties_json: jsonValue(node.properties_json || node.propertiesJson),
      er_refs: refsByNodeKey.get(nodeKey) || [],
    }
  }).sort((a, b) => String(a.node_key).localeCompare(String(b.node_key)))

  const edges = Array.from(edgesMap.values()).map((value) => {
    const edge = asObject(value)
    return {
      id: edge.id,
      lane_instance_id: edge.lane_instance_id || edge.laneInstanceId || null,
      lane_instance_key: edge.lane_instance_key || edge.laneInstanceKey || null,
      edge_key: edge.edge_key || edge.edgeKey,
      source_type: edge.source_type || edge.sourceType || 'NODE',
      source_node_key: edge.source_node_key || edge.sourceNodeKey || null,
      source_lane_instance_key: edge.source_lane_instance_key || edge.sourceLaneInstanceKey || null,
      source_port: edge.source_port || edge.sourcePort || null,
      target_type: edge.target_type || edge.targetType || 'NODE',
      target_node_key: edge.target_node_key || edge.targetNodeKey || null,
      target_lane_instance_key: edge.target_lane_instance_key || edge.targetLaneInstanceKey || null,
      target_port: edge.target_port || edge.targetPort || null,
      edge_type: edge.edge_type || edge.edgeType || 'SEQUENCE',
      label: edge.label || null,
      condition_text: edge.condition_text || edge.conditionText || null,
      data_contract_json: jsonValue(edge.data_contract_json || edge.dataContractJson),
      origin_component_edge_key: edge.origin_component_edge_key || edge.originComponentEdgeKey || null,
      is_overridden: Boolean(edge.is_overridden ?? edge.isOverridden),
      style_json: jsonValue(edge.style_json || edge.styleJson),
      properties_json: jsonValue(edge.properties_json || edge.propertiesJson),
    }
  }).sort((a, b) => String(a.edge_key).localeCompare(String(b.edge_key)))

  return {
    business_flow_id: businessFlowId,
    lane_instances,
    nodes,
    edges,
  }
}
