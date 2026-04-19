// Public verification procedures power share pages without requiring browser auth. They return the
// shared trace, ordered events, analysis, and best-effort Merkle metadata.
import prisma from "@mortemlabs/db"
import { getMerkleRoot, verifyMerkleProof } from "@mortemlabs/shared"
import { Connection } from "@solana/web3.js"
import { z } from "zod"
import { fetchAnchorBatchesByAgent } from "../../lib/anchor-batch"
import { createTRPCRouter, publicProcedure } from "../trpc"

const parseProof = (value: string | null): string[] => {
  if (value === null) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : []
  } catch {
    return []
  }
}

const programId = (): string | undefined =>
  process.env.MORTEM_PROGRAM_ID ?? process.env.NEXT_PUBLIC_MORTEM_PROGRAM_ID

const connection = (): Connection =>
  new Connection(
    process.env.HELIUS_RPC_URL ??
      (process.env.HELIUS_API_KEY === undefined
        ? "https://api.devnet.solana.com"
        : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`),
    "confirmed",
  )

const getDbMerkleRoot = async (
  agentId: string,
  anchorSignature: string | null,
): Promise<string | null> => {
  if (anchorSignature === null) {
    return null
  }

  const traces = await prisma.trace.findMany({
    orderBy: { startedAt: "asc" },
    select: { traceHash: true },
    where: {
      agentId,
      anchorSignature,
      traceHash: { not: null },
    },
  })
  const hashes = traces.flatMap((trace) => (trace.traceHash === null ? [] : [trace.traceHash]))

  return hashes.length === 0 ? null : getMerkleRoot(hashes)
}

const hasOnChainRoot = async ({
  agentPda,
  merkleRoot,
}: {
  agentPda: string | null
  merkleRoot: string | null
}): Promise<boolean> => {
  const id = programId()

  if (agentPda === null || merkleRoot === null || id === undefined) {
    return false
  }

  try {
    const batches = await fetchAnchorBatchesByAgent({
      agentPda,
      connection: connection(),
      programId: id,
    })
    return batches.some((batch) => batch.merkleRoot === merkleRoot)
  } catch {
    return false
  }
}

export const verifyRouter = createTRPCRouter({
  byShareToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const trace = await prisma.trace.findUnique({
      include: {
        agent: { select: { registryPda: true } },
        analysis: true,
        events: { orderBy: { sequence: "asc" } },
      },
      where: { shareToken: input.token },
    })

    if (trace === null) {
      return null
    }

    const proof = parseProof(trace.merkleProof)
    const merkleRoot = await getDbMerkleRoot(trace.agentId, trace.anchorSignature)
    const merkleProofValid =
      trace.traceHash === null || merkleRoot === null
        ? false
        : verifyMerkleProof(trace.traceHash, proof, merkleRoot)
    const onChainRootMatched = await hasOnChainRoot({
      agentPda: trace.agent.registryPda,
      merkleRoot,
    })
    const verification =
      trace.traceHash === null
        ? { anchored: false, merkleProofValid: false, proof }
        : {
            anchorSignature: trace.anchorSignature,
            anchorSlot: trace.anchorSlot?.toString() ?? null,
            anchored: trace.anchorSignature !== null,
            merkleProofValid,
            merkleRoot,
            onChainRootMatched,
            proof,
            traceHash: trace.traceHash,
          }

    return {
      analysis: trace.analysis,
      events: trace.events,
      trace,
      verification,
    }
  }),
})
