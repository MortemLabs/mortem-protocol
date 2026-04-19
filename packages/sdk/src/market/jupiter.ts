// Jupiter helpers capture route quotes and hash the raw API response for later verification. Calls
// use a bounded timeout and return undefined instead of throwing on network or parsing failures.
import type { MarketContext } from "@mortemlabs/shared"
import { sha256 } from "@mortemlabs/shared"

type JupiterRoute = MarketContext["jupiterRoutes"][string]
type MutableRecord = Record<PropertyKey, unknown>

export interface FetchJupiterQuoteInput {
  inputMint: string
  outputMint: string
  amount: string
  slippageBps?: number | undefined
}

export interface FetchJupiterQuoteOptions {
  fetchImpl?: typeof fetch | undefined
  baseUrl?: string | undefined
  nowMs?: number | undefined
}

const DEFAULT_BASE_URL = "https://quote-api.jup.ag/v6/quote"
const REQUEST_TIMEOUT_MS = 5_000

const isRecord = (value: unknown): value is MutableRecord =>
  value !== null && typeof value === "object"

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const numberFromRecord = (record: MutableRecord, key: string): number | undefined => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const routeKey = ({ amount, inputMint, outputMint }: FetchJupiterQuoteInput): string =>
  `${inputMint}:${outputMint}:${amount}`

const parseRoute = (
  input: FetchJupiterQuoteInput,
  rawText: string,
  parsed: unknown,
  capturedAtMs: number,
): JupiterRoute | undefined => {
  if (!isRecord(parsed)) {
    return undefined
  }

  return {
    capturedAtMs,
    inAmount: stringFromRecord(parsed, "inAmount") ?? input.amount,
    inputMint: stringFromRecord(parsed, "inputMint") ?? input.inputMint,
    outAmount: stringFromRecord(parsed, "outAmount") ?? "0",
    outputMint: stringFromRecord(parsed, "outputMint") ?? input.outputMint,
    priceImpactPct: numberFromRecord(parsed, "priceImpactPct") ?? 0,
    responseHash: sha256(rawText),
    routePlan: Array.isArray(parsed.routePlan) ? parsed.routePlan : [],
  }
}

export const fetchJupiterQuote = async (
  input: FetchJupiterQuoteInput,
  options: FetchJupiterQuoteOptions = {},
): Promise<Record<string, JupiterRoute>> => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (fetchImpl === undefined) {
    return {}
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const url = new URL(options.baseUrl ?? DEFAULT_BASE_URL)
    url.searchParams.set("inputMint", input.inputMint)
    url.searchParams.set("outputMint", input.outputMint)
    url.searchParams.set("amount", input.amount)

    if (input.slippageBps !== undefined) {
      url.searchParams.set("slippageBps", String(input.slippageBps))
    }

    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    })

    if (!response.ok) {
      return {}
    }

    const rawText = await response.text()
    const parsed = JSON.parse(rawText) as unknown
    const route = parseRoute(input, rawText, parsed, options.nowMs ?? Date.now())

    return route === undefined ? {} : { [routeKey(input)]: route }
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}
