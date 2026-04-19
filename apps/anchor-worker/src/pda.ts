// PDA helpers mirror the Anchor seeds used by the on-chain Mortem program. They are local to the
// worker until the server app exposes its shared transaction-building helpers.
import { PublicKey } from "@solana/web3.js"

const toLittleEndianU64 = (value: bigint): Buffer => {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(value)
  return buffer
}

export const deriveAnchorBatchPda = (
  agentPda: string,
  batchIndex: bigint,
  programId: string,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("batch"), new PublicKey(agentPda).toBuffer(), toLittleEndianU64(batchIndex)],
    new PublicKey(programId),
  )
