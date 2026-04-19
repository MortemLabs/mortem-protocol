// Zod schemas are the runtime boundary for every shared Mortem contract. They intentionally
// mirror src/types.ts so SDK ingestion, tRPC, and worker payloads validate the same shapes.
import { z } from "zod"
import type {
  Agent,
  AgentEnvironment,
  AgentOwner,
  AgentOwnerRole,
  Counterfactual,
  CustomPayload,
  EventType,
  FailureType,
  JsonPrimitive,
  JsonValue,
  LLMCallPayload,
  LLMProvider,
  MarketContext,
  McpCallPayload,
  PdaFundingInfo,
  SolanaTxPayload,
  TokenUsage,
  ToolCallPayload,
  Trace,
  TraceAnalysis,
  TraceAnalysisRecord,
  TraceEvent,
  TraceEventPayload,
  TraceStatus,
  User,
  UserPlan,
  X402PaymentPayload,
} from "./types.js"

export const EventTypeSchema = z.enum([
  "llm_call",
  "tool_call",
  "solana_tx",
  "x402_payment",
  "mcp_call",
  "custom",
] satisfies [EventType, ...EventType[]])

export const TraceStatusSchema = z.enum(["running", "completed", "errored", "timeout"] satisfies [
  TraceStatus,
  ...TraceStatus[],
])

export const FailureTypeSchema = z.enum([
  "missing_information",
  "bad_instruction",
  "guardrail_gap",
  "model_limit",
  "market_condition",
  "unknown",
] satisfies [FailureType, ...FailureType[]])

export const LLMProviderSchema = z.enum(["anthropic", "ollama"] satisfies [
  LLMProvider,
  ...LLMProvider[],
])

export const UserPlanSchema = z.enum(["free", "pro", "team"] satisfies [UserPlan, ...UserPlan[]])

export const AgentEnvironmentSchema = z.enum(["devnet", "mainnet"] satisfies [
  AgentEnvironment,
  ...AgentEnvironment[],
])

export const AgentOwnerRoleSchema = z.enum(["owner", "editor", "viewer"] satisfies [
  AgentOwnerRole,
  ...AgentOwnerRole[],
])

export const JsonPrimitiveSchema: z.ZodType<JsonPrimitive> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(JsonValueSchema)]),
)

export const UserSchema: z.ZodType<User> = z.object({
  id: z.string(),
  email: z.string().nullable(),
  primaryWallet: z.string().nullable(),
  userPda: z.string().nullable(),
  pdaFunded: z.boolean(),
  plan: UserPlanSchema,
  createdAt: z.date(),
})

export const AgentSchema: z.ZodType<Agent> = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentWallet: z.string().nullable(),
  displayName: z.string(),
  apiKeyHash: z.string(),
  environment: AgentEnvironmentSchema,
  privateMode: z.boolean(),
  retentionDays: z.number().int().nonnegative(),
  registryPda: z.string().nullable(),
  userPda: z.string().nullable(),
  createdAt: z.date(),
})

export const AgentOwnerSchema: z.ZodType<AgentOwner> = z.object({
  userId: z.string(),
  agentId: z.string(),
  role: AgentOwnerRoleSchema,
})

export const TraceSchema: z.ZodType<Trace> = z.object({
  id: z.string(),
  agentId: z.string(),
  status: TraceStatusSchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  inputSummary: z.string(),
  outputSummary: z.string().nullable(),
  errorMessage: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalLamports: z.bigint(),
  solanaTxCount: z.number().int().nonnegative(),
  toolsCalled: z.array(z.string()),
  anchorSignature: z.string().nullable(),
  anchorSlot: z.bigint().nullable(),
  merkleProof: z.string().nullable(),
  traceHash: z.string().nullable(),
  shareToken: z.string().nullable(),
  tags: z.array(z.string()),
})

export const TraceEventSchema: z.ZodType<TraceEvent> = z.object({
  id: z.string(),
  traceId: z.string(),
  parentEventId: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  type: EventTypeSchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  payload: JsonValueSchema,
  payloadEncrypted: z.boolean(),
  status: z.string(),
  errorMessage: z.string().nullable(),
})

export const TraceAnalysisRecordSchema: z.ZodType<TraceAnalysisRecord> = z.object({
  id: z.string(),
  traceId: z.string(),
  failureType: FailureTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  whatAgentSaw: z.string(),
  whatAgentMissed: z.string(),
  counterfactuals: JsonValueSchema,
  suggestedFix: z.string(),
  analyzedAt: z.date(),
  modelUsed: z.string(),
  llmProvider: LLMProviderSchema,
})

export const TokenUsageSchema: z.ZodType<TokenUsage> = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
})

const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"])

const LLMMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([z.string(), JsonValueSchema]),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
})

const LLMToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: JsonValueSchema,
})

export const LLMCallPayloadSchema: z.ZodType<LLMCallPayload> = z.object({
  provider: z.enum(["anthropic", "ollama", "openai", "vercel-ai", "unknown"]),
  model: z.string(),
  input: z.object({
    system: z.string().optional(),
    messages: z.array(LLMMessageSchema),
    parameters: z.record(JsonValueSchema).optional(),
  }),
  output: z
    .object({
      content: z.union([z.string(), JsonValueSchema]),
      finishReason: z.string().optional(),
      toolCalls: z.array(LLMToolCallSchema).optional(),
    })
    .optional(),
  usage: TokenUsageSchema.optional(),
  costUsd: z.number().nonnegative(),
  streamed: z.boolean(),
})

export const ToolCallPayloadSchema: z.ZodType<ToolCallPayload> = z.object({
  toolName: z.string(),
  input: JsonValueSchema,
  output: JsonValueSchema.optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export const SolanaTxPayloadSchema: z.ZodType<SolanaTxPayload> = z.object({
  cluster: z.enum(["devnet", "mainnet", "localnet"]),
  rpcUrl: z.string().optional(),
  signature: z.string().optional(),
  instructionNames: z.array(z.string()),
  accountKeys: z.array(z.string()),
  programIds: z.array(z.string()),
  slot: z.number().int().nonnegative().optional(),
  lamports: z.string().optional(),
  feeLamports: z.string().optional(),
  confirmationStatus: z.enum(["processed", "confirmed", "finalized"]).optional(),
  error: JsonValueSchema.optional(),
  enrichment: JsonValueSchema.optional(),
})

export const X402PaymentPayloadSchema: z.ZodType<X402PaymentPayload> = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  resource: z.string(),
  amount: z.string(),
  asset: z.string(),
  payer: z.string().optional(),
  payee: z.string().optional(),
  transaction: z.string().optional(),
  settled: z.boolean(),
  metadata: z.record(JsonValueSchema).optional(),
})

export const McpCallPayloadSchema: z.ZodType<McpCallPayload> = z.object({
  serverName: z.string(),
  toolName: z.string(),
  request: JsonValueSchema,
  response: JsonValueSchema.optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export const CustomPayloadSchema: z.ZodType<CustomPayload> = z.object({
  name: z.string(),
  data: JsonValueSchema,
  metadata: z.record(JsonValueSchema).optional(),
})

export const TraceEventPayloadSchema: z.ZodType<TraceEventPayload> = z.union([
  LLMCallPayloadSchema,
  ToolCallPayloadSchema,
  SolanaTxPayloadSchema,
  X402PaymentPayloadSchema,
  McpCallPayloadSchema,
  CustomPayloadSchema,
])

export const MarketContextSchema: z.ZodType<MarketContext> = z.object({
  slot: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  pythPrices: z.record(
    z.object({
      price: z.number(),
      confidence: z.number().nonnegative(),
      exponent: z.number().int(),
      publishTime: z.number().int().nonnegative(),
      attestation: z.string(),
    }),
  ),
  jupiterRoutes: z.record(
    z.object({
      inputMint: z.string(),
      outputMint: z.string(),
      inAmount: z.string(),
      outAmount: z.string(),
      priceImpactPct: z.number(),
      routePlan: z.array(z.unknown()),
      capturedAtMs: z.number().int().nonnegative(),
      responseHash: z.string(),
    }),
  ),
  poolStates: z.record(
    z.object({
      accountPubkey: z.string(),
      dataBase64: z.string(),
      slot: z.number().int().nonnegative(),
      dataHash: z.string(),
    }),
  ),
})

export const CounterfactualSchema: z.ZodType<Counterfactual> = z.object({
  question: z.string(),
  answer: z.string(),
  verdict: z.enum(["avoidable", "unavoidable", "unclear"]),
  evidence: z.string(),
})

export const TraceAnalysisSchema: z.ZodType<TraceAnalysis> = z.object({
  traceId: z.string(),
  failureType: FailureTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  whatAgentSaw: z.string(),
  whatAgentMissed: z.string(),
  counterfactuals: z.array(CounterfactualSchema),
  suggestedFix: z.string(),
  analyzedAt: z.number().int().nonnegative(),
  modelUsed: z.string(),
  llmProvider: LLMProviderSchema,
})

export const PdaFundingInfoSchema: z.ZodType<PdaFundingInfo> = z.object({
  pdaAddress: z.string(),
  requiredLamports: z.number().int().nonnegative(),
  requiredSol: z.number().nonnegative(),
  qrCodeDataUrl: z.string(),
  solanaPayUrl: z.string(),
})
