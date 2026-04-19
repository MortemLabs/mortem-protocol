// Vercel AI instrumentation wraps tool execute functions and structural language model methods.
// It does not import the AI SDK, so users only pay for instrumentation when those shapes exist.
import type { JsonValue, LLMCallPayload, ToolCallPayload } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"
import type { LanguageModel } from "../types.js"

type MutableRecord = Record<PropertyKey, unknown>
type UnknownFunction = (...args: unknown[]) => unknown

const TOOL_PATCHED = Symbol.for("mortem.vercel-ai.tool.patched")
const MODEL_PATCHED = Symbol.for("mortem.vercel-ai.model.patched")

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

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const isReadableLike = (value: unknown): value is ReadableStream<unknown> =>
  isRecord(value) && typeof value.pipeThrough === "function"

const extractModelId = (model: MutableRecord): string =>
  stringFromRecord(model, "modelId") ??
  stringFromRecord(model, "model") ??
  stringFromRecord(model, "id") ??
  "unknown"

const buildToolPayload = (toolName: string, input: unknown): ToolCallPayload => ({
  toolName,
  input: toJsonValue(input),
  metadata: {
    source: "vercel-ai",
  },
})

const buildModelPayload = (
  model: MutableRecord,
  input: unknown,
  streamed: boolean,
): LLMCallPayload => ({
  provider: "vercel-ai",
  model: extractModelId(model),
  input: {
    messages: [],
    parameters: toJsonValue(input) as Record<string, JsonValue>,
  },
  costUsd: 0,
  streamed,
})

const extractGenerateOutput = (response: unknown): JsonValue => {
  if (!isRecord(response)) {
    return toJsonValue(response)
  }

  return toJsonValue(response.text ?? response.content ?? response.response ?? response)
}

const extractStreamText = (chunk: unknown): string => {
  if (!isRecord(chunk)) {
    return typeof chunk === "string" ? chunk : ""
  }

  const textDelta = stringFromRecord(chunk, "textDelta")
  const text = stringFromRecord(chunk, "text")

  return textDelta ?? text ?? ""
}

const wrapStreamResult = (
  result: unknown,
  payload: LLMCallPayload,
  complete: (payload: LLMCallPayload) => void,
): unknown => {
  if (
    !isRecord(result) ||
    !isReadableLike(result.stream) ||
    typeof TransformStream === "undefined"
  ) {
    complete({
      ...payload,
      output: {
        content: "",
      },
    })
    return result
  }

  let content = ""
  const transform = new TransformStream<unknown, unknown>({
    transform(chunk, controller) {
      content += extractStreamText(chunk)
      controller.enqueue(chunk)
    },
    flush() {
      complete({
        ...payload,
        output: {
          content,
        },
      })
    },
  })

  return {
    ...result,
    stream: result.stream.pipeThrough(transform),
  }
}

export const wrapVercelAITools = <T>(tools: T): T => {
  if (!isRecord(tools)) {
    return tools
  }

  for (const [toolName, tool] of Object.entries(tools)) {
    if (!isRecord(tool) || tool[TOOL_PATCHED] === true || typeof tool.execute !== "function") {
      continue
    }

    const toolRecord = tool as MutableRecord
    const originalExecute = tool.execute as UnknownFunction

    toolRecord.execute = function patchedVercelTool(this: unknown, ...args: unknown[]) {
      const session = getActiveSession()

      if (session === undefined) {
        return originalExecute.apply(this, args)
      }

      const payload = buildToolPayload(toolName, args[0])
      const event = session.beginEvent("tool_call", toJsonValue(payload))

      try {
        const result = originalExecute.apply(this, args)

        if (result instanceof Promise) {
          return result
            .then((output) => {
              event.complete({
                payload: toJsonValue({
                  ...payload,
                  output: toJsonValue(output),
                }),
              })
              return output
            })
            .catch((error: unknown) => {
              event.fail(error)
              throw error
            })
        }

        event.complete({
          payload: toJsonValue({
            ...payload,
            output: toJsonValue(result),
          }),
        })
        return result
      } catch (error) {
        event.fail(error)
        throw error
      }
    }
    toolRecord[TOOL_PATCHED] = true
  }

  return tools
}

export const wrapVercelAILanguageModel = <T extends LanguageModel>(model: T): T => {
  if (!isRecord(model)) {
    return model
  }

  const modelRecord = model as MutableRecord

  if (modelRecord[MODEL_PATCHED] === true) {
    return model
  }

  const doGenerate = modelRecord.doGenerate
  const doStream = modelRecord.doStream

  if (typeof doGenerate === "function") {
    const originalGenerate = doGenerate as UnknownFunction

    modelRecord.doGenerate = function patchedDoGenerate(this: unknown, ...args: unknown[]) {
      const session = getActiveSession()

      if (session === undefined) {
        return originalGenerate.apply(this, args)
      }

      const payload = buildModelPayload(modelRecord, args[0], false)
      const event = session.beginEvent("llm_call", toJsonValue(payload))

      try {
        const result = originalGenerate.apply(this, args)

        if (result instanceof Promise) {
          return result
            .then((response) => {
              event.complete({
                payload: toJsonValue({
                  ...payload,
                  output: {
                    content: extractGenerateOutput(response),
                  },
                }),
              })
              return response
            })
            .catch((error: unknown) => {
              event.fail(error)
              throw error
            })
        }

        event.complete({
          payload: toJsonValue({
            ...payload,
            output: {
              content: extractGenerateOutput(result),
            },
          }),
        })
        return result
      } catch (error) {
        event.fail(error)
        throw error
      }
    }
  }

  if (typeof doStream === "function") {
    const originalStream = doStream as UnknownFunction

    modelRecord.doStream = function patchedDoStream(this: unknown, ...args: unknown[]) {
      const session = getActiveSession()

      if (session === undefined) {
        return originalStream.apply(this, args)
      }

      const payload = buildModelPayload(modelRecord, args[0], true)
      const event = session.beginEvent("llm_call", toJsonValue(payload))

      try {
        const result = originalStream.apply(this, args)

        if (result instanceof Promise) {
          return result
            .then((streamResult) =>
              wrapStreamResult(streamResult, payload, (completedPayload) =>
                event.complete({ payload: toJsonValue(completedPayload) }),
              ),
            )
            .catch((error: unknown) => {
              event.fail(error)
              throw error
            })
        }

        return wrapStreamResult(result, payload, (completedPayload) =>
          event.complete({ payload: toJsonValue(completedPayload) }),
        )
      } catch (error) {
        event.fail(error)
        throw error
      }
    }
  }

  modelRecord[MODEL_PATCHED] = true
  return model
}
