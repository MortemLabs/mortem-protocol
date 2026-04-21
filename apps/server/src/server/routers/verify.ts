// Public verification procedures power share pages without requiring browser auth. They return the
// shared trace, ordered events, analysis, and best-effort memo-anchor metadata.
import prisma from "@mortemlabs/db"
import { getMerkleRoot, verifyMerkleProof } from "@mortemlabs/shared"
import { z } from "zod"
import { fetchMemoAnchor } from "../../lib/memo-anchor"
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

export const verifyRouter = createTRPCRouter({
  byShareToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const trace = await prisma.trace.findUnique({
      include: {
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
    const memoAnchor =
      trace.anchorSignature === null ? null : await fetchMemoAnchor(trace.anchorSignature)
    const merkleProofValid =
      trace.traceHash === null || merkleRoot === null
        ? false
        : verifyMerkleProof(trace.traceHash, proof, merkleRoot)
    const onChainRootMatched =
      merkleRoot !== null && memoAnchor !== null && memoAnchor.payload.merkleRoot === merkleRoot
    const verification =
      trace.traceHash === null
        ? { anchored: false, merkleProofValid: false, proof }
        : {
            anchorSignature: trace.anchorSignature,
            anchorSlot: trace.anchorSlot?.toString() ?? memoAnchor?.slot ?? null,
            anchored: trace.anchorSignature !== null,
            batchIndex: memoAnchor?.payload.batchIndex ?? null,
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
