// On-chain procedures derive PDAs and build unsigned transactions for client-side Phantom signing.
// The server never signs user registration transactions; backend signing is reserved for commit_batch.
import { createHash } from "node:crypto"
import prisma from "@mortemlabs/db"
import { getMerkleRoot } from "@mortemlabs/shared"
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import { z } from "zod"
import { fetchAnchorBatchesByAgent } from "../../lib/anchor-batch"
import { deriveAgentRegistryPda, deriveUserRegistryPda } from "../../lib/pda"
import { generateSolanaPayQr } from "../../lib/qr"
import { createTRPCRouter, protectedProcedure } from "../trpc"

const PRIORITY_FEE_MICROLAMPORTS = 50_000
const DEFAULT_MINIMUM_PDA_LAMPORTS = 5_000_000

const programId = (): string => {
  const id = process.env.MORTEM_PROGRAM_ID ?? process.env.NEXT_PUBLIC_MORTEM_PROGRAM_ID

  if (id === undefined) {
    throw new Error("MORTEM_PROGRAM_ID is not configured")
  }

  return id
}

const connection = (): Connection =>
  new Connection(
    process.env.HELIUS_RPC_URL ??
      (process.env.HELIUS_API_KEY === undefined
        ? "https://api.devnet.solana.com"
        : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`),
    "confirmed",
  )

const instructionDiscriminator = (name: string): Buffer =>
  createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)

const displayNameBytes = (displayName: string): Buffer => {
  const output = Buffer.alloc(32)
  Buffer.from(displayName).copy(output, 0, 0, 32)
  return output
}

const displayNameHash = (displayName: string): Buffer =>
  createHash("sha256").update(displayName).digest()

const txBase64 = async (tx: Transaction, feePayer: PublicKey): Promise<string> => {
  const { blockhash } = await connection().getLatestBlockhash("confirmed")
  tx.feePayer = feePayer
  tx.recentBlockhash = blockhash
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")
}

const minimumPdaLamports = (): number =>
  Number.parseInt(process.env.MINIMUM_PDA_LAMPORTS ?? String(DEFAULT_MINIMUM_PDA_LAMPORTS), 10)

const assertAccess = async (agentId: string, userId: string): Promise<boolean> => {
  const agent = await prisma.agent.findFirst({
    select: { id: true },
    where: {
      id: agentId,
      OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
    },
  })

  return agent !== null
}

const buildDbBatchLookup = async (
  agentId: string,
): Promise<Map<string, { explorerLink: string | null; slot: string | null }>> => {
  const traces = await prisma.trace.findMany({
    orderBy: { startedAt: "asc" },
    select: {
      anchorSignature: true,
      anchorSlot: true,
      traceHash: true,
    },
    where: {
      agentId,
      anchorSignature: { not: null },
      traceHash: { not: null },
    },
  })
  const grouped = new Map<
    string,
    Array<{ anchorSlot: bigint | null; hash: string; signature: string }>
  >()

  for (const trace of traces) {
    if (trace.anchorSignature === null || trace.traceHash === null) {
      continue
    }

    const existing = grouped.get(trace.anchorSignature) ?? []
    existing.push({
      anchorSlot: trace.anchorSlot,
      hash: trace.traceHash,
      signature: trace.anchorSignature,
    })
    grouped.set(trace.anchorSignature, existing)
  }

  const lookup = new Map<string, { explorerLink: string | null; slot: string | null }>()

  for (const items of grouped.values()) {
    const root = getMerkleRoot(items.map((item) => item.hash))
    const signature = items[0]?.signature ?? null

    lookup.set(root, {
      explorerLink:
        signature === null ? null : `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      slot: items[0]?.anchorSlot?.toString() ?? null,
    })
  }

  return lookup
}

