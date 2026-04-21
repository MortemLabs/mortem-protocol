// Ollama instrumentation patches ollama.chat structurally. Cloud API costs are billed externally
// via ollama.com. It captures JSON-mode requests and streams by tapping AsyncGenerator chunks.
import type { JsonValue, LLMCallPayload, TokenUsage } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"

type MutableRecord = Record<PropertyKey, unknown>
type UnknownFunction = (...args: unknown[]) => unknown
type ChatMessageRole = "assistant" | "system" | "tool" | "user"

const PATCHED = Symbol.for("mortem.ollama.patched")

const isRecord = (value: unknown): value is MutableRecord =>
  value !== null && typeof value === "object"

const toJsonValue = (value: unknown, depth = 0): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (depth > 8) {
    return "[truncated]"
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, depth + 1))
  }

  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {}

    for (const [key, entry] of Object.entries(value)) {
      if (
        typeof entry === "undefined" ||
        typeof entry === "function" ||
        typeof entry === "symbol"
      ) {
        continue
      }

      output[key] = toJsonValue(entry, depth + 1)
    }

    return output
  }

  return String(value)
}

const jsonRecord = (value: unknown): Record<string, JsonValue> =>
  isRecord(value) && !Array.isArray(value) ? (toJsonValue(value) as Record<string, JsonValue>) : {}

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const booleanFromRecord = (record: MutableRecord, key: string): boolean | undefined => {
  const value = record[key]
  return typeof value === "boolean" ? value : undefined
}

const numberFromRecord = (record: MutableRecord, key: string): number | undefined => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const roleFromRecord = (record: MutableRecord): ChatMessageRole => {
  const role = stringFromRecord(record, "role")

  if (role === "assistant" || role === "system" || role === "tool" || role === "user") {
    return role
  }

  return "user"
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  isRecord(value) && Symbol.asyncIterator in value

const extractUsage = (value: unknown): TokenUsage | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const inputTokens = numberFromRecord(value, "prompt_eval_count")
  const outputTokens = numberFromRecord(value, "eval_count")

  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
  }
}

const buildInputPayload = (params: unknown): LLMCallPayload => {
  const record = isRecord(params) ? params : {}
  const messages = Array.isArray(record.messages)
    ? record.messages.map((message) => {
        const messageRecord = isRecord(message) ? message : {}
        return {
          content: toJsonValue(messageRecord.content),
          role: roleFromRecord(messageRecord),
        }
      })
    : []
  const parameters = jsonRecord(record)
  const format = stringFromRecord(record, "format")

  if (format === "json") {
    parameters.responseFormat = "json"
  }

  return {
    provider: "ollama",
    model: stringFromRecord(record, "model") ?? "unknown",
    input: {
      messages,
      parameters,
    },
    costUsd: -1,  // billed via ollama.com
    streamed: booleanFromRecord(record, "stream") ?? false,
  }
}

const extractResponsePayload = (basePayload: LLMCallPayload, response: unknown): LLMCallPayload => {
  const record = isRecord(response) ? response : {}
  const message = record.message
  const messageRecord = isRecord(message) ? message : {}

  return {
    ...basePayload,
    output: {
      content: toJsonValue(messageRecord.content ?? ""),
      finishReason: stringFromRecord(record, "done_reason"),
    },
    usage: extractUsage(record),
  }
}

const readChunkContent = (chunk: unknown): string => {
  const record = isRecord(chunk) ? chunk : {}
  const message = record.message
  const messageRecord = isRecord(message) ? message : {}
  const content = messageRecord.content
  return typeof content === "string" ? content : ""
}

const readChunkFinishReason = (chunk: unknown): string | undefined => {
  const record = isRecord(chunk) ? chunk : {}
  return stringFromRecord(record, "done_reason")
}

async function* tapOllamaStream(
  stream: AsyncIterable<unknown>,
  payload: LLMCallPayload,
  complete: (payload: LLMCallPayload) => void,
  fail: (error: unknown) => void,
): AsyncGenerator<unknown> {
  let content = ""
  let finishReason: string | undefined
  let usage: TokenUsage | undefined

  try {
    for await (const chunk of stream) {
      content += readChunkContent(chunk)
      finishReason = readChunkFinishReason(chunk) ?? finishReason
      usage = extractUsage(chunk) ?? usage
      yield chunk
    }

    complete({
      ...payload,
      output: {
        content,
        finishReason,
      },
      usage,
    })
  } catch (error) {
    fail(error)
    throw error
  }
}

export const wrapOllamaClient = <T>(client: T): T => {
  if (!isRecord(client) || client[PATCHED] === true) {
    return client
  }

  const clientRecord = client as MutableRecord
  const chat = clientRecord.chat

  if (typeof chat !== "function") {
    return client
  }

  const originalChat = chat as UnknownFunction

  clientRecord.chat = function patchedOllamaChat(this: unknown, ...args: unknown[]) {
    const session = getActiveSession()

    if (session === undefined) {
      return originalChat.apply(this, args)
    }

    const payload = buildInputPayload(args[0])
    const event = session.beginEvent("llm_call", toJsonValue(payload))

    try {
      const result = originalChat.apply(this, args)

      if (isAsyncIterable(result)) {
        return tapOllamaStream(
          result,
          payload,
          (streamPayload) => event.complete({ payload: toJsonValue(streamPayload) }),
          (error) => event.fail(error),
        )
      }

      if (result instanceof Promise) {
        return result
          .then((response) => {
            event.complete({ payload: toJsonValue(extractResponsePayload(payload, response)) })
            return response
          })
          .catch((error: unknown) => {
            event.fail(error)
            throw error
          })
      }

      event.complete({ payload: toJsonValue(extractResponsePayload(payload, result)) })
      return result
    } catch (error) {
      event.fail(error)
      throw error
    }
  }
  clientRecord[PATCHED] = true

  return client
}
