// PDA helpers mirror the Anchor program seeds byte-for-byte for unsigned transaction builders and
// workers. Batch indexes are encoded as little-endian u64 values to match Rust.
import { PublicKey } from "@solana/web3.js"

const toLittleEndianU64 = (value: bigint): Buffer => {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(value)
  return buffer
}

export const deriveUserRegistryPda = async (
  ownerWallet: string,
  programId: string,
): Promise<[PublicKey, number]> =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("user"), new PublicKey(ownerWallet).toBuffer()],
    new PublicKey(programId),
  )

export const deriveAgentRegistryPda = async (
  userRegistryPda: string,
  displayNameHash: Buffer,
  programId: string,
): Promise<[PublicKey, number]> =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), new PublicKey(userRegistryPda).toBuffer(), displayNameHash],
    new PublicKey(programId),
  )

export const deriveAnchorBatchPda = async (
  agentPda: string,
  batchIndex: bigint,
  programId: string,
): Promise<[PublicKey, number]> =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("batch"), new PublicKey(agentPda).toBuffer(), toLittleEndianU64(batchIndex)],
    new PublicKey(programId),
  )
