// AnchorBatch helpers decode Mortem program accounts directly from Solana RPC. The layout mirrors
// the Rust Anchor account so server routers can verify Merkle roots without importing Anchor.
import { createHash } from "node:crypto"
import type { AccountInfo, Connection } from "@solana/web3.js"
import { PublicKey } from "@solana/web3.js"

const DISCRIMINATOR_SIZE = 8
const PUBKEY_SIZE = 32
const U64_SIZE = 8
const U32_SIZE = 4
const I64_SIZE = 8
const ANCHOR_BATCH_LEN =
  PUBKEY_SIZE + PUBKEY_SIZE + U64_SIZE + 32 + U32_SIZE + I64_SIZE + PUBKEY_SIZE + 1
const ANCHOR_BATCH_ACCOUNT_SIZE = DISCRIMINATOR_SIZE + ANCHOR_BATCH_LEN
const AGENT_OFFSET = DISCRIMINATOR_SIZE + PUBKEY_SIZE

export interface AnchorBatchAccount {
  batchIndex: number
  batchPda: string
  committedAt: number
  committer: string
  merkleRoot: string
  traceCount: number
  userRegistry: string
}

const anchorBatchDiscriminator = (): Buffer =>
  createHash("sha256").update("account:AnchorBatch").digest().subarray(0, DISCRIMINATOR_SIZE)

const readPublicKey = (data: Buffer, offset: number): string =>
  new PublicKey(data.subarray(offset, offset + PUBKEY_SIZE)).toBase58()

const readU64 = (data: Buffer, offset: number): number => Number(data.readBigUInt64LE(offset))

const readI64 = (data: Buffer, offset: number): number => Number(data.readBigInt64LE(offset))

export const decodeAnchorBatchAccount = (
  pubkey: PublicKey,
  account: AccountInfo<Buffer>,
): AnchorBatchAccount | null => {
  if (account.data.length !== ANCHOR_BATCH_ACCOUNT_SIZE) {
    return null
  }

  const expected = anchorBatchDiscriminator()
  const actual = account.data.subarray(0, DISCRIMINATOR_SIZE)

  if (!actual.equals(expected)) {
    return null
  }

  let offset = DISCRIMINATOR_SIZE
  const userRegistry = readPublicKey(account.data, offset)
  offset += PUBKEY_SIZE
  offset += PUBKEY_SIZE
  const batchIndex = readU64(account.data, offset)
  offset += U64_SIZE
  const merkleRoot = account.data.subarray(offset, offset + 32).toString("hex")
  offset += 32
  const traceCount = account.data.readUInt32LE(offset)
  offset += U32_SIZE
  const committedAt = readI64(account.data, offset)
  offset += I64_SIZE
  const committer = readPublicKey(account.data, offset)

  return {
    batchIndex,
    batchPda: pubkey.toBase58(),
    committedAt,
    committer,
    merkleRoot,
    traceCount,
    userRegistry,
  }
}

export const fetchAnchorBatchesByAgent = async ({
  agentPda,
  connection,
  programId,
}: {
  agentPda: string
  connection: Connection
  programId: string
}): Promise<AnchorBatchAccount[]> => {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    filters: [
      { dataSize: ANCHOR_BATCH_ACCOUNT_SIZE },
      { memcmp: { bytes: new PublicKey(agentPda).toBase58(), offset: AGENT_OFFSET } },
    ],
  })

  return accounts
    .flatMap(({ account, pubkey }) => {
      const decoded = decodeAnchorBatchAccount(pubkey, account)
      return decoded === null ? [] : [decoded]
    })
    .sort((left, right) => right.batchIndex - left.batchIndex)
}
