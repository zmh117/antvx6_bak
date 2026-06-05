import { DashboardApp } from '@/app/DashboardApp'
import { AuthGate } from '@/features/auth/AuthGate'
import { AppProviders } from './providers'

export default function App() {
  return (
    <AppProviders>
      <AuthGate>
        <DashboardApp />
      </AuthGate>
    </AppProviders>
  )
}
