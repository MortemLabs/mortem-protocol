// Mortem is the public SDK client that owns buffering and creates trace sessions. Instrumentation
// wrapper methods are intentionally structural so provider packages remain dynamic and optional.
import { MortemBuffer } from "./buffer.js"
import { wrapAnthropicClient } from "./instrument/anthropic.js"
import { createLangChainHandler } from "./instrument/langchain.js"
import { wrapOllamaClient } from "./instrument/ollama.js"
import { wrapOpenAIClient } from "./instrument/openai.js"
import { wrapSolanaConnection } from "./instrument/solana.js"
import { wrapVercelAILanguageModel, wrapVercelAITools } from "./instrument/vercel-ai.js"
import { Session } from "./session.js"
import type {
  Connection,
  LanguageModel,
  MortemCallbackHandler,
  MortemConfig,
  MortemLogger,
  SessionOptions,
} from "./types.js"

const DEFAULT_INGEST_URL = "https://ingest.mortem.dev"
const DEFAULT_FLUSH_INTERVAL_MS = 250
const DEFAULT_MAX_BUFFER_BYTES = 100 * 1024

const warn = (logger: MortemLogger | undefined, message: string): void => {
  try {
    logger?.warn(message)
  } catch {
    // User loggers are outside the SDK trust boundary.
  }
}

interface ResolvedMortemConfig {
  apiKey: string
  agentId?: string | undefined
  enabled: boolean
  flushIntervalMs: number
  ingestUrl: string
  maxBufferBytes: number
  verifyToken?: string | undefined
  environment?: MortemConfig["environment"] | undefined
  fetch?: typeof fetch | undefined
  logger?: MortemLogger | undefined
}

export class Mortem {
  private readonly config: ResolvedMortemConfig
  private readonly buffer: MortemBuffer

  constructor(config: MortemConfig) {
    this.config = {
      apiKey: config.apiKey,
      agentId: config.agentId,
      enabled: config.enabled ?? true,
      environment: config.environment,
      fetch: config.fetch,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      ingestUrl: config.ingestUrl ?? DEFAULT_INGEST_URL,
      logger: config.logger,
      maxBufferBytes: config.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
      verifyToken: config.verifyToken,
    }
    this.buffer = new MortemBuffer({
      agentId: this.config.agentId,
      apiKey: this.config.apiKey,
      enabled: this.config.enabled && this.config.apiKey.length > 0,
      fetchImpl: this.config.fetch,
      flushIntervalMs: this.config.flushIntervalMs,
      ingestUrl: this.config.ingestUrl,
      logger: this.config.logger,
      maxBufferBytes: this.config.maxBufferBytes,
      verifyToken: this.config.verifyToken,
    })

    if (this.config.apiKey.length === 0) {
      warn(this.config.logger, "Mortem SDK disabled because apiKey is empty")
    }

    if ((this.config.verifyToken?.length ?? 0) > 0 && (this.config.agentId?.length ?? 0) === 0) {
      warn(this.config.logger, "Mortem verifyToken ignored because agentId is missing")
    }
  }

  async startSession(options: SessionOptions): Promise<Session> {
    try {
      return new Session(
        {
          agentId: options.agentId ?? this.config.agentId ?? "unknown",
          buffer: this.buffer,
        },
        options,
      )
    } catch {
      warn(this.config.logger, "Mortem session creation failed")
      return new Session(
        {
          agentId: "unknown",
          buffer: this.buffer,
        },
        {
          inputSummary: options.inputSummary,
        },
      )
    }
  }

  wrapOpenAI<T>(client: T): T {
    return wrapOpenAIClient(client)
  }

  wrapAnthropic<T>(client: T): T {
    return wrapAnthropicClient(client)
  }

  wrapOllama<T>(client: T): T {
    return wrapOllamaClient(client)
  }

  wrapTools<T>(tools: T): T {
    return wrapVercelAITools(tools)
  }

  wrapLanguageModel<T extends LanguageModel>(model: T): T {
    return wrapVercelAILanguageModel(model)
  }

  langchainHandler(): MortemCallbackHandler {
    return createLangChainHandler()
  }

  wrapConnection<T extends Connection>(conn: T): T {
    return wrapSolanaConnection(conn)
  }

  async flush(): Promise<void> {
    await this.buffer.flush()
  }

  async close(): Promise<void> {
    await this.buffer.close()
  }
}
