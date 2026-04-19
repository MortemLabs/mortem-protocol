// Agent detail pages summarize live activity, key routing, and the most important next actions.
// The route parameter is resolved server-side and passed into a client component for authenticated data.
import { AgentDetail } from "./panel"

export default async function AgentDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params

  return <AgentDetail agentId={id} />
}
