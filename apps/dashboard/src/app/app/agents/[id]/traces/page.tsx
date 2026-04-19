// Agent trace lists provide the chronological entry point into detailed debugging sessions.
// The route keeps filters close to the table while authenticated fetching happens client-side.
import { TraceList } from "./trace-list"

export default async function AgentTracesPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params

  return <TraceList agentId={id} />
}
