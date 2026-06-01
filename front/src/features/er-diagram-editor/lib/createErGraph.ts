import {
  Graph,
  History,
  Keyboard,
  type Edge,
  type ValidateConnectionArgs,
} from '@antv/x6'
import { buildErRelationshipLabel, readErThemeVars } from '../erTheme'
import type { RelationshipData } from '@/entities/er-graph/model/erSchema'

const SHARED_EDGE_ROUTE = {
  router: { name: 'metro' as const },
  connector: { name: 'rounded' as const, args: { radius: 8 } },
} as const

function keyboardGuard(this: Graph, e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
  if (el.isContentEditable) return false
  return true
}

export type CreateErGraphOptions = {
  container: HTMLElement
  validateConnection: (graph: Graph, args: ValidateConnectionArgs) => boolean
}

export function createErGraph(opts: CreateErGraphOptions): Graph {
  const initialTheme = readErThemeVars()
  const graph = new Graph({
    container: opts.container,
    autoResize: true,
    background: { color: initialTheme.canvasBg },
    grid: { visible: true, type: 'dot', args: { color: initialTheme.canvasGrid } },
    mousewheel: {
      enabled: true,
      modifiers: 'ctrl',
      minScale: 0.3,
      maxScale: 2,
    },
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'rightMouseDown'],
    },
    connecting: {
      snap: true,
      allowBlank: false,
      allowLoop: false,
      allowMulti: 'withPort',
      highlight: true,
      ...SHARED_EDGE_ROUTE,
      createEdge: (): Edge =>
        graph.createEdge({
          shape: 'er-relationship',
          data: { type: '1:1' } as RelationshipData,
          labels: [buildErRelationshipLabel('1:1')],
        }),
      validateMagnet: ({ magnet }) => magnet.getAttribute('port-group') === 'fieldRight',
      validateConnection: (args: ValidateConnectionArgs): boolean =>
        opts.validateConnection(graph, args),
    },
  })

  graph.use(
    new Keyboard({
      // global: true + guard：React 节点内操作也能 Ctrl+Z；输入框内仍走浏览器撤销
      global: true,
      guard: keyboardGuard,
    }),
  )
  graph.use(
    new History({
      enabled: true,
      stackSize: 100,
    }),
  )

  return graph
}
