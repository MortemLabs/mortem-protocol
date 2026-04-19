// Public verification procedures power share pages without requiring browser auth. They return the
// shared trace, ordered events, analysis, and best-effort Merkle metadata.
import prisma from "@mortemlabs/db"
import { verifyMerkleProof } from "@mortemlabs/shared"
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../trpc.js"

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
    const verification =
      trace.traceHash === null
        ? { anchored: false, merkleProofValid: false, proof }
        : {
            anchorSignature: trace.anchorSignature,
            anchorSlot: trace.anchorSlot?.toString() ?? null,
            anchored: trace.anchorSignature !== null,
            merkleProofValid:
              proof.length === 0
                ? false
                : verifyMerkleProof(trace.traceHash, proof, trace.traceHash),
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
