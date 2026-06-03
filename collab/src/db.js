import pg from 'pg'
import * as Y from 'yjs'
import { config } from './config.js'
import { seedDocFromRows } from './graphProjection.js'

export const pool = new pg.Pool(config.database)

export function parseGraphDocumentName(documentName) {
  const raw = String(documentName || '')
  const value = raw.startsWith('graph:') ? raw.slice('graph:'.length) : raw
  const match = value.match(/^([0-9a-fA-F-]{36})(?::r([0-9]+))?$/)
  if (!match) throw new Error(`invalid graph document name: ${raw}`)
  return {
    graphId: match[1],
    collabRevision: match[2] ? Number(match[2]) : null,
  }
}

export function parseGraphId(documentName) {
  const { graphId } = parseGraphDocumentName(documentName)
  return graphId
}

export async function isCurrentCollabRevision(graphId, collabRevision) {
  if (!Number.isInteger(collabRevision) || collabRevision < 1) return false
  const { rows } = await pool.query('SELECT collab_revision FROM er_graph WHERE id = $1', [graphId])
  return Number(rows[0]?.collab_revision) === collabRevision
}

export async function getMembership(graphId, userId) {
  const { rows } = await pool.query(
    `
    SELECT role FROM er_graph_member
    WHERE graph_id = $1 AND user_id = $2
    `,
    [graphId, userId],
  )
  return rows[0]?.role || null
}

export async function loadYDoc(graphId, collabRevision = null) {
  const doc = new Y.Doc()
  const { rows } = await pool.query('SELECT state FROM er_yjs_doc WHERE graph_id = $1', [graphId])
  if (rows[0]?.state) {
    Y.applyUpdate(doc, rows[0].state)
    return doc
  }
  const seedRows = await loadSeedRows(graphId)
  seedDocFromRows(doc, seedRows, collabRevision)
  await storeYDoc(graphId, doc)
  return doc
}

async function loadSeedRows(graphId) {
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

export async function storeYDoc(graphId, doc) {
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

export async function appendYUpdate(graphId, update, context = {}, origin = null) {
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
