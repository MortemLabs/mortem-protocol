// On-chain commit helpers build and submit Mortem commit_batch instructions. FundingRequired
// failures are treated as graceful skips so traces remain pending until the user tops up their PDA.
import { createHash } from "node:crypto"
import prisma from "@mortemlabs/db"
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import bs58 from "bs58"
import { getAnchorWorkerEnv } from "./env.js"
import { deriveAnchorBatchPda } from "./pda.js"
import type { RedisLike } from "./redis.js"
import type { PreparedAnchorBatch } from "./worker.js"

export interface CommitBatchResult {
  signature: string
  slot: bigint | null
}

const PRIORITY_FEE_MICROLAMPORTS = 50_000

const instructionDiscriminator = (name: string): Buffer =>
  createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)

const encodeCommitBatchData = (merkleRoot: string, traceCount: number): Buffer => {
  const root = Buffer.from(merkleRoot, "hex")
  const count = Buffer.alloc(4)
  count.writeUInt32LE(traceCount)
  return Buffer.concat([instructionDiscriminator("commit_batch"), root, count])
}

const readCommitter = (): Keypair | undefined => {
  const secret = process.env.ANCHOR_WALLET_SECRET_KEY

  if (secret === undefined) {
    return undefined
  }

  try {
    return Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    try {
      const parsed = JSON.parse(secret) as unknown
      return Array.isArray(parsed)
        ? Keypair.fromSecretKey(Uint8Array.from(parsed.map((value) => Number(value))))
        : undefined
    } catch {
      return undefined
    }
  }
}

const nextBatchIndex = async (agentId: string): Promise<bigint> => {
  const anchoredBatches = await prisma.trace.findMany({
    distinct: ["anchorSignature"],
    select: { anchorSignature: true },
    where: {
      agentId,
      anchorSignature: { not: null },
    },
  })

  return BigInt(anchoredBatches.length)
}

const isFundingRequired = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("FundingRequired")

export const commitPreparedBatch = async (
  batch: PreparedAnchorBatch,
  redis: RedisLike,
): Promise<CommitBatchResult | undefined> => {
  const env = getAnchorWorkerEnv()
  const committer = readCommitter()

  if (env.programId === undefined || committer === undefined) {
    return undefined
  }

  const connection = new Connection(env.heliusRpcUrl, "confirmed")
  const programId = new PublicKey(env.programId)
  const batchIndex = await nextBatchIndex(batch.agentId)
  const [anchorBatchPda] = deriveAnchorBatchPda(batch.agentPda, batchIndex, env.programId)
  const instruction = new TransactionInstruction({
    data: encodeCommitBatchData(batch.merkleRoot, batch.traceCount),
    keys: [
      { isSigner: false, isWritable: true, pubkey: new PublicKey(batch.userPda) },
      { isSigner: false, isWritable: true, pubkey: new PublicKey(batch.agentPda) },
      { isSigner: false, isWritable: true, pubkey: anchorBatchPda },
      { isSigner: true, isWritable: true, pubkey: committer.publicKey },
      { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
    ],
    programId,
  })
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
    instruction,
  )

  try {
    const signature = await sendAndConfirmTransaction(connection, transaction, [committer], {
      commitment: "confirmed",
    })
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    })
    const slot = status.value?.slot === undefined ? null : BigInt(status.value.slot)

    await prisma.$transaction(
      batch.proofs.map((proof) =>
        prisma.trace.update({
          data: {
            anchorSignature: signature,
            anchorSlot: slot,
            merkleProof: proof.merkleProof,
          },
          where: { id: proof.traceId },
        }),
      ),
    )

    for (const proof of batch.proofs) {
      await redis.lrem("anchor:pending", 0, proof.traceId)
    }

    return { signature, slot }
  } catch (error) {
    if (isFundingRequired(error)) {
      return undefined
    }

    return undefined
  }
}
