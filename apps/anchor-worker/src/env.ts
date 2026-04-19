// Anchor worker environment parsing keeps queue cadence and RPC configuration centralized. Defaults
// are devnet-friendly and safe for local dry runs.
const readInteger = (name: string, fallback: number): number => {
  const value = process.env[name]

  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const getAnchorWorkerEnv = () => ({
  heliusRpcUrl:
    process.env.HELIUS_RPC_URL ??
    (process.env.HELIUS_API_KEY === undefined
      ? "https://api.devnet.solana.com"
      : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`),
  intervalMs: readInteger("ANCHOR_WORKER_INTERVAL_MS", 60_000),
  maxBatchSize: readInteger("ANCHOR_WORKER_MAX_BATCH_SIZE", 100),
  programId: process.env.MORTEM_PROGRAM_ID,
  redisToken: process.env.REDIS_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
  redisUrl: process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL,
})
