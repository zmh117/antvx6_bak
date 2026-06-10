export type PublishSwimlaneComponentVersionCommand = {
  componentId: string
  canvasJson: Record<string, unknown>
  semanticJson: Record<string, unknown>
  thumbnailUrl?: string
}
