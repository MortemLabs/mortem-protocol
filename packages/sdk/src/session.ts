// Session tracks one agent run from start to finish and records completed child events. It updates
// aggregate trace metrics locally before handing transport work to the non-throwing buffer.
import type { EventType, JsonValue, Trace, TraceEvent, TraceStatus } from "@mortemlabs/shared"
import { ulid } from "ulid"
import { getActiveEventId, runWithSession } from "./context.js"
import { EventBuilder } from "./event-builder.js"
import type {
  BeginEventOptions,
  EventSink,
  SessionEndOptions,
  SessionOptions,
  SessionRuntimeConfig,
} from "./types.js"

const isRecord = (value: JsonValue): value is Record<string, JsonValue> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const numberFromRecord = (record: Record<string, JsonValue>, key: string): number | undefined => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const stringFromRecord = (record: Record<string, JsonValue>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const parseLamports = (value: string | undefined): bigint => {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return 0n
  }

  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

export class Session implements EventSink {
  readonly id: string

  private readonly config: SessionRuntimeConfig
  private readonly trace: Trace
  private readonly toolsCalled = new Set<string>()
  private sequence = 0
  private totalCostUsd = 0
  private totalLamports = 0n

  constructor(config: SessionRuntimeConfig, options: SessionOptions) {
    this.config = config
    this.id = options.traceId ?? ulid()
    this.trace = {
      id: this.id,
      agentId: options.agentId ?? config.agentId,
      status: "running",
      startedAt: options.startedAt ?? new Date(),
      endedAt: null,
      durationMs: null,
      inputSummary: options.inputSummary,
      outputSummary: null,
      errorMessage: null,
      eventCount: 0,
      totalTokens: 0,
      totalCostUsd: "0.000000",
      totalLamports: 0n,
      solanaTxCount: 0,
      toolsCalled: [],
      anchorSignature: null,
      anchorSlot: null,
      merkleProof: null,
      traceHash: null,
      shareToken: null,
      tags: options.tags ?? [],
    }

    this.config.buffer.enqueue({ trace: this.snapshot(), events: [] })
  }

  get traceId(): string {
    return this.id
  }

  beginEvent(
    type: EventType,
    payload: JsonValue = null,
    options: BeginEventOptions = {},
  ): EventBuilder {
    return new EventBuilder({
      sink: this,
      traceId: this.id,
      type,
      payload,
      parentEventId: options.parentEventId ?? getActiveEventId() ?? null,
      options,
    })
  }

  getNextSequence(): number {
    this.sequence += 1
    return this.sequence
  }

  recordEvent(event: TraceEvent): void {
    try {
      this.trace.eventCount += 1
      this.recordMetrics(event)
      this.config.buffer.enqueue({ trace: this.snapshot(), events: [event] })
    } catch {
      // SDK instrumentation must not throw into the agent runtime.
    }
  }

  async complete(outputSummary?: string | undefined): Promise<void> {
    await this.finish({ outputSummary, status: "completed" })
  }

  async fail(error: unknown, outputSummary?: string | undefined): Promise<void> {
    await this.finish({
      errorMessage: toErrorMessage(error),
      outputSummary,
      status: "errored",
    })
  }

  async end(options: SessionEndOptions = {}): Promise<void> {
    await this.finish({
      errorMessage: options.errorMessage,
      outputSummary: options.outputSummary,
      status: options.status ?? "completed",
    })
  }

  async run<T>(callback: () => T | Promise<T>): Promise<T> {
    return runWithSession(this, async () => {
      try {
        const result = await callback()
        await this.complete()
        return result
      } catch (error) {
        await this.fail(error)
        throw error
      }
    })
  }

  snapshot(): Trace {
    return {
      ...this.trace,
      tags: [...this.trace.tags],
      toolsCalled: [...this.trace.toolsCalled],
    }
  }

  private async finish({
    errorMessage,
    outputSummary,
    status,
  }: {
    errorMessage?: string | null | undefined
    outputSummary?: string | undefined
    status: TraceStatus
  }): Promise<void> {
    try {
      if (this.trace.endedAt === null) {
        const endedAt = new Date()
        this.trace.endedAt = endedAt
        this.trace.durationMs = Math.max(0, endedAt.getTime() - this.trace.startedAt.getTime())
      }

      this.trace.status = status
      this.trace.outputSummary = outputSummary ?? this.trace.outputSummary
      this.trace.errorMessage = errorMessage ?? this.trace.errorMessage
      this.config.buffer.enqueue({ trace: this.snapshot(), events: [] })
      await this.config.buffer.flush()
    } catch {
      // Session completion is best-effort and cannot interrupt agent execution.
    }
  }

  private recordMetrics(event: TraceEvent): void {
    if (!isRecord(event.payload)) {
      return
    }

    if (event.type === "llm_call") {
      const usage = event.payload.usage
      if (usage !== undefined && isRecord(usage)) {
        this.trace.totalTokens += numberFromRecord(usage, "totalTokens") ?? 0
      }

      this.totalCostUsd += numberFromRecord(event.payload, "costUsd") ?? 0
      this.trace.totalCostUsd = this.totalCostUsd.toFixed(6)
      return
    }

    if (event.type === "tool_call") {
      const toolName = stringFromRecord(event.payload, "toolName")
      if (toolName !== undefined) {
        this.toolsCalled.add(toolName)
        this.trace.toolsCalled = [...this.toolsCalled]
      }
      return
    }

    if (event.type === "solana_tx") {
      this.trace.solanaTxCount += 1
      this.totalLamports += parseLamports(stringFromRecord(event.payload, "lamports"))
      this.trace.totalLamports = this.totalLamports
    }
  }
}
