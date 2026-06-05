import ERDiagram from './ERDiagram'

export function ErDiagramEditor({ graphId }: { graphId?: string }) {
  return <ERDiagram graphId={graphId} />
}

export { ERDiagram }
export default ERDiagram
