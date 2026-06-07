export interface ErThemeVars {
  canvasBg: string
  canvasGrid: string
  edgeStroke: string
  edgeHover: string
  minimapBg: string
  edgeLabelText: string
  edgeLabelBg: string
  edgeLabelBorder: string
}

/** 与 globals.css :root / .dark 中 --er-* 保持一致，供 X6 画布 API 使用 */
const ER_THEME_LIGHT: ErThemeVars = {
  canvasBg: '#f7f8fa',
  canvasGrid: '#e5e7eb',
  edgeStroke: '#6b7280',
  edgeHover: '#2563eb',
  minimapBg: '#ffffff',
  edgeLabelText: '#374151',
  edgeLabelBg: '#ffffff',
  edgeLabelBorder: '#6b7280',
}

const ER_THEME_DARK: ErThemeVars = {
  canvasBg: '#14161a',
  canvasGrid: '#2a2f38',
  edgeStroke: '#9ca3af',
  edgeHover: '#3b82f6',
  minimapBg: '#1c1f26',
  edgeLabelText: '#e5e7eb',
  edgeLabelBg: '#1c1f26',
  edgeLabelBorder: '#9ca3af',
}

/** 关系边匹配方式标签（= / 包含 / 映射 / 语义 / 区间） */
export function buildErMatchOperatorLabel(text: string, mode?: string | null) {
  const t = readErThemeVars(mode)
  return {
    attrs: {
      text: { text, fill: t.edgeLabelText, fontSize: 12, fontWeight: 'bold' as const },
      rect: { fill: t.edgeLabelBg, stroke: t.edgeLabelBorder, rx: 3, ry: 3 },
    },
    position: 0.5 as const,
  }
}

/** @deprecated 保留给旧调用；新代码使用 buildErMatchOperatorLabel。 */
export const buildErRelationshipLabel = buildErMatchOperatorLabel

export type ErColorMode = 'light' | 'dark'

function resolveColorMode(mode?: string | null): ErColorMode {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** @param mode 建议传入 next-themes 的 resolvedTheme，避免 class 与 React 状态不同步 */
export function readErColorMode(mode?: string | null): ErColorMode {
  return resolveColorMode(mode)
}

/** @param mode 建议传入 next-themes 的 resolvedTheme，避免 class 与 React 状态不同步 */
export function readErThemeVars(mode?: string | null): ErThemeVars {
  return readErColorMode(mode) === 'dark' ? ER_THEME_DARK : ER_THEME_LIGHT
}
