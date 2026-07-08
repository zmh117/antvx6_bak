import assert from 'node:assert/strict'
import test from 'node:test'
import * as Y from 'yjs'

import {
  type BusinessFlowCollabPatchPlan,
  compactBusinessFlowCollabPatchPlan,
  deriveBusinessFlowCollabPatchPlan,
} from '../src/features/business-flow/infrastructure/yjs/businessFlowCollabPatch.js'

function capturePlan(
  write: (doc: Y.Doc) => void,
  options?: Parameters<typeof deriveBusinessFlowCollabPatchPlan>[2],
) {
  const doc = new Y.Doc()
  let captured: BusinessFlowCollabPatchPlan | undefined
  doc.on('afterTransaction', (transaction) => {
    captured = deriveBusinessFlowCollabPatchPlan(doc, transaction, options)
  })
  doc.transact(() => write(doc), 'test')
  if (!captured) throw new Error('expected transaction patch plan')
  return captured
}

function childMap(values: Record<string, unknown>) {
  const map = new Y.Map<unknown>()
  Object.entries(values).forEach(([key, value]) => map.set(key, value))
  return map
}

function writeLargeBusinessFlowFixture(
  doc: Y.Doc,
  options: { lanes: number; nodesPerLane: number; edgesPerLane: number },
) {
  for (let laneIndex = 0; laneIndex < options.lanes; laneIndex += 1) {
    const laneKey = `lane-${laneIndex}`
    doc.getMap('lanes').set(laneKey, childMap({ instance_key: laneKey }))
    for (let nodeIndex = 0; nodeIndex < options.nodesPerLane; nodeIndex += 1) {
      const nodeKey = `${laneKey}:node-${nodeIndex}`
      doc.getMap('nodes').set(
        nodeKey,
        childMap({
          node_key: nodeKey,
          lane_instance_key: laneKey,
          lane_instance_id: laneKey,
        }),
      )
      doc.getMap('erRefs').set(`${nodeKey}:table`, childMap({ node_key: nodeKey }))
    }
    for (let edgeIndex = 0; edgeIndex < options.edgesPerLane; edgeIndex += 1) {
      doc.getMap('edges').set(
        `${laneKey}:edge-${edgeIndex}`,
        childMap({
          edge_key: `${laneKey}:edge-${edgeIndex}`,
          source_node_key: `${laneKey}:node-${edgeIndex}`,
          target_node_key: `${laneKey}:node-${edgeIndex + 1}`,
        }),
      )
    }
  }
}

test('extracts lane, node, edge and er reference key changes', () => {
  const plan = compactBusinessFlowCollabPatchPlan(
    capturePlan((doc) => {
      doc.getMap('lanes').set('lane-a', childMap({ instance_key: 'lane-a' }))
      doc.getMap('nodes').set('node-a', childMap({ node_key: 'node-a' }))
      doc.getMap('edges').set('edge-a', childMap({ edge_key: 'edge-a' }))
      doc.getMap('erRefs').set('node-a:table-a', childMap({ node_key: 'node-a' }))
    }),
  )
  assert.deepEqual(plan.entries, [
    { kind: 'lane', key: 'lane-a', action: 'upsert' },
    { kind: 'node', key: 'node-a', action: 'upsert' },
    { kind: 'edge', key: 'edge-a', action: 'upsert' },
    { kind: 'erRef', key: 'node-a:table-a', action: 'upsert', affectedNodeKey: 'node-a' },
  ])
})

test('extracts delete changes and affected node keys from er reference keys', () => {
  const doc = new Y.Doc()
  doc.getMap('nodes').set('node-a', childMap({ node_key: 'node-a' }))
  doc.getMap('erRefs').set('node-a:table-a', childMap({ node_key: 'node-a' }))

  let captured: BusinessFlowCollabPatchPlan | undefined
  doc.on('afterTransaction', (transaction) => {
    captured = deriveBusinessFlowCollabPatchPlan(doc, transaction)
  })
  doc.transact(() => {
    doc.getMap('nodes').delete('node-a')
    doc.getMap('erRefs').delete('node-a:table-a')
  }, 'test')

  if (!captured) throw new Error('expected transaction patch plan')
  assert.deepEqual(compactBusinessFlowCollabPatchPlan(captured).entries, [
    { kind: 'node', key: 'node-a', action: 'delete' },
    { kind: 'erRef', key: 'node-a:table-a', action: 'delete', affectedNodeKey: 'node-a' },
  ])
})

test('allows updatedAt-only metadata transactions', () => {
  const plan = capturePlan((doc) => {
    doc.getMap('meta').set('updatedAt', '2026-07-07T00:00:00.000Z')
  })
  assert.deepEqual(plan.entries, [{ kind: 'meta', key: 'updatedAt', action: 'update' }])
})

test('falls back for structural metadata changes', () => {
  const plan = capturePlan((doc) => {
    doc.getMap('meta').set('collabRevision', 2)
  })
  assert.equal(plan.fallbackReason, 'meta-structural-change')
})

test('falls back for large transactions', () => {
  const plan = capturePlan(
    (doc) => {
      for (let index = 0; index < 5; index += 1) {
        doc.getMap('nodes').set(`node-${index}`, childMap({ node_key: `node-${index}` }))
      }
    },
    { maxIncrementalEntries: 3 },
  )
  assert.equal(plan.fallbackReason, 'large-transaction')
})

test('large business-flow fixture exposes whole-document transaction pressure', () => {
  const plan = capturePlan(
    (doc) => writeLargeBusinessFlowFixture(doc, { lanes: 3, nodesPerLane: 8, edgesPerLane: 7 }),
    { maxIncrementalEntries: 20 },
  )
  assert.equal(plan.fallbackReason, 'large-transaction')
  assert.equal(plan.entries.length, 72)
})
