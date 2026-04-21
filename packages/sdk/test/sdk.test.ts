// SDK tests verify that wrappers capture events without hard provider dependencies. They also
// confirm failed ingestion never propagates back into agent code.
import { gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { Mortem } from "../src/index.js"

interface CapturedEvent {
  type: string
  payload: unknown
}

interface CapturedItem {
  events: CapturedEvent[]
}

interface CapturedBatch {
  agentId?: string
  items: CapturedItem[]
  verifyToken?: string
}

interface HandlerLike {
  handleLLMEnd(output: unknown, runId: string): void
  handleLLMStart(llm: unknown, prompts: unknown, runId: string): void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object"

const parseBatch = (body: Buffer): CapturedBatch =>
  JSON.parse(gunzipSync(body).toString("utf8")) as CapturedBatch

const eventPayload = (event: CapturedEvent): Record<string, unknown> => {
  expect(isRecord(event.payload)).toBe(true)
  return event.payload as Record<string, unknown>
}

const requireEvent = (events: readonly CapturedEvent[], type: string): CapturedEvent => {
  const event = events.find((candidate) => candidate.type === type)
  expect(event).toBeDefined()

  if (event === undefined) {
    throw new Error(`Missing ${type} event`)
  }

  return event
}

const collectEvents = async (
  exercise: (mortem: Mortem) => Promise<void>,
): Promise<CapturedEvent[]> => {
  const bodies: Buffer[] = []
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = init?.body

    if (body instanceof Uint8Array) {
      bodies.push(Buffer.from(body))
    }

    return new Response(null, { status: 202 })
  }
  const mortem = new Mortem({
    agentId: "agent_01",
    apiKey: "test_api_key",
    fetch: fetchMock,
    flushIntervalMs: 60_000,
    ingestUrl: "https://ingest.test",
  })
  const session = await mortem.startSession({ inputSummary: "test run" })

  await session.run(async () => exercise(mortem))
  await mortem.close()

  return bodies.flatMap((body) => parseBatch(body).items.flatMap((item) => item.events))
}

describe("Mortem SDK wrappers", () => {
  it("captures OpenAI chat completions", async () => {
    const events = await collectEvents(async (mortem) => {
      const openai = mortem.wrapOpenAI({
        chat: {
          completions: {
            create: async () => ({
              choices: [{ finish_reason: "stop", message: { content: "hello" } }],
              usage: { completion_tokens: 2, prompt_tokens: 1, total_tokens: 3 },
            }),
          },
        },
      })

      await openai.chat.completions.create()
    })
    const payload = eventPayload(requireEvent(events, "llm_call"))

    expect(payload.provider).toBe("openai")
  })

  it("captures Anthropic messages", async () => {
    const events = await collectEvents(async (mortem) => {
      const anthropic = mortem.wrapAnthropic({
        messages: {
          create: async () => ({
            content: [{ text: "hello", type: "text" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 2 },
          }),
        },
      })

      await anthropic.messages.create({ model: "claude-sonnet-4-20250514" })
    })
    const payload = eventPayload(requireEvent(events, "llm_call"))

    expect(payload.provider).toBe("anthropic")
  })

  it("captures Ollama chats with zero cost", async () => {
    const events = await collectEvents(async (mortem) => {
      const ollama = mortem.wrapOllama({
        chat: async () => ({
          done_reason: "stop",
          eval_count: 2,
          message: { content: "hello" },
          prompt_eval_count: 1,
        }),
      })

      await ollama.chat({ model: "qwen2.5:72b" })
    })
    const payload = eventPayload(requireEvent(events, "llm_call"))

    expect(payload.provider).toBe("ollama")
    expect(payload.costUsd).toBe(0)
  })

  it("captures Vercel AI tools and language models", async () => {
    const events = await collectEvents(async (mortem) => {
      const tools = mortem.wrapTools({
        search: {
          execute: async (input: unknown) => ({ input, ok: true }),
        },
      })
      const model = mortem.wrapLanguageModel({
        doGenerate: async () => ({ text: "done" }),
        modelId: "test-model",
      })

      await tools.search.execute({ q: "solana" })
      await model.doGenerate({ prompt: "hello" })
    })

    expect(events.some((event) => event.type === "tool_call")).toBe(true)
    expect(events.some((event) => event.type === "llm_call")).toBe(true)
  })

  it("captures LangChain callback events", async () => {
    const events = await collectEvents(async (mortem) => {
      const handler = mortem.langchainHandler() as HandlerLike

      handler.handleLLMStart({ model: "langchain-test" }, ["hello"], "run_01")
      handler.handleLLMEnd({ generations: [] }, "run_01")
    })

    expect(events.some((event) => event.type === "llm_call")).toBe(true)
  })

  it("captures Solana send calls", async () => {
    const events = await collectEvents(async (mortem) => {
      const connection = mortem.wrapConnection({
        confirmTransaction: async () => ({ value: { confirmationStatus: "confirmed" } }),
        rpcEndpoint: "https://devnet.helius-rpc.com",
        sendRawTransaction: async () => "tx_signature",
      })

      await connection.sendRawTransaction(new Uint8Array([1, 2, 3]))
    })
    const payload = eventPayload(requireEvent(events, "solana_tx"))

    expect(payload.signature).toBe("tx_signature")
  })
})

describe("Mortem SDK buffer", () => {
  it("sends the verify token only on the first flush", async () => {
    const bodies: Buffer[] = []
    const fetchMock: typeof fetch = async (_input, init) => {
      const body = init?.body

      if (body instanceof Uint8Array) {
        bodies.push(Buffer.from(body))
      }

      return new Response(null, { status: 202 })
    }
    const mortem = new Mortem({
      agentId: "agent_01",
      apiKey: "test_api_key",
      fetch: fetchMock,
      flushIntervalMs: 60_000,
      ingestUrl: "https://ingest.test",
      verifyToken: "mrt_verify_a3f9c2d1",
    })

    const firstSession = await mortem.startSession({ inputSummary: "first run" })
    const firstEvent = firstSession.beginEvent("custom", { name: "first", data: null })
    firstEvent.complete()
    await firstSession.complete()
    await mortem.flush()

    const secondSession = await mortem.startSession({ inputSummary: "second run" })
    const secondEvent = secondSession.beginEvent("custom", { name: "second", data: null })
    secondEvent.complete()
    await secondSession.complete()
    await mortem.close()

    expect(bodies).toHaveLength(2)

    const firstBatch = parseBatch(bodies[0] as Buffer)
    const secondBatch = parseBatch(bodies[1] as Buffer)

    expect(firstBatch.agentId).toBe("agent_01")
    expect(firstBatch.verifyToken).toBe("mrt_verify_a3f9c2d1")
    expect(secondBatch.agentId).toBeUndefined()
    expect(secondBatch.verifyToken).toBeUndefined()
  })

  it("does not propagate ingest failures", async () => {
    const fetchMock: typeof fetch = async () => {
      throw new Error("network down")
    }
    const mortem = new Mortem({
      agentId: "agent_01",
      apiKey: "test_api_key",
      fetch: fetchMock,
      flushIntervalMs: 60_000,
      ingestUrl: "https://ingest.test",
    })
    const session = await mortem.startSession({ inputSummary: "test run" })

    const event = session.beginEvent("custom", { name: "test", data: null })
    event.complete()

    await expect(session.complete()).resolves.toBeUndefined()
    await expect(mortem.close()).resolves.toBeUndefined()
  })
})
