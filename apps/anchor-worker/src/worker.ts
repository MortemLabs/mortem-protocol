// Worker logic turns queued trace IDs into ordered Merkle batches per agent. Solana memo
// submission is intentionally separate so batching stays testable without an RPC dependency.
import prisma from "@mortemlabs/db"
import { getMerkleProof, getMerkleRoot } from "@mortemlabs/shared"
import { commitPreparedBatch } from "./commit.js"
import { getAnchorWorkerEnv } from "./env.js"
import { type RedisLike, getRedis } from "./redis.js"

export interface PreparedMemoBatch {
  agentId: string
  merkleRoot: string
  proofs: Array<{
    merkleProof: string
    traceId: string
  }>
  traceCount: number
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

export const preparePendingBatches = async (
  traceIds: readonly string[],
): Promise<PreparedMemoBatch[]> => {
  const env = getAnchorWorkerEnv()
  const ids = unique(traceIds).slice(0, env.maxBatchSize)

  if (ids.length === 0) {
    return []
  }

  const traces = await prisma.trace.findMany({
    orderBy: { startedAt: "asc" },
    select: {
      agentId: true,
      id: true,
      traceHash: true,
    },
    where: {
      id: { in: ids },
      traceHash: { not: null },
    },
  })
  const grouped = new Map<
    string,
    Array<{
      hash: string
      id: string
    }>
  >()

  for (const trace of traces) {
    if (trace.traceHash === null) {
      continue
    }

    const existing = grouped.get(trace.agentId) ?? []
    existing.push({
      hash: trace.traceHash,
      id: trace.id,
    })
    grouped.set(trace.agentId, existing)
  }

  return [...grouped.entries()].map(([agentId, agentTraces]) => {
    const hashes = agentTraces.map((trace) => trace.hash)

    return {
      agentId,
      merkleRoot: getMerkleRoot(hashes),
      proofs: agentTraces.map((trace, index) => ({
        merkleProof: JSON.stringify(getMerkleProof(hashes, index)),
        traceId: trace.id,
      })),
      traceCount: agentTraces.length,
    }
  })
}

export const runAnchorWorkerOnce = async (
  redis: RedisLike = getRedis(),
): Promise<PreparedMemoBatch[]> => {
  const pending = await redis.lrange<string>("anchor:pending", 0, -1)
  const batches = await preparePendingBatches(pending)

  for (const batch of batches) {
    await commitPreparedBatch(batch, redis)
  }

  return batches
}

export const startAnchorWorker = (): ReturnType<typeof setInterval> => {
  const env = getAnchorWorkerEnv()

  return setInterval(() => {
    void runAnchorWorkerOnce()
  }, env.intervalMs)
}
