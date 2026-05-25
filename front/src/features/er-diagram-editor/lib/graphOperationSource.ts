export type GraphOperationSource =
  | 'auto_save'
  | 'undo'
  | 'redo'
  | 'manual_save'
  | 'restore'

let pendingSource: GraphOperationSource = 'auto_save'

export function peekOperationSource(): GraphOperationSource {
  return pendingSource
}

export function setOperationSource(source: GraphOperationSource): void {
  pendingSource = source
}

/** 读取下次 persist 的来源并重置为 fallback（默认 auto_save） */
export function takeOperationSource(
  fallback: GraphOperationSource = 'auto_save',
): GraphOperationSource {
  const src = pendingSource
  pendingSource = fallback
  return src
}
