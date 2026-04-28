// MortemBuffer batches trace updates, gzips them, and retries ingestion without surfacing errors
// into agent code. Failed flushes are warned about and dropped after bounded retries.
import { gzipSync } from "node:zlib"
import { ulid } from "ulid"
import type { BufferBatchItem, MortemLogger, TransportBatchPayload } from "./types.js"

export interface MortemBufferOptions {
  agentId?: string | undefined
  ingestUrl: string
  apiKey: string
  enabled: boolean
  flushIntervalMs: number
  maxBufferBytes: number
  fetchImpl?: typeof fetch | undefined
  logger?: MortemLogger | undefined
  verifyToken?: string | undefined
}

const MAX_RETRIES = 3
const REQUEST_TIMEOUT_MS = 5_000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const stringifyForTransport = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  )

const byteLength = (value: unknown): number =>
  Buffer.byteLength(stringifyForTransport(value), "utf8")

export class MortemBuffer {
  private readonly options: MortemBufferOptions
  private readonly endpoint: string
  private readonly queue: BufferBatchItem[] = []
  private flushPromise: Promise<void> | undefined
  private queuedBytes = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private verifyTokenSent = false

  constructor(options: MortemBufferOptions) {
    this.options = options
    this.endpoint = `${options.ingestUrl.replace(/\/+$/u, "")}/v1/traces/batch`

    if (options.enabled) {
      this.timer = setInterval(() => {
        void this.flush()
      }, options.flushIntervalMs)
      this.unrefTimer()
    }
  }

  enqueue(item: BufferBatchItem): void {
    if (!this.options.enabled) {
      return
    }

    try {
      this.queue.push(item)
      this.queuedBytes += byteLength(item)

      if (this.queuedBytes >= this.options.maxBufferBytes) {
        void this.flush()
      }
    } catch {
      this.warn("Mortem buffer enqueue failed")
    }
  }

  async flush(): Promise<void> {
    if (!this.options.enabled) {
      return
    }

    if (this.flushPromise !== undefined) {
      await this.flushPromise
      return
    }

    if (this.queue.length === 0) {
      return
    }

    this.flushPromise = this.runFlush()
    await this.flushPromise
  }

  async close(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }

    await this.flush()
  }

  private async runFlush(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.queue.length)
        this.queuedBytes = 0
        await this.sendWithRetries(batch)
      }
    } catch {
      this.warn("Mortem buffer flush failed")
    } finally {
      this.flushPromise = undefined
    }
  }

  private async sendWithRetries(batch: BufferBatchItem[]): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch

    if (fetchImpl === undefined) {
      this.warn("Mortem ingest fetch unavailable")
      return
    }

    const payload: TransportBatchPayload = {
      batchId: ulid(),
      items: batch,
    }

    if (
      !this.verifyTokenSent &&
      (this.options.verifyToken?.length ?? 0) > 0 &&
      (this.options.agentId?.length ?? 0) > 0
    ) {
      payload.agentId = this.options.agentId
      payload.verifyToken = this.options.verifyToken
      this.verifyTokenSent = true
    }

    const body = gzipSync(Buffer.from(stringifyForTransport(payload), "utf8"))

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      const sent = await this.sendOnce(fetchImpl, body)

      if (sent) {
        return
      }

      if (attempt < MAX_RETRIES) {
        await sleep(100 * attempt)
      }
    }

    this.warn("Mortem ingest rejected buffered events")
  }

  private async sendOnce(fetchImpl: typeof fetch, body: Buffer): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-encoding": "gzip",
          "content-type": "application/json",
          "x-mortem-api-key": this.options.apiKey,
        },
        body,
        signal: controller.signal,
      })

      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  }

  private warn(message: string): void {
    try {
      this.options.logger?.warn(message)
    } catch {
      // Never let user-provided logging break agent execution.
    }
  }

  private unrefTimer(): void {
    const timer = this.timer

    if (typeof timer !== "object" || timer === null || !("unref" in timer)) {
      return
    }

    const unref = timer.unref

    if (typeof unref === "function") {
      unref.call(timer)
    }
  }
}
