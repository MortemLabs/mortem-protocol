// Anthropic instrumentation patches messages.create without importing the Anthropic SDK. It
// captures normal message responses, tool_use blocks, and streamed content deltas.
import type { JsonValue, LLMCallPayload, TokenUsage } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"

type MutableRecord = Record<PropertyKey, unknown>
type UnknownFunction = (...args: unknown[]) => unknown
type ChatMessageRole = "assistant" | "system" | "tool" | "user"

const PATCHED = Symbol.for("mortem.anthropic.patched")

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

  const inputTokens = numberFromRecord(value, "input_tokens")
  const outputTokens = numberFromRecord(value, "output_tokens")

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
  const system =
    record.system === undefined ? undefined : JSON.stringify(toJsonValue(record.system))

  return {
    provider: "anthropic",
    model: stringFromRecord(record, "model") ?? "unknown",
    input: {
      system,
      messages,
      parameters: jsonRecord(record),
    },
    costUsd: 0,
    streamed: booleanFromRecord(record, "stream") ?? false,
  }
}

const contentBlocksToText = (content: unknown): string => {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((block) => {
      const blockRecord = isRecord(block) ? block : {}
      const type = stringFromRecord(blockRecord, "type")
      const text = stringFromRecord(blockRecord, "text")
      return type === "text" && text !== undefined ? text : ""
    })
    .join("")
}

const extractToolCalls = (
  content: unknown,
): LLMCallPayload["output"] extends infer Output
  ? Output extends { toolCalls?: infer ToolCalls }
    ? ToolCalls
    : never
  : never => {
  if (!Array.isArray(content)) {
    return undefined
  }

  return content
    .filter((block) => {
      const blockRecord = isRecord(block) ? block : {}
      return stringFromRecord(blockRecord, "type") === "tool_use"
    })
    .map((block) => {
      const blockRecord = isRecord(block) ? block : {}
      return {
        arguments: toJsonValue(blockRecord.input ?? {}),
        id: stringFromRecord(blockRecord, "id") ?? "unknown",
        name: stringFromRecord(blockRecord, "name") ?? "unknown",
      }
    })
}

const extractResponsePayload = (basePayload: LLMCallPayload, response: unknown): LLMCallPayload => {
  const record = isRecord(response) ? response : {}
  const content = record.content

  return {
    ...basePayload,
    output: {
      content: contentBlocksToText(content),
      finishReason: stringFromRecord(record, "stop_reason"),
      toolCalls: extractToolCalls(content),
    },
    usage: extractUsage(record.usage),
  }
}

const readStreamText = (chunk: unknown): string => {
  const record = isRecord(chunk) ? chunk : {}
  const type = stringFromRecord(record, "type")

  if (type === "content_block_delta") {
    const delta = record.delta
    const deltaRecord = isRecord(delta) ? delta : {}
    return stringFromRecord(deltaRecord, "text") ?? ""
  }

  return ""
}

const readStreamFinishReason = (chunk: unknown): string | undefined => {
  const record = isRecord(chunk) ? chunk : {}

  if (stringFromRecord(record, "type") !== "message_delta") {
    return undefined
  }

  const delta = record.delta
  const deltaRecord = isRecord(delta) ? delta : {}
  return stringFromRecord(deltaRecord, "stop_reason")
}

const readStreamUsage = (chunk: unknown): TokenUsage | undefined => {
  const record = isRecord(chunk) ? chunk : {}
  const usage = record.usage ?? (isRecord(record.message) ? record.message.usage : undefined)
  return extractUsage(usage)
}

async function* tapAnthropicStream(
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
      content += readStreamText(chunk)
      finishReason = readStreamFinishReason(chunk) ?? finishReason
      usage = readStreamUsage(chunk) ?? usage
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

export const wrapAnthropicClient = <T>(client: T): T => {
  if (!isRecord(client)) {
    return client
  }

  const messages = client.messages
  const messagesRecord = isRecord(messages) ? messages : undefined

  if (messagesRecord === undefined || messagesRecord[PATCHED] === true) {
    return client
  }

  const create = messagesRecord.create

  if (typeof create !== "function") {
    return client
  }

  const originalCreate = create as UnknownFunction

  messagesRecord.create = function patchedAnthropicCreate(this: unknown, ...args: unknown[]) {
    const session = getActiveSession()

    if (session === undefined) {
      return originalCreate.apply(this, args)
    }

    const payload = buildInputPayload(args[0])
    const event = session.beginEvent("llm_call", toJsonValue(payload))

    try {
      const result = originalCreate.apply(this, args)

      if (isAsyncIterable(result)) {
        return tapAnthropicStream(
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
  messagesRecord[PATCHED] = true

  return client
}
