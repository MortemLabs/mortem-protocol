// Agent onboarding starts the happy path for creating an SDK-backed Mortem agent. The route keeps
// the shell server-rendered while the step wizard runs as an authenticated client component.
import { Suspense } from "react"
import { AgentOnboardingWizard } from "./wizard"

export default function NewAgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentOnboardingWizard />
    </Suspense>
  )
}
