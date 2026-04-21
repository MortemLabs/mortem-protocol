// Agent onboarding starts the happy path for creating an SDK-backed Mortem agent. The route keeps
// the shell server-rendered while the step wizard runs as an authenticated client component.
import { AgentOnboardingWizard } from "./wizard"

export default function NewAgentPage() {
  return <AgentOnboardingWizard />
}
