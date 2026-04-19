// Trace detail pages resolve the dynamic trace id server-side and hand rendering to the
// authenticated client panel. The panel owns live UI state such as focused events and sharing.
import { TraceDetail } from "./trace-detail"

export default async function TraceDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params

  return <TraceDetail traceId={id} />
}