export const onchainRouter = createTRPCRouter({
  getUserPdaInfo: protectedProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const [pda] = await deriveUserRegistryPda(input.wallet, programId())
      const balance = await connection().getBalance(pda, "confirmed")
      const requiredLamports = minimumPdaLamports()

      return {
        balance,
        funded: balance >= requiredLamports,
        pdaAddress: pda.toBase58(),
        qr: await generateSolanaPayQr(pda.toBase58(), requiredLamports),
      }
    }),

  buildRegisterUserTx: protectedProcedure
    .input(z.object({ displayName: z.string().default("Mortem User"), wallet: z.string() }))
    .mutation(async ({ input }) => {
      const owner = new PublicKey(input.wallet)
      const [userPda] = await deriveUserRegistryPda(input.wallet, programId())
      const ix = new TransactionInstruction({
        data: Buffer.concat([
          instructionDiscriminator("register_user"),
          displayNameBytes(input.displayName),
        ]),
        keys: [
          { isSigner: true, isWritable: true, pubkey: owner },
          { isSigner: false, isWritable: true, pubkey: userPda },
          { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
        ],
        programId: new PublicKey(programId()),
      })
      const tx = new Transaction().add(ix)

      return { txBase64: await txBase64(tx, owner) }
    }),

  buildRegisterAgentTx: protectedProcedure
    .input(z.object({ agentId: z.string(), wallet: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await assertAccess(input.agentId, ctx.userId))) {
        return null
      }

      const agent = await prisma.agent.findUniqueOrThrow({ where: { id: input.agentId } })
      const owner = new PublicKey(input.wallet)
      const [userPda] = await deriveUserRegistryPda(input.wallet, programId())
      const [agentPda] = await deriveAgentRegistryPda(
        userPda.toBase58(),
        displayNameHash(agent.displayName),
        programId(),
      )
      const ix = new TransactionInstruction({
        data: Buffer.concat([
          instructionDiscriminator("register_agent"),
          displayNameBytes(agent.displayName),
          owner.toBuffer(),
        ]),
        keys: [
          { isSigner: true, isWritable: true, pubkey: owner },
          { isSigner: false, isWritable: true, pubkey: userPda },
          { isSigner: false, isWritable: true, pubkey: agentPda },
          { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
        ],
        programId: new PublicKey(programId()),
      })
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
        ix,
      )

      return { txBase64: await txBase64(tx, owner) }
    }),

  confirmRegistration: protectedProcedure
    .input(
      z.object({ agentId: z.string().optional(), txSignature: z.string(), wallet: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      const status = await connection().getSignatureStatus(input.txSignature, {
        searchTransactionHistory: true,
      })

      if (
        status.value?.confirmationStatus !== "confirmed" &&
        status.value?.confirmationStatus !== "finalized"
      ) {
        return false
      }

      const [userPda] = await deriveUserRegistryPda(input.wallet, programId())
      await prisma.user.update({
        data: { pdaFunded: true, userPda: userPda.toBase58() },
        where: { id: ctx.userId },
      })

      if (input.agentId !== undefined && (await assertAccess(input.agentId, ctx.userId))) {
        const agent = await prisma.agent.findUniqueOrThrow({ where: { id: input.agentId } })
        const [agentPda] = await deriveAgentRegistryPda(
          userPda.toBase58(),
          displayNameHash(agent.displayName),
          programId(),
        )

        await prisma.agent.update({
          data: { registryPda: agentPda.toBase58(), userPda: userPda.toBase58() },
          where: { id: input.agentId },
        })
      }

      return true
    }),

  getPdaFundingQr: protectedProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const [pda] = await deriveUserRegistryPda(input.wallet, programId())
      return generateSolanaPayQr(pda.toBase58(), minimumPdaLamports())
    }),

  getAnchorHistory: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await assertAccess(input.agentId, ctx.userId))) {
        return []
      }

      const agent = await prisma.agent.findUnique({
        select: {
          registryPda: true,
        },
        where: { id: input.agentId },
      })

      if (agent?.registryPda === null || agent?.registryPda === undefined) {
        return []
      }

      const [batches, dbLookup] = await Promise.all([
        fetchAnchorBatchesByAgent({
          agentPda: agent.registryPda,
          connection: connection(),
          programId: programId(),
        }),
        buildDbBatchLookup(input.agentId),
      ])

      return batches.map((batch) => {
        const db = dbLookup.get(batch.merkleRoot)

        return {
          batchIndex: batch.batchIndex,
          batchPda: batch.batchPda,
          committedAt: batch.committedAt,
          explorerLink: db?.explorerLink ?? null,
          merkleRoot: batch.merkleRoot,
          slot: db?.slot ?? null,
          traceCount: batch.traceCount,
        }
      })
    }),
})
