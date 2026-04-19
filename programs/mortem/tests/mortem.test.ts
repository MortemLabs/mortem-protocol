import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
/**
 * Bankrun coverage for Mortem's on-chain registry, batch commit, and admin flows.
 * The suite runs from Anchor's `scripts.test` hook after `anchor build` has emitted the SBF artifact and IDL.
 */
import { type Idl, Program } from "@coral-xyz/anchor"
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { BankrunProvider, startAnchor } from "anchor-bankrun"
import {
  deriveAgentRegistryPda,
  deriveAnchorBatchPda,
  deriveUserRegistryPda,
} from "../../../apps/server/src/lib/pda.ts"

type MethodBuilder = {
  accounts(accounts: Record<string, PublicKey>): MethodBuilder
  signers(signers: Keypair[]): MethodBuilder
  rpc(): Promise<string>
}

type MortemMethods = {
  registerUser(displayName: number[]): MethodBuilder
  registerAgent(displayName: number[], agentWallet: PublicKey): MethodBuilder
  commitBatch(merkleRoot: number[], traceCount: number): MethodBuilder
  upgradePlan(newPlan: number): MethodBuilder
  closeAgent(): MethodBuilder
  closeUser(): MethodBuilder
}

type MortemProgram = Program<Idl> & {
  methods: MortemMethods
}

type TestContext = {
  context: Awaited<ReturnType<typeof startAnchor>>
  program: MortemProgram
}

type RegisteredAgent = TestContext & {
  userPda: PublicKey
  agentPda: PublicKey
  owner: PublicKey
}

type UserRegistry = {
  owner: PublicKey
  agentCount: bigint
  batchCount: bigint
  plan: number
}

type AgentRegistry = {
  userRegistry: PublicKey
  owner: PublicKey
  agentWallet: PublicKey
  batchCount: bigint
}

type AnchorBatch = {
  userRegistry: PublicKey
  agent: PublicKey
  batchIndex: bigint
  merkleRoot: Uint8Array
  traceCount: number
  committer: PublicKey
}

type TestCase = {
  name: string
  run: () => Promise<void>
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const programId = new PublicKey("9HooSdYAu1uDNwuoDhjcQr8KH67TwSXe4XJEviuKofMn")
const admin = Keypair.fromSeed(Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)))
const tests: TestCase[] = []

function test(name: string, run: () => Promise<void>): void {
  tests.push({ name, run })
}

function ensureAnchorArtifacts(): void {
  const sourceProgram = resolve(workspaceRoot, "programs/mortem/target/deploy/mortem.so")
  const targetProgram = resolve(workspaceRoot, "target/deploy/mortem.so")
  const idlPath = resolve(workspaceRoot, "target/idl/mortem.json")

  if (!existsSync(sourceProgram) || !existsSync(idlPath)) {
    throw new Error("Run `anchor build` before the Mortem bankrun tests.")
  }

  mkdirSync(dirname(targetProgram), { recursive: true })
  copyFileSync(sourceProgram, targetProgram)
}

function readIdl(): Idl {
  const idlPath = resolve(workspaceRoot, "target/idl/mortem.json")
  return JSON.parse(readFileSync(idlPath, "utf8")) as Idl
}

async function setup(): Promise<TestContext> {
  ensureAnchorArtifacts()
  const context = await startAnchor(workspaceRoot, [], [])
  const provider = new BankrunProvider(context)
  const program = new Program(readIdl(), provider) as unknown as MortemProgram

  return { context, program }
}

function fixedName(value: string): Uint8Array {
  const out = new Uint8Array(32)
  out.set(Buffer.from(value).subarray(0, 32))
  return out
}

function sha256Bytes(value: Uint8Array): Buffer {
  return createHash("sha256").update(value).digest()
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true)
}

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true)
}

function readPublicKey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32))
}

async function accountData(
  context: TestContext["context"],
  address: PublicKey,
): Promise<Uint8Array> {
  const account = await context.banksClient.getAccount(address)
  assert.ok(account, `missing account ${address.toBase58()}`)
  return account.data
}

async function maybeAccount(context: TestContext["context"], address: PublicKey): Promise<boolean> {
  return (await context.banksClient.getAccount(address)) !== null
}

