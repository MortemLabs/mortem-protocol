// Pyth market helpers fetch benchmark price snapshots with a short memory cache. Network failures
// return cached data when available and otherwise degrade to an empty result.
import type { MarketContext } from "@mortemlabs/shared"

type PythPrices = MarketContext["pythPrices"]
type MutableRecord = Record<PropertyKey, unknown>

export interface FetchPythPricesOptions {
  fetchImpl?: typeof fetch | undefined
  baseUrl?: string | undefined
  nowMs?: number | undefined
}

const DEFAULT_BASE_URL = "https://benchmarks.pyth.network/v1/price_feeds"
const CACHE_TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 5_000

const cache = new Map<string, { expiresAt: number; value: PythPrices }>()

const isRecord = (value: unknown): value is MutableRecord =>
  value !== null && typeof value === "object"

const numberFromRecord = (record: MutableRecord, key: string): number | undefined => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const buildCacheKey = (symbols: readonly string[]): string => [...symbols].sort().join(",")

const readPriceRecord = (
  symbol: string,
  value: unknown,
  capturedAt: number,
): PythPrices[string] => {
  const record = isRecord(value) ? value : {}
  const priceRecord = isRecord(record.price) ? record.price : record

  return {
    attestation:
      stringFromRecord(record, "attestation") ?? stringFromRecord(record, "vaa") ?? "unavailable",
    confidence:
      numberFromRecord(priceRecord, "conf") ??
      numberFromRecord(priceRecord, "confidence") ??
      numberFromRecord(record, "confidence") ??
      0,
    exponent:
      numberFromRecord(priceRecord, "expo") ??
      numberFromRecord(priceRecord, "exponent") ??
      numberFromRecord(record, "exponent") ??
      0,
    price:
      numberFromRecord(priceRecord, "price") ??
      numberFromRecord(record, "price") ??
      numberFromRecord(record, symbol) ??
      0,
    publishTime:
      numberFromRecord(priceRecord, "publish_time") ??
      numberFromRecord(priceRecord, "publishTime") ??
      capturedAt,
  }
}

const parsePythResponse = (
  symbols: readonly string[],
  response: unknown,
  capturedAt: number,
): PythPrices => {
  if (Array.isArray(response)) {
    return Object.fromEntries(
      symbols.map((symbol, index) => [
        symbol,
        readPriceRecord(symbol, response[index], capturedAt),
      ]),
    )
  }

  if (!isRecord(response)) {
    return {}
  }

  return Object.fromEntries(
    symbols.map((symbol) => {
      const value = response[symbol] ?? response.data ?? response.price ?? response
      return [symbol, readPriceRecord(symbol, value, capturedAt)]
    }),
  )
}

export const fetchPythPrices = async (
  symbols: readonly string[],
  options: FetchPythPricesOptions = {},
): Promise<PythPrices> => {
  const cacheKey = buildCacheKey(symbols)
  const now = options.nowMs ?? Date.now()
  const cached = cache.get(cacheKey)

  if (cached !== undefined && cached.expiresAt > now) {
    return cached.value
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (fetchImpl === undefined || symbols.length === 0) {
    return cached?.value ?? {}
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const url = new URL(options.baseUrl ?? DEFAULT_BASE_URL)
    url.searchParams.set("ids", symbols.join(","))

    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    })

    if (!response.ok) {
      return cached?.value ?? {}
    }

    const raw = (await response.json()) as unknown
    const value = parsePythResponse(symbols, raw, now)
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value })
    return value
  } catch {
    return cached?.value ?? {}
  } finally {
    clearTimeout(timeout)
  }
}
