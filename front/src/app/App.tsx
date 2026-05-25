import { AppShell } from '@/components/app-shell'
import { ErDiagramEditor } from '@/features/er-diagram-editor'
import { AppProviders } from './providers'

export default function App() {
  return (
    <AppProviders>
      <AppShell>
        <ErDiagramEditor />
      </AppShell>
    </AppProviders>
  )
}
