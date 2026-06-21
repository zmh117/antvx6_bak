import pg from 'pg'
import * as Y from 'yjs'
import { config } from './config.js'
import { seedDocFromRows } from './graphProjection.js'
import { seedBusinessFlowDocFromRows } from './businessFlowProjection.js'

export const pool = new pg.Pool(config.database)

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 }

function maxRole(...roles) {
  return roles
    .filter(Boolean)
    .sort((a, b) => (ROLE_RANK[b] || 0) - (ROLE_RANK[a] || 0))[0] || null
}

function parseRevision(value) {
  return value ? Number(value) : null
}

function uuidPattern() {
  return '([0-9a-fA-F-]{36})'
}

export function parseCollabDocumentName(documentName) {
  const raw = String(documentName || '')
  const graphValue = raw.startsWith('graph:') ? raw.slice('graph:'.length) : raw
  const graphMatch = graphValue.match(new RegExp(`^${uuidPattern()}(?::r([0-9]+))?$`))
  if (graphMatch) {
    return {
      documentType: 'ER_GRAPH',
      ownerType: 'ER_GRAPH',
      ownerId: graphMatch[1],
      graphId: graphMatch[1],
      collabRevision: parseRevision(graphMatch[2]),
    }
  }

  const businessFlowMatch = raw.match(
    new RegExp(`^business-flow:${uuidPattern()}(?::r([0-9]+))?$`),
  )
  if (businessFlowMatch) {
    return {
      documentType: 'BUSINESS_FLOW',
      ownerType: 'BUSINESS_FLOW',
      ownerId: businessFlowMatch[1],
      businessFlowId: businessFlowMatch[1],
      collabRevision: parseRevision(businessFlowMatch[2]),
    }
  }

  throw new Error(`invalid collab document name: ${raw}`)
}

export function parseGraphDocumentName(documentName) {
  const ref = parseCollabDocumentName(documentName)
  if (ref.documentType !== 'ER_GRAPH') {
    throw new Error(`not an ER graph document: ${documentName}`)
  }
  return {
    graphId: ref.graphId,
    collabRevision: ref.collabRevision,
  }
}

export function parseGraphId(documentName) {
  const { graphId } = parseGraphDocumentName(documentName)
  return graphId
}

export async function isCurrentCollabRevision(ref, collabRevision = undefined) {
  const docRef =
    typeof ref === 'string'
      ? {
          documentType: 'ER_GRAPH',
          ownerType: 'ER_GRAPH',
          ownerId: ref,
          graphId: ref,
          collabRevision,
        }
      : ref
  const revision = docRef.collabRevision
  if (!Number.isInteger(revision) || revision < 1) return false

  if (docRef.documentType === 'BUSINESS_FLOW') {
    const { rows } = await pool.query(
      'SELECT collab_revision FROM business_flow WHERE id = $1 AND status <> $2',
      [docRef.businessFlowId, 'ARCHIVED'],
    )
    return Number(rows[0]?.collab_revision) === revision
  }

  const { rows } = await pool.query('SELECT collab_revision FROM er_graph WHERE id = $1', [docRef.graphId])
  return Number(rows[0]?.collab_revision) === revision
}

export async function getMembership(ref, userId) {
  const docRef =
    typeof ref === 'string'
      ? {
          documentType: 'ER_GRAPH',
          graphId: ref,
        }
      : ref

  if (docRef.documentType === 'BUSINESS_FLOW') {
    const { rows } = await pool.query(
      `
      SELECT bfm.role AS flow_role, pm.role AS product_role
      FROM business_flow bf
      LEFT JOIN business_flow_member bfm
        ON bfm.business_flow_id = bf.id AND bfm.user_id = $2
      LEFT JOIN product_member pm
        ON pm.product_id = bf.product_id AND pm.user_id = $2
      WHERE bf.id = $1 AND bf.status <> 'ARCHIVED'
      `,
      [docRef.businessFlowId, userId],
    )
    return maxRole(rows[0]?.flow_role, rows[0]?.product_role)
  }

  const { rows } = await pool.query(
    `
    SELECT role FROM er_graph_member
    WHERE graph_id = $1 AND user_id = $2
    `,
    [docRef.graphId, userId],
  )
  return rows[0]?.role || null
}

export async function loadYDoc(ref, collabRevision = undefined) {
  const docRef =
    typeof ref === 'string'
      ? {
          documentType: 'ER_GRAPH',
          ownerType: 'ER_GRAPH',
          ownerId: ref,
          graphId: ref,
          collabRevision,
        }
      : ref
  if (docRef.documentType === 'BUSINESS_FLOW') {
    return loadBusinessFlowYDoc(docRef)
  }
  return loadErYDoc(docRef.graphId, docRef.collabRevision)
}

async function loadErYDoc(graphId, collabRevision = null) {
  const doc = new Y.Doc()
  const { rows } = await pool.query('SELECT state FROM er_yjs_doc WHERE graph_id = $1', [graphId])
  if (rows[0]?.state) {
    Y.applyUpdate(doc, rows[0].state)
    return doc
  }
  const seedRows = await loadErSeedRows(graphId)
  seedDocFromRows(doc, seedRows, collabRevision)
  await storeErYDoc(graphId, doc)
  return doc
}

