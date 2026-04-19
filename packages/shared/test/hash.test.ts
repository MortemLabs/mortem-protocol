// Hash tests keep Mortem's trace digest stable across harmless event ordering differences.
// The trace hash is the leaf value later committed into on-chain Merkle batches.
import { describe, expect, it } from "vitest"
import { computeTraceHash, sha256 } from "../src/hash.js"
import type { Trace, TraceEvent } from "../src/types.js"

const startedAt = new Date("2026-04-19T12:00:00.000Z")

const trace: Trace = {
  id: "trace-01",
  agentId: "agent-01",
  status: "completed",
  startedAt,
  endedAt: new Date("2026-04-19T12:00:01.000Z"),
  durationMs: 1000,
  inputSummary: "swap SOL to USDC",
  outputSummary: "swap completed",
  errorMessage: null,
  eventCount: 2,
  totalTokens: 42,
  totalCostUsd: "0.001000",
  totalLamports: 5000n,
  solanaTxCount: 1,
  toolsCalled: ["quote", "swap"],
  anchorSignature: null,
  anchorSlot: null,
  merkleProof: null,
  traceHash: null,
  shareToken: null,
  tags: ["test"],
}

const eventOne: TraceEvent = {
  id: "event-01",
  traceId: "trace-01",
  parentEventId: null,
  sequence: 1,
  type: "tool_call",
  startedAt,
  endedAt: startedAt,
  durationMs: 0,
  payload: { toolName: "quote", input: { amount: "1" } },
  payloadEncrypted: false,
  status: "ok",
  errorMessage: null,
}

const eventTwo: TraceEvent = {
  ...eventOne,
  id: "event-02",
  sequence: 2,
  payload: { cluster: "devnet", signature: "sig" },
}

describe("sha256", () => {
  it("matches the known SHA-256 vector for abc", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("computeTraceHash", () => {
  it("is stable when events are provided out of order", () => {
    const ordered = computeTraceHash({ trace, events: [eventOne, eventTwo] })
    const shuffled = computeTraceHash({ trace, events: [eventTwo, eventOne] })

    expect(shuffled).toBe(ordered)
  })

  it("changes when market context changes", () => {
    const base = computeTraceHash({ trace, events: [eventOne, eventTwo] })
    const withMarket = computeTraceHash({
      trace,
      events: [eventOne, eventTwo],
      marketContext: {
        slot: 1,
        timestamp: 1,
        pythPrices: {},
        jupiterRoutes: {},
        poolStates: {},
      },
    })

    expect(withMarket).not.toBe(base)
  })
})
