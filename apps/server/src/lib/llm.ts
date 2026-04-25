// LLM analysis provider selection lives only in this module. The rest of the server talks to the
// small LLMClient interface while this file switches between Anthropic and Ollama from env.
import type { LLMProvider } from "@mortemlabs/shared"

export interface LLMClient {
  complete(system: string, user: string): Promise<string>
  modelId: string
  provider: LLMProvider
}

type MutableRecord = Record<PropertyKey, unknown>

const isRecord = (value: unknown): value is MutableRecord =>
  value !== null && typeof value === "object"

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const contentToText = (content: unknown): string => {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((block) => {
      const record = isRecord(block) ? block : {}
      return stringFromRecord(record, "text") ?? ""
    })
    .join("")
}

const providerFromEnv = (): LLMProvider =>
  process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "ollama"

const errorJson = (provider: LLMProvider, modelId: string, error: unknown): string =>
  JSON.stringify({
    error: error instanceof Error ? error.message : "LLM completion failed",
    modelUsed: modelId,
    provider,
  })

const createAnthropicClient = async (): Promise<LLMClient> => {
  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514"
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  return {
    modelId,
    provider: "anthropic",
    async complete(system, user) {
      try {
        const response = await client.messages.create({
          max_tokens: 2048,
          messages: [{ content: user, role: "user" }],
          model: modelId,
          system,
        })

        return contentToText(response.content)
      } catch (error) {
        return errorJson("anthropic", modelId, error)
      }
    },
  }
}

const createOllamaClient = async (): Promise<LLMClient> => {
  const modelId = process.env.OLLAMA_MODEL ?? ""
  const { Ollama } = await import("ollama")
  const client = new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
    },
  })

  return {
    modelId,
    provider: "ollama",
    async complete(system, user) {
      try {
        const response = await client.chat({
          format: "json",
          messages: [
            { content: system, role: "system" },
            { content: user, role: "user" },
          ],
          model: modelId,
          stream: false,
        })

        return response.message.content
      } catch (error) {
        return errorJson("ollama", modelId, error)
      }
    },
  }
}

async function validateOllamaConfig(): Promise<void> {
  if (process.env.LLM_PROVIDER !== "ollama") return

  if (!process.env.OLLAMA_API_KEY) {
    throw new Error(
      "OLLAMA_API_KEY is required when LLM_PROVIDER=ollama.\n" +
        "Get one at https://ollama.com/settings/keys",
    )
  }

  if (!process.env.OLLAMA_MODEL) {
    throw new Error("OLLAMA_MODEL is required when LLM_PROVIDER=ollama")
  }
}

export const getLLMClient = async (): Promise<LLMClient> => {
  await validateOllamaConfig()
  return providerFromEnv() === "anthropic" ? createAnthropicClient() : createOllamaClient()
}