async function loadBusinessFlowYDoc(ref) {
  const doc = new Y.Doc()
  const { rows } = await pool.query(
    `
    SELECT ydoc_state
    FROM collab_document
    WHERE owner_type = 'BUSINESS_FLOW' AND owner_id = $1
    `,
    [ref.businessFlowId],
  )
  if (rows[0]?.ydoc_state?.byteLength) {
    Y.applyUpdate(doc, rows[0].ydoc_state)
    return doc
  }
  const seedRows = await loadBusinessFlowSeedRows(ref.businessFlowId)
  seedBusinessFlowDocFromRows(doc, seedRows, ref.collabRevision)
  await storeBusinessFlowYDoc(ref, doc)
  return doc
}

async function loadErSeedRows(graphId) {
  const [tables, columns, enums, relations] = await Promise.all([
    pool.query(
      `
      SELECT table_key, table_name, business_name, description, business_domain,
             table_type, importance, tags, comment, x, y, width, height, raw_data
      FROM er_table WHERE graph_id = $1 AND deleted_at IS NULL ORDER BY table_key
      `,
      [graphId],
    ),
    pool.query(
      `
      SELECT table_key, column_key, column_name, data_type, business_name, description,
             comment, default_value, key_type, column_role, enum_enabled, sort_order, tags, raw_data
      FROM er_column WHERE graph_id = $1 AND deleted_at IS NULL ORDER BY table_key, sort_order
      `,
      [graphId],
    ),
    pool.query(
      `
      SELECT table_key, column_key, value, label, description, sort_order
      FROM er_column_enum_value WHERE graph_id = $1 AND deleted_at IS NULL
      ORDER BY table_key, column_key, sort_order
      `,
      [graphId],
    ),
    pool.query(
      `
      SELECT relation_key, source_table_key, source_column_key, target_table_key, target_column_key,
             relation_type, relationship, relation_name, description, join_condition,
             confidence, source, verified, tags
      FROM er_relation WHERE graph_id = $1 AND deleted_at IS NULL ORDER BY relation_key
      `,
      [graphId],
    ),
  ])
  return {
    graphId,
    tables: tables.rows,
    columns: columns.rows.length
      ? columns.rows
      : tables.rows.flatMap((table) =>
          Array.isArray(table.raw_data?.fields)
            ? table.raw_data.fields.map((field, index) => ({
                table_key: table.table_key,
                column_key: field.name,
                column_name: field.name,
                data_type: field.type,
                business_name: field.businessName,
                description: field.description,
                comment: field.comment,
                default_value: field.defaultValue,
                key_type: field.keyType,
                column_role: field.columnRole,
                enum_enabled: Array.isArray(field.enumValues) && field.enumValues.length > 0,
                sort_order: index,
                tags: field.tags || [],
                raw_data: field,
              }))
            : [],
        ),
    enums: enums.rows,
    relations: relations.rows,
  }
}

async function loadBusinessFlowSeedRows(businessFlowId) {
  const [lanes, nodes, refs, edges] = await Promise.all([
    pool.query(
      `
      SELECT li.id, li.instance_key, li.component_id, li.component_version_id,
             sc.name AS component_name, scv.version_no AS component_version_no,
             li.display_name, li.owner_role, li.position_x, li.position_y,
             li.width, li.height, li.z_index, li.layout_json, li.override_json
      FROM business_flow_lane_instance li
      JOIN swimlane_component sc ON sc.id = li.component_id
      JOIN swimlane_component_version scv ON scv.id = li.component_version_id
      WHERE li.business_flow_id = $1 AND li.status = 'ACTIVE'
      ORDER BY li.z_index ASC, li.created_at ASC
      `,
      [businessFlowId],
    ),
    pool.query(
      `
      SELECT n.id, n.lane_instance_id, li.instance_key AS lane_instance_key,
             n.node_key, n.origin_component_node_key, n.node_type, n.title,
             n.description, n.actor, n.business_rule, n.input_summary, n.output_summary,
             n.position_x, n.position_y, n.width, n.height, n.is_overridden,
             n.style_json, n.properties_json
      FROM business_flow_node n
      LEFT JOIN business_flow_lane_instance li ON li.id = n.lane_instance_id
      WHERE n.business_flow_id = $1
      ORDER BY n.created_at ASC, n.node_key ASC
      `,
      [businessFlowId],
    ),
    pool.query(
      `
      SELECT r.id, n.node_key, r.er_diagram_id, r.er_table_key,
             r.er_column_key, r.ref_type, r.description
      FROM business_flow_node_er_ref r
      JOIN business_flow_node n ON n.id = r.business_flow_node_id
      WHERE r.business_flow_id = $1
      ORDER BY r.created_at ASC
      `,
      [businessFlowId],
    ),
    pool.query(
      `
      SELECT e.id, e.lane_instance_id, li.instance_key AS lane_instance_key,
             e.edge_key, e.source_type, sn.node_key AS source_node_key,
             sli.instance_key AS source_lane_instance_key, e.source_port,
             e.target_type, tn.node_key AS target_node_key,
             tli.instance_key AS target_lane_instance_key, e.target_port,
             e.edge_type, e.label, e.condition_text, e.data_contract_json,
             e.origin_component_edge_key, e.is_overridden, e.style_json, e.properties_json
      FROM business_flow_edge e
      LEFT JOIN business_flow_lane_instance li ON li.id = e.lane_instance_id
      LEFT JOIN business_flow_node sn ON sn.id = e.source_node_id
      LEFT JOIN business_flow_node tn ON tn.id = e.target_node_id
      LEFT JOIN business_flow_lane_instance sli ON sli.id = e.source_lane_instance_id
      LEFT JOIN business_flow_lane_instance tli ON tli.id = e.target_lane_instance_id
      WHERE e.business_flow_id = $1
      ORDER BY e.created_at ASC, e.edge_key ASC
      `,
      [businessFlowId],
    ),
  ])
  const refsByNodeKey = new Map()
  for (const ref of refs.rows) {
    const items = refsByNodeKey.get(ref.node_key) || []
    items.push(ref)
    refsByNodeKey.set(ref.node_key, items)
  }
  return {
    businessFlowId,
    lanes: lanes.rows,
    nodes: nodes.rows.map((node) => ({
      ...node,
      er_refs: refsByNodeKey.get(node.node_key) || [],
    })),
    edges: edges.rows,
  }
}

