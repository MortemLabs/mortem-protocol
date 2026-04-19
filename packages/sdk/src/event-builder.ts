// EventBuilder owns event timing and parent linkage for a single observed operation. Completing or
// failing an event is safe to call once; repeated calls are ignored instead of throwing.
import type { JsonValue, TraceEvent } from "@mortemlabs/shared"
import { ulid } from "ulid"
import { runWithEvent } from "./context.js"
import type { CompleteEventOptions, EventBuilderInput, FailEventOptions } from "./types.js"

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

export class EventBuilder {
  readonly id: string

  private readonly input: EventBuilderInput
  private readonly startedAt: Date
  private finalized = false

  constructor(input: EventBuilderInput) {
    this.input = input
    this.id = input.options?.id ?? ulid()
    this.startedAt = input.options?.startedAt ?? new Date()
  }

  complete(options: CompleteEventOptions = {}): TraceEvent | undefined {
    return this.finalize({
      endedAt: options.endedAt ?? new Date(),
      errorMessage: null,
      payload: options.payload ?? this.input.payload,
      status: options.status ?? "ok",
    })
  }

  fail(error: unknown, options: FailEventOptions = {}): TraceEvent | undefined {
    return this.finalize({
      endedAt: options.endedAt ?? new Date(),
      errorMessage: toErrorMessage(error),
      payload: options.payload ?? this.input.payload,
      status: "error",
    })
  }

  async run<T>(callback: () => T | Promise<T>): Promise<T> {
    return runWithEvent(this.id, async () => {
      try {
        const result = await callback()
        this.complete()
        return result
      } catch (error) {
        this.fail(error)
        throw error
      }
    })
  }

  private finalize({
    endedAt,
    errorMessage,
    payload,
    status,
  }: {
    endedAt: Date
    errorMessage: string | null
    payload: JsonValue
    status: string
  }): TraceEvent | undefined {
    if (this.finalized) {
      return undefined
    }

    this.finalized = true

    const event: TraceEvent = {
      id: this.id,
      traceId: this.input.traceId,
      parentEventId: this.input.parentEventId,
      sequence: this.input.sink.getNextSequence(),
      type: this.input.type,
      startedAt: this.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt.getTime() - this.startedAt.getTime()),
      payload,
      payloadEncrypted: false,
      status,
      errorMessage,
    }

    this.input.sink.recordEvent(event)
    return event
  }
}
