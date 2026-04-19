// Hash helpers centralize the canonical hashing rules used before Merkle commitment. Trace
// hashes include the trace record, ordered events, and optional market context in a stable shape.
import { createHash } from "node:crypto"
import { canonicalize } from "./canonical-json.js"
import type { MarketContext, Trace, TraceEvent } from "./types.js"

export interface TraceHashInput {
  trace: Trace
  events: readonly TraceEvent[]
  marketContext?: MarketContext | null
}

export const sha256 = (input: string | Buffer | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex")

const eventSortKey = (event: TraceEvent): [number, string] => [event.sequence, event.id]

export const computeTraceHash = ({
  trace,
  events,
  marketContext = null,
}: TraceHashInput): string => {
  const orderedEvents = [...events].sort((left, right) => {
    const [leftSequence, leftId] = eventSortKey(left)
    const [rightSequence, rightId] = eventSortKey(right)

    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence
    }

    return leftId.localeCompare(rightId)
  })

  return sha256(
    canonicalize({
      events: orderedEvents,
      marketContext,
      trace,
    }),
  )
}
