// OpenAI instrumentation patches chat.completions.create structurally without importing OpenAI.
// It records both non-streaming responses and streamed chunks through the active Mortem session.
import type { JsonValue, LLMCallPayload, TokenUsage } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"

type MutableRecord = Record<PropertyKey, unknown>
type UnknownFunction = (...args: unknown[]) => unknown
type ChatMessageRole = "assistant" | "system" | "tool" | "user"

const PATCHED = Symbol.for("mortem.openai.patched")

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

const roleFromRecord = (record: MutableRecord): ChatMessageRole => {
  const role = stringFromRecord(record, "role")

  if (role === "assistant" || role === "system" || role === "tool" || role === "user") {
    return role
  }

  return "user"
}

const numberFromRecord = (record: MutableRecord, key: string): number | undefined => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  isRecord(value) && Symbol.asyncIterator in value

const extractUsage = (value: unknown): TokenUsage | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const inputTokens =
    numberFromRecord(value, "prompt_tokens") ?? numberFromRecord(value, "input_tokens")
  const outputTokens =
    numberFromRecord(value, "completion_tokens") ?? numberFromRecord(value, "output_tokens")
  const totalTokens = numberFromRecord(value, "total_tokens")

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
  }
}

const buildInputPayload = (params: unknown): LLMCallPayload => {
  const record = isRecord(params) ? params : {}
  const messages = Array.isArray(record.messages)
    ? record.messages.map((message) => {
        const messageRecord = isRecord(message) ? message : {}
        return {
          content: toJsonValue(messageRecord.content),
          name: stringFromRecord(messageRecord, "name"),
          role: roleFromRecord(messageRecord),
          toolCallId: stringFromRecord(messageRecord, "tool_call_id"),
        }
      })
    : []

  return {
    provider: "openai",
    model: stringFromRecord(record, "model") ?? "unknown",
    input: {
      messages,
      parameters: jsonRecord(record),
    },
    costUsd: 0,
    streamed: booleanFromRecord(record, "stream") ?? false,
  }
}

const extractResponsePayload = (basePayload: LLMCallPayload, response: unknown): LLMCallPayload => {
  const record = isRecord(response) ? response : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice = choices[0]
  const firstChoiceRecord = isRecord(firstChoice) ? firstChoice : {}
  const message = firstChoiceRecord.message
  const messageRecord = isRecord(message) ? message : {}
  const content = messageRecord.content ?? ""

  return {
    ...basePayload,
    output: {
      content: toJsonValue(content),
      finishReason: stringFromRecord(firstChoiceRecord, "finish_reason"),
      toolCalls: Array.isArray(messageRecord.tool_calls)
        ? messageRecord.tool_calls.map((toolCall) => {
            const toolCallRecord = isRecord(toolCall) ? toolCall : {}
            const functionRecord = isRecord(toolCallRecord.function) ? toolCallRecord.function : {}
            return {
              arguments: toJsonValue(functionRecord.arguments ?? {}),
              id: stringFromRecord(toolCallRecord, "id") ?? "unknown",
              name: stringFromRecord(functionRecord, "name") ?? "unknown",
            }
          })
        : undefined,
    },
    usage: extractUsage(record.usage),
  }
}

const readChunkContent = (chunk: unknown): string => {
  const record = isRecord(chunk) ? chunk : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice = choices[0]
  const firstChoiceRecord = isRecord(firstChoice) ? firstChoice : {}
  const delta = firstChoiceRecord.delta
  const deltaRecord = isRecord(delta) ? delta : {}
  const content = deltaRecord.content
  return typeof content === "string" ? content : ""
}

const readChunkFinishReason = (chunk: unknown): string | undefined => {
  const record = isRecord(chunk) ? chunk : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice = choices[0]
  const firstChoiceRecord = isRecord(firstChoice) ? firstChoice : {}
  return stringFromRecord(firstChoiceRecord, "finish_reason")
}

async function* tapOpenAIStream(
  stream: AsyncIterable<unknown>,
  payload: LLMCallPayload,
  complete: (payload: LLMCallPayload) => void,
  fail: (error: unknown) => void,
): AsyncGenerator<unknown> {
  let content = ""
  let finishReason: string | undefined

  try {
    for await (const chunk of stream) {
      content += readChunkContent(chunk)
      finishReason = readChunkFinishReason(chunk) ?? finishReason
      yield chunk
    }

    complete({
      ...payload,
      output: {
        content,
        finishReason,
      },
    })
  } catch (error) {
    fail(error)
    throw error
  }
}

export const wrapOpenAIClient = <T>(client: T): T => {
  if (!isRecord(client)) {
    return client
  }

  const chat = client.chat
  const completions = isRecord(chat) ? chat.completions : undefined
  const completionsRecord = isRecord(completions) ? completions : undefined

  if (completionsRecord === undefined || completionsRecord[PATCHED] === true) {
    return client
  }

  const create = completionsRecord.create

  if (typeof create !== "function") {
    return client
  }

  const originalCreate = create as UnknownFunction

  completionsRecord.create = function patchedOpenAICreate(this: unknown, ...args: unknown[]) {
    const session = getActiveSession()

    if (session === undefined) {
      return originalCreate.apply(this, args)
    }

    const payload = buildInputPayload(args[0])
    const event = session.beginEvent("llm_call", toJsonValue(payload))

    try {
      const result = originalCreate.apply(this, args)

      if (isAsyncIterable(result)) {
        return tapOpenAIStream(
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
  completionsRecord[PATCHED] = true

  return client
}
