export const API_BASE = import.meta.env.VITE_API_BASE ?? ''
export const COLLAB_WS_URL =
  import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://127.0.0.1:1234'
export const BUSINESS_FLOW_INCREMENTAL_COLLAB =
  import.meta.env.VITE_BUSINESS_FLOW_INCREMENTAL_COLLAB !== 'false'
export const DEFAULT_GRAPH_ID =
  import.meta.env.VITE_GRAPH_ID ?? '00000000-0000-0000-0000-000000000001'
export const DEFAULT_PRODUCT_ID =
  import.meta.env.VITE_PRODUCT_ID ?? '00000000-0000-0000-0000-000000000001'
