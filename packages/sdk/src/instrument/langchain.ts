// LangChain instrumentation provides callback handlers without a hard LangChain dependency. When
// LangChain is installed, the async factory dynamically subclasses BaseCallbackHandler.
import type { JsonValue, LLMCallPayload, ToolCallPayload } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"
import type { EventBuilder } from "../event-builder.js"
import type { MortemCallbackHandler } from "../types.js"

type MutableRecord = Record<PropertyKey, unknown>
type BaseCallbackHandlerConstructor = new () => MortemCallbackHandler

const LANGCHAIN_BASE_HANDLER = "@langchain/core/callbacks/base"

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

const findRunId = (values: readonly unknown[]): string => {
  const found = values.find((value) => typeof value === "string")
  return typeof found === "string" ? found : "default"
}

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const buildLLMPayload = (llm: unknown, prompts: unknown): LLMCallPayload => {
  const llmRecord = isRecord(llm) ? llm : {}

  return {
    provider: "unknown",
    model:
      stringFromRecord(llmRecord, "modelName") ?? stringFromRecord(llmRecord, "model") ?? "unknown",
    input: {
      messages: [
        {
          content: toJsonValue(prompts),
          role: "user",
        },
      ],
      parameters: toJsonValue(llm) as Record<string, JsonValue>,
    },
    costUsd: 0,
    streamed: false,
  }
}

const buildToolPayload = (tool: unknown, input: unknown): ToolCallPayload => {
  const toolRecord = isRecord(tool) ? tool : {}

  return {
    toolName:
      stringFromRecord(toolRecord, "name") ??
      stringFromRecord(toolRecord, "id") ??
      "langchain_tool",
    input: toJsonValue(input),
    metadata: {
      source: "langchain",
    },
  }
}

class MortemLangChainHandler implements MortemCallbackHandler {
  name = "mortem"

  private readonly events = new Map<string, EventBuilder>()

  handleLLMStart(llm: unknown, prompts: unknown, ...rest: unknown[]): void {
    const session = getActiveSession()

    if (session === undefined) {
      return
    }

    const runId = findRunId(rest)
    const payload = buildLLMPayload(llm, prompts)
    this.events.set(runId, session.beginEvent("llm_call", toJsonValue(payload)))
  }

  handleLLMEnd(output: unknown, ...rest: unknown[]): void {
    const runId = findRunId(rest)
    const event = this.events.get(runId)

    if (event === undefined) {
      return
    }

    event.complete({
      payload: toJsonValue({
        output: toJsonValue(output),
        provider: "unknown",
      }),
    })
    this.events.delete(runId)
  }

  handleLLMError(error: unknown, ...rest: unknown[]): void {
    const runId = findRunId(rest)
    const event = this.events.get(runId)

    if (event === undefined) {
      return
    }

    event.fail(error)
    this.events.delete(runId)
  }

  handleToolStart(tool: unknown, input: unknown, ...rest: unknown[]): void {
    const session = getActiveSession()

    if (session === undefined) {
      return
    }

    const runId = findRunId(rest)
    const payload = buildToolPayload(tool, input)
    this.events.set(runId, session.beginEvent("tool_call", toJsonValue(payload)))
  }

  handleToolEnd(output: unknown, ...rest: unknown[]): void {
    const runId = findRunId(rest)
    const event = this.events.get(runId)

    if (event === undefined) {
      return
    }

    event.complete({
      payload: toJsonValue({
        output: toJsonValue(output),
      }),
    })
    this.events.delete(runId)
  }

  handleToolError(error: unknown, ...rest: unknown[]): void {
    const runId = findRunId(rest)
    const event = this.events.get(runId)

    if (event === undefined) {
      return
    }

    event.fail(error)
    this.events.delete(runId)
  }
}

const loadBaseCallbackHandler = async (): Promise<BaseCallbackHandlerConstructor | undefined> => {
  try {
    const imported: unknown = await import(LANGCHAIN_BASE_HANDLER)

    if (!isRecord(imported) || typeof imported.BaseCallbackHandler !== "function") {
      return undefined
    }

    return imported.BaseCallbackHandler as BaseCallbackHandlerConstructor
  } catch {
    return undefined
  }
}

export const createLangChainHandler = (): MortemCallbackHandler => new MortemLangChainHandler()

export const createLangChainHandlerAsync = async (): Promise<MortemCallbackHandler> => {
  const BaseCallbackHandler = await loadBaseCallbackHandler()

  if (BaseCallbackHandler === undefined) {
    return new MortemLangChainHandler()
  }

  class DynamicMortemLangChainHandler extends BaseCallbackHandler implements MortemCallbackHandler {
    override readonly name = "mortem"

    private readonly delegate = new MortemLangChainHandler()

    handleLLMStart(llm: unknown, prompts: unknown, ...rest: unknown[]): void {
      this.delegate.handleLLMStart(llm, prompts, ...rest)
    }

    handleLLMEnd(output: unknown, ...rest: unknown[]): void {
      this.delegate.handleLLMEnd(output, ...rest)
    }

    handleLLMError(error: unknown, ...rest: unknown[]): void {
      this.delegate.handleLLMError(error, ...rest)
    }

    handleToolStart(tool: unknown, input: unknown, ...rest: unknown[]): void {
      this.delegate.handleToolStart(tool, input, ...rest)
    }

    handleToolEnd(output: unknown, ...rest: unknown[]): void {
      this.delegate.handleToolEnd(output, ...rest)
    }

    handleToolError(error: unknown, ...rest: unknown[]): void {
      this.delegate.handleToolError(error, ...rest)
    }
  }

  return new DynamicMortemLangChainHandler()
}
