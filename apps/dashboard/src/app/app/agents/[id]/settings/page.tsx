// Agent settings routes resolve the agent id server-side and pass it to the authenticated settings
// panel. Mutations stay in the client so Privy tokens can authorize rotation and deletion.
import { AgentSettings } from "./settings-panel"

export default async function AgentSettingsPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params

  return <AgentSettings agentId={id} />
}
