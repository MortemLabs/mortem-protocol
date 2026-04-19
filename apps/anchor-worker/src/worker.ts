// Worker logic turns queued trace IDs into ordered Merkle batches per agent. On-chain transaction
// submission is intentionally separate so PDA wiring can land in its own commit.
import prisma from "@mortemlabs/db"
import { getMerkleProof, getMerkleRoot } from "@mortemlabs/shared"
import { getAnchorWorkerEnv } from "./env.js"
import { commitPreparedBatch } from "./onchain.js"
import { type RedisLike, getRedis } from "./redis.js"

export interface PreparedAnchorBatch {
  agentId: string
  agentPda: string
  merkleRoot: string
  proofs: Array<{
    merkleProof: string
    traceId: string
  }>
  traceCount: number
  userPda: string
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

export const preparePendingBatches = async (
  traceIds: readonly string[],
): Promise<PreparedAnchorBatch[]> => {
  const env = getAnchorWorkerEnv()
  const ids = unique(traceIds).slice(0, env.maxBatchSize)

  if (ids.length === 0) {
    return []
  }

  const traces = await prisma.trace.findMany({
    orderBy: { startedAt: "asc" },
    select: {
      agent: {
        select: {
          registryPda: true,
          userPda: true,
        },
      },
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
      agentPda: string
      hash: string
      id: string
      userPda: string
    }>
  >()

  for (const trace of traces) {
    if (
      trace.traceHash === null ||
      trace.agent.userPda === null ||
      trace.agent.registryPda === null
    ) {
      continue
    }

    const existing = grouped.get(trace.agentId) ?? []
    existing.push({
      agentPda: trace.agent.registryPda,
      hash: trace.traceHash,
      id: trace.id,
      userPda: trace.agent.userPda,
    })
    grouped.set(trace.agentId, existing)
  }

  return [...grouped.entries()].map(([agentId, agentTraces]) => {
    const hashes = agentTraces.map((trace) => trace.hash)

    return {
      agentId,
      agentPda: agentTraces[0]?.agentPda ?? "",
      merkleRoot: getMerkleRoot(hashes),
      proofs: agentTraces.map((trace, index) => ({
        merkleProof: JSON.stringify(getMerkleProof(hashes, index)),
        traceId: trace.id,
      })),
      traceCount: agentTraces.length,
      userPda: agentTraces[0]?.userPda ?? "",
    }
  })
}

export const runAnchorWorkerOnce = async (
  redis: RedisLike = getRedis(),
): Promise<PreparedAnchorBatch[]> => {
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
