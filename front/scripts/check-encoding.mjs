import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const rel of [
  'src/ERDiagram.tsx',
  'src/FieldEnumPanel.tsx',
  'src/erFieldContext.tsx',
]) {
  const t = readFileSync(join(root, rel), 'utf8')
  const label = t.match(/aria-label="([^"]+)"/)?.[1]
  const codes = label ? [...label].map((c) => c.codePointAt(0)?.toString(16)).join(' ') : 'n/a'
  console.log(rel, { label, codes, hasQuestion: t.includes('???') })
}
