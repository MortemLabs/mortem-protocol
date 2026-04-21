// SDK types define the public configuration and structural wrapper contracts. They avoid hard
// dependencies on LLM, Solana, and framework SDKs so instrumentation can stay dynamically loaded.
import type {
  AgentEnvironment,
  EventType,
  JsonValue,
  Trace,
  TraceEvent,
  TraceStatus,
} from "@mortemlabs/shared"

export interface MortemLogger {
  warn(message: string, context?: Record<string, unknown> | undefined): void
}

export interface MortemConfig {
  apiKey: string
  ingestUrl?: string | undefined
  agentId?: string | undefined
  verifyToken?: string | undefined
  environment?: AgentEnvironment | undefined
  enabled?: boolean | undefined
  flushIntervalMs?: number | undefined
  maxBufferBytes?: number | undefined
  fetch?: typeof fetch | undefined
  logger?: MortemLogger | undefined
}

export interface SessionOptions {
  traceId?: string | undefined
  agentId?: string | undefined
  inputSummary: string
  tags?: string[] | undefined
  startedAt?: Date | undefined
}

export interface BeginEventOptions {
  id?: string | undefined
  parentEventId?: string | null | undefined
  startedAt?: Date | undefined
}

export interface CompleteEventOptions {
  payload?: JsonValue | undefined
  endedAt?: Date | undefined
  status?: string | undefined
}

export interface FailEventOptions {
  payload?: JsonValue | undefined
  endedAt?: Date | undefined
}

export interface BufferBatchItem {
  trace: Trace
  events: TraceEvent[]
}

export interface TransportBatchPayload {
  agentId?: string | undefined
  batchId: string
  items: BufferBatchItem[]
  verifyToken?: string | undefined
}

export interface SessionRuntimeConfig {
  agentId: string
  buffer: {
    enqueue(item: BufferBatchItem): void
    flush(): Promise<void>
  }
}

export interface EventSink {
  getNextSequence(): number
  recordEvent(event: TraceEvent): void
}

export type LanguageModel = Record<string, unknown>

export type Connection = object

export interface MortemCallbackHandler {
  name: string
}

export interface EventBuilderInput {
  sink: EventSink
  traceId: string
  type: EventType
  payload: JsonValue
  parentEventId: string | null
  options?: BeginEventOptions | undefined
}

export interface SessionEndOptions {
  status?: TraceStatus | undefined
  outputSummary?: string | undefined
  errorMessage?: string | null | undefined
}
