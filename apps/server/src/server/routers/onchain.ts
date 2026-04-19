// On-chain procedures derive PDAs and build unsigned transactions for client-side Phantom signing.
// The server never signs user registration transactions; backend signing is reserved for commit_batch.
import { createHash } from "node:crypto"
import prisma from "@mortemlabs/db"
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import { z } from "zod"
import {
  deriveAgentRegistryPda,
  deriveAnchorBatchPda,
  deriveUserRegistryPda,
} from "../../lib/pda.js"
import { generateSolanaPayQr } from "../../lib/qr.js"
import { createTRPCRouter, protectedProcedure } from "../trpc.js"

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

      const traces = await prisma.trace.findMany({
        distinct: ["anchorSignature"],
        orderBy: { startedAt: "desc" },
        select: {
          anchorSignature: true,
          anchorSlot: true,
          traceHash: true,
        },
        where: {
          agentId: input.agentId,
          anchorSignature: { not: null },
        },
      })

      return Promise.all(
        traces.map(async (trace, index) => {
          const batchIndex = BigInt(index)
          const agent = await prisma.agent.findUnique({ where: { id: input.agentId } })
          const batchPda =
            agent?.registryPda === null || agent?.registryPda === undefined
              ? null
              : (
                  await deriveAnchorBatchPda(agent.registryPda, batchIndex, programId())
                )[0].toBase58()

          return {
            batchIndex: index,
            batchPda,
            explorerLink:
              trace.anchorSignature === null
                ? null
                : `https://explorer.solana.com/tx/${trace.anchorSignature}?cluster=devnet`,
            merkleRoot: trace.traceHash,
            slot: trace.anchorSlot?.toString() ?? null,
            traceCount: 1,
          }
        }),
      )
    }),
})
