// Memo anchor helpers read committed Merkle roots back from Solana transactions. Verification uses
// the memo payload rather than a custom program account layout, so parsing stays lightweight.
import type { ParsedInstruction, PartiallyDecodedInstruction } from "@solana/web3.js"
import { Connection, PublicKey } from "@solana/web3.js"

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

export interface MemoAnchorPayload {
  agentId: string
  batchIndex: number
  merkleRoot: string
  traceCount: number
  ts: number
  v: number
}

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object"

const readString = (record: JsonRecord, key: string): string | null => {
  const value = record[key]
  return typeof value === "string" ? value : null
}

const readNumber = (record: JsonRecord, key: string): number | null => {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const rpcConnection = (): Connection =>
  new Connection(
    process.env.HELIUS_RPC_URL ??
      (process.env.HELIUS_API_KEY === undefined
        ? "https://api.devnet.solana.com"
        : `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`),
    "confirmed",
  )

const parsePayload = (raw: string): MemoAnchorPayload | null => {
  try {
    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return null
    }

    const v = readNumber(parsed, "v")
    const agentId = readString(parsed, "agentId")
    const batchIndex = readNumber(parsed, "batchIndex")
    const merkleRoot = readString(parsed, "merkleRoot")
    const traceCount = readNumber(parsed, "traceCount")
    const ts = readNumber(parsed, "ts")

    if (
      v === null ||
      agentId === null ||
      batchIndex === null ||
      merkleRoot === null ||
      traceCount === null ||
      ts === null
    ) {
      return null
    }

    return {
      agentId,
      batchIndex,
      merkleRoot,
      traceCount,
      ts,
      v,
    }
  } catch {
    return null
  }
}

const readMemoPayload = (
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
): string | null => {
  if (instruction.programId.toBase58() !== MEMO_PROGRAM_ID.toBase58()) {
    return null
  }

  if ("parsed" in instruction && typeof instruction.parsed === "string") {
    return instruction.parsed
  }

  return null
}

export const fetchMemoAnchor = async (
  signature: string,
): Promise<{ payload: MemoAnchorPayload; slot: string | null } | null> => {
  try {
    const transaction = await rpcConnection().getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })

    if (transaction === null) {
      return null
    }

    for (const instruction of transaction.transaction.message.instructions) {
      const raw = readMemoPayload(instruction)

      if (raw === null) {
        continue
      }

      const payload = parsePayload(raw)

      if (payload !== null) {
        return {
          payload,
          slot: transaction.slot.toString(),
        }
      }
    }

    return null
  } catch {
    return null
  }
}
