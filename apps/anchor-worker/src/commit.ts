// Memo commit helpers anchor Merkle roots in a native Solana memo transaction. Failures are logged
// as best-effort skips so pending traces can be retried on the next worker interval.
import prisma from "@mortemlabs/db"
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import bs58 from "bs58"
import { getAnchorWorkerEnv } from "./env.js"
import type { RedisLike } from "./redis.js"
import type { PreparedMemoBatch } from "./worker.js"

export interface CommitBatchResult {
  signature: string
  slot: bigint | null
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

const readCommitter = (): Keypair | undefined => {
  const secret = getAnchorWorkerEnv().signerSecretKey

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

const nextBatchIndex = async (agentId: string): Promise<number> => {
  const anchoredBatches = await prisma.trace.findMany({
    distinct: ["anchorSignature"],
    select: { anchorSignature: true },
    where: {
      agentId,
      anchorSignature: { not: null },
    },
  })

  return anchoredBatches.length
}

export const commitPreparedBatch = async (
  batch: PreparedMemoBatch,
  redis: RedisLike,
): Promise<CommitBatchResult | undefined> => {
  const env = getAnchorWorkerEnv()
  const committer = readCommitter()

  if (committer === undefined) {
    console.warn("[anchor-worker] missing MORTEM_SIGNER_SECRET_KEY; skipping memo commit")
    return undefined
  }

  const connection = new Connection(env.heliusRpcUrl, "confirmed")
  const batchIndex = await nextBatchIndex(batch.agentId)
  const memoPayload = JSON.stringify({
    v: 1,
    agentId: batch.agentId,
    batchIndex,
    merkleRoot: batch.merkleRoot,
    traceCount: batch.traceCount,
    ts: Date.now(),
  })
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoPayload, "utf8"),
    }),
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
    console.warn("[anchor-worker] memo commit failed", error)
    return undefined
  }
}