async function decodeUserRegistry(
  context: TestContext["context"],
  address: PublicKey,
): Promise<UserRegistry> {
  const data = await accountData(context, address)
  return {
    owner: readPublicKey(data, 8),
    agentCount: readU64(data, 8 + 32 + 32 + 8),
    batchCount: readU64(data, 8 + 32 + 32 + 8 + 8),
    plan: data[8 + 32 + 32 + 8 + 8 + 8] ?? 0,
  }
}

async function decodeAgentRegistry(
  context: TestContext["context"],
  address: PublicKey,
): Promise<AgentRegistry> {
  const data = await accountData(context, address)
  return {
    userRegistry: readPublicKey(data, 8),
    owner: readPublicKey(data, 8 + 32),
    agentWallet: readPublicKey(data, 8 + 32 + 32),
    batchCount: readU64(data, 8 + 32 + 32 + 32 + 32 + 8),
  }
}

async function decodeAnchorBatch(
  context: TestContext["context"],
  address: PublicKey,
): Promise<AnchorBatch> {
  const data = await accountData(context, address)
  return {
    userRegistry: readPublicKey(data, 8),
    agent: readPublicKey(data, 8 + 32),
    batchIndex: readU64(data, 8 + 32 + 32),
    merkleRoot: data.slice(8 + 32 + 32 + 8, 8 + 32 + 32 + 8 + 32),
    traceCount: readU32(data, 8 + 32 + 32 + 8 + 32),
    committer: readPublicKey(data, 8 + 32 + 32 + 8 + 32 + 4 + 8),
  }
}

async function registerUser(
  context: TestContext["context"],
  program: MortemProgram,
  displayName = fixedName("mortem-user"),
): Promise<PublicKey> {
  const owner = context.payer.publicKey
  const [userPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), owner.toBuffer()],
    programId,
  )

  await program.methods
    .registerUser(Array.from(displayName))
    .accounts({
      owner,
      userRegistry: userPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  return userPda
}

async function registerAgent(): Promise<RegisteredAgent> {
  const testContext = await setup()
  const owner = testContext.context.payer.publicKey
  const userPda = await registerUser(testContext.context, testContext.program)
  const displayName = fixedName("mortem-agent")
  const displayHash = sha256Bytes(displayName)
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), userPda.toBuffer(), displayHash],
    programId,
  )
  const agentWallet = Keypair.generate().publicKey

  await testContext.program.methods
    .registerAgent(Array.from(displayName), agentWallet)
    .accounts({
      owner,
      userRegistry: userPda,
      agentRegistry: agentPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  return { ...testContext, userPda, agentPda, owner }
}

async function expectFailure(run: () => Promise<void>, pattern: RegExp): Promise<void> {
  try {
    await run()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    assert.match(message, pattern)
    return
  }

  assert.fail("expected transaction to fail")
}

async function transferLamports(
  context: TestContext["context"],
  toPubkey: PublicKey,
  lamports: number,
): Promise<void> {
  const latest = await context.banksClient.getLatestBlockhash()
  assert.ok(latest, "missing latest blockhash")
  const [recentBlockhash] = latest
  const tx = new Transaction({
    feePayer: context.payer.publicKey,
    recentBlockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: context.payer.publicKey,
      toPubkey,
      lamports,
    }),
  )

  tx.sign(context.payer)
  await context.banksClient.processTransaction(tx)
}

test("register_user derives the same PDA as the TypeScript mirror", async () => {
  const { context, program } = await setup()
  const owner = context.payer.publicKey
  const [rustStylePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), owner.toBuffer()],
    programId,
  )
  const [typescriptPda] = await deriveUserRegistryPda(owner.toBase58(), programId.toBase58())
  assert.equal(typescriptPda.toBase58(), rustStylePda.toBase58())

  const userPda = await registerUser(context, program)
  const userRegistry = await decodeUserRegistry(context, userPda)
  assert.equal(userRegistry.owner.toBase58(), owner.toBase58())
  assert.equal(userRegistry.plan, 0)
})

test("register_agent nests under the correct UserRegistry", async () => {
  const { context, userPda, agentPda, owner } = await registerAgent()
  const displayName = fixedName("mortem-agent")
  const [typescriptAgentPda] = await deriveAgentRegistryPda(
    userPda.toBase58(),
    sha256Bytes(displayName),
    programId.toBase58(),
  )
  assert.equal(typescriptAgentPda.toBase58(), agentPda.toBase58())

  const userRegistry = await decodeUserRegistry(context, userPda)
  const agentRegistry = await decodeAgentRegistry(context, agentPda)
  assert.equal(userRegistry.agentCount, 1n)
  assert.equal(agentRegistry.userRegistry.toBase58(), userPda.toBase58())
  assert.equal(agentRegistry.owner.toBase58(), owner.toBase58())
})