export async function storeYDoc(ref, doc) {
  if (typeof ref === 'string' || ref.documentType === 'ER_GRAPH') {
    const graphId = typeof ref === 'string' ? ref : ref.graphId
    return storeErYDoc(graphId, doc)
  }
  return storeBusinessFlowYDoc(ref, doc)
}

async function storeErYDoc(graphId, doc) {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc))
  const stateVector = Buffer.from(Y.encodeStateVector(doc))
  await pool.query(
    `
    INSERT INTO er_yjs_doc (graph_id, state, state_vector, version, updated_at)
    VALUES ($1, $2, $3, 1, NOW())
    ON CONFLICT (graph_id) DO UPDATE SET
      state = EXCLUDED.state,
      state_vector = EXCLUDED.state_vector,
      version = er_yjs_doc.version + 1,
      updated_at = NOW()
    `,
    [graphId, state, stateVector],
  )
}

async function storeBusinessFlowYDoc(ref, doc) {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc))
  await pool.query(
    `
    INSERT INTO collab_document (owner_type, owner_id, ydoc_state, server_version, updated_at)
    VALUES ('BUSINESS_FLOW', $1, $2, 1, NOW())
    ON CONFLICT (owner_type, owner_id) DO UPDATE SET
      ydoc_state = EXCLUDED.ydoc_state,
      server_version = collab_document.server_version + 1,
      updated_at = NOW()
    `,
    [ref.businessFlowId, state],
  )
}

export async function appendYUpdate(ref, update, context = {}, origin = null) {
  if (typeof ref === 'string' || ref.documentType === 'ER_GRAPH') {
    const graphId = typeof ref === 'string' ? ref : ref.graphId
    return appendErYUpdate(graphId, update, context, origin)
  }
  return appendBusinessFlowYUpdate(ref, update, context, origin)
}

async function appendErYUpdate(graphId, update, context = {}, origin = null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM er_graph WHERE id = $1 FOR UPDATE', [graphId])
    const seqResult = await client.query(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM er_yjs_update WHERE graph_id = $1',
      [graphId],
    )
    const seq = Number(seqResult.rows[0].seq)
    const updateBuffer = Buffer.from(update)
    await client.query(
      `
      INSERT INTO er_yjs_update (graph_id, client_id, user_id, update_bin, seq, update_size, origin)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        graphId,
        context.clientId || null,
        context.userId || null,
        updateBuffer,
        seq,
        updateBuffer.byteLength,
        origin,
      ],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function appendBusinessFlowYUpdate(ref, update, context = {}, origin = null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const docResult = await client.query(
      `
      INSERT INTO collab_document (owner_type, owner_id, ydoc_state, server_version, updated_at)
      VALUES ('BUSINESS_FLOW', $1, ''::bytea, 1, NOW())
      ON CONFLICT (owner_type, owner_id) DO UPDATE SET updated_at = collab_document.updated_at
      RETURNING id
      `,
      [ref.businessFlowId],
    )
    const documentId = docResult.rows[0].id
    await client.query('SELECT 1 FROM collab_document WHERE id = $1 FOR UPDATE', [documentId])
    const seqResult = await client.query(
      'SELECT COALESCE(MAX(update_seq), 0) + 1 AS seq FROM collab_update WHERE document_id = $1',
      [documentId],
    )
    const seq = Number(seqResult.rows[0].seq)
    const updateBuffer = Buffer.from(update)
    await client.query(
      `
      INSERT INTO collab_update (
        document_id, client_id, user_id, update_seq, update_data, update_size, origin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        documentId,
        context.clientId || null,
        context.userId || null,
        seq,
        updateBuffer,
        updateBuffer.byteLength,
        origin,
      ],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