test("commit_batch fails with FundingRequired when the PDA is empty", async () => {
  const { context, program, userPda, agentPda, owner } = await registerAgent()
  const [batchPda] = await deriveAnchorBatchPda(agentPda.toBase58(), 0n, programId.toBase58())

  await expectFailure(
    () =>
      program.methods
        .commitBatch(Array.from(fixedName("root")), 1)
        .accounts({
          committer: owner,
          userRegistry: userPda,
          agentRegistry: agentPda,
          anchorBatch: batchPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    /FundingRequired|6000|0x1770/,
  )
})

test("commit_batch succeeds after funding the UserRegistry PDA", async () => {
  const { context, program, userPda, agentPda, owner } = await registerAgent()
  await transferLamports(context, userPda, 10_000_000)

  const root = fixedName("trace-root")
  const [batchPda] = await deriveAnchorBatchPda(agentPda.toBase58(), 0n, programId.toBase58())

  await program.methods
    .commitBatch(Array.from(root), 2)
    .accounts({
      committer: owner,
      userRegistry: userPda,
      agentRegistry: agentPda,
      anchorBatch: batchPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  const batch = await decodeAnchorBatch(context, batchPda)
  const userRegistry = await decodeUserRegistry(context, userPda)
  const agentRegistry = await decodeAgentRegistry(context, agentPda)
  assert.equal(batch.userRegistry.toBase58(), userPda.toBase58())
  assert.equal(batch.agent.toBase58(), agentPda.toBase58())
  assert.equal(batch.batchIndex, 0n)
  assert.deepEqual(Array.from(batch.merkleRoot), Array.from(root))
  assert.equal(batch.traceCount, 2)
  assert.equal(batch.committer.toBase58(), owner.toBase58())
  assert.equal(userRegistry.batchCount, 1n)
  assert.equal(agentRegistry.batchCount, 1n)
})

test("upgrade_plan is restricted to the backend authority", async () => {
  const { context, program } = await setup()
  const userPda = await registerUser(context, program)

  await expectFailure(
    () =>
      program.methods
        .upgradePlan(1)
        .accounts({
          admin: context.payer.publicKey,
          userRegistry: userPda,
        })
        .rpc(),
    /Unauthorized|6001|0x1771/,
  )

  await program.methods
    .upgradePlan(1)
    .accounts({
      admin: admin.publicKey,
      userRegistry: userPda,
    })
    .signers([admin])
    .rpc()

  const userRegistry = await decodeUserRegistry(context, userPda)
  assert.equal(userRegistry.plan, 1)
})

test("close_agent and close_user are admin-only", async () => {
  const { context, program, userPda, agentPda } = await registerAgent()

  await expectFailure(
    () =>
      program.methods
        .closeAgent()
        .accounts({
          admin: context.payer.publicKey,
          userRegistry: userPda,
          agentRegistry: agentPda,
          ownerWallet: context.payer.publicKey,
        })
        .rpc(),
    /Unauthorized|6001|0x1771/,
  )

  await program.methods
    .closeAgent()
    .accounts({
      admin: admin.publicKey,
      userRegistry: userPda,
      agentRegistry: agentPda,
      ownerWallet: context.payer.publicKey,
    })
    .signers([admin])
    .rpc()

  assert.equal(await maybeAccount(context, agentPda), false)
  const userRegistry = await decodeUserRegistry(context, userPda)
  assert.equal(userRegistry.agentCount, 0n)

  await program.methods
    .closeUser()
    .accounts({
      admin: admin.publicKey,
      userRegistry: userPda,
      ownerWallet: context.payer.publicKey,
    })
    .signers([admin])
    .rpc()

  assert.equal(await maybeAccount(context, userPda), false)
})

let failures = 0

for (const item of tests) {
  try {
    await item.run()
    console.log(`ok - ${item.name}`)
  } catch (error: unknown) {
    failures += 1
    console.error(`not ok - ${item.name}`)
    console.error(error)
  }
}

if (failures > 0) {
  process.exitCode = 1
}
