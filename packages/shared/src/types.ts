// Shared types describe Mortem's stable wire contracts across SDK, ingest, server,
// workers, and dashboard. Keep this file free of app-specific imports so every runtime can use it.
export type EventType =
  | "llm_call"
  | "tool_call"
  | "solana_tx"
  | "x402_payment"
  | "mcp_call"
  | "custom"

export type TraceStatus = "running" | "completed" | "errored" | "timeout"

export type FailureType =
  | "none"
  | "missing_information"
  | "bad_instruction"
  | "guardrail_gap"
  | "model_limit"
  | "market_condition"
  | "unknown"

export type LLMProvider = "anthropic" | "ollama"

export type UserPlan = "free" | "pro" | "team"

export type AgentEnvironment = "devnet" | "mainnet"

export type AgentOwnerRole = "owner" | "editor" | "viewer"

export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface User {
  id: string
  email: string | null
  primaryWallet: string | null
  pdaFunded: boolean
  plan: UserPlan
  createdAt: Date
}

export interface Agent {
  id: string
  ownerId: string
  agentWallet: string | null
  displayName: string
  apiKeyHash: string
  environment: AgentEnvironment
  privateMode: boolean
  retentionDays: number
  createdAt: Date
}

export interface AgentOwner {
  userId: string
  agentId: string
  role: AgentOwnerRole
}

export interface Trace {
  id: string
  agentId: string
  status: TraceStatus
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  inputSummary: string
  outputSummary: string | null
  errorMessage: string | null
  eventCount: number
  totalTokens: number
  totalCostUsd: string
  totalLamports: bigint
  solanaTxCount: number
  toolsCalled: string[]
  anchorSignature: string | null
  anchorSlot: bigint | null
  merkleProof: string | null
  traceHash: string | null
  shareToken: string | null
  tags: string[]
}

export interface TraceEvent {
  id: string
  traceId: string
  parentEventId: string | null
  sequence: number
  type: EventType
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  payload: JsonValue
  payloadEncrypted: boolean
  status: string
  errorMessage: string | null
}

export interface TraceAnalysisRecord {
  id: string
  traceId: string
  failureType: FailureType
  confidence: number
  summary: string
  whatAgentSaw: string
  whatAgentMissed: string
  counterfactuals: JsonValue
  suggestedFix: string
  analyzedAt: Date
  modelUsed: string
  llmProvider: LLMProvider
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface LLMCallPayload {
  provider: LLMProvider | "openai" | "vercel-ai" | "unknown"
  model: string
  input: {
    system?: string | undefined
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool"
      content: string | JsonValue
      name?: string | undefined
      toolCallId?: string | undefined
    }>
    parameters?: Record<string, JsonValue> | undefined
  }
  output?:
    | {
        content: string | JsonValue
        finishReason?: string | undefined
        toolCalls?:
          | Array<{
              id: string
              name: string
              arguments: JsonValue
            }>
          | undefined
      }
    | undefined
  usage?: TokenUsage | undefined
  costUsd: number
  streamed: boolean
}

export interface ToolCallPayload {
  toolName: string
  input: JsonValue
  output?: JsonValue | undefined
  metadata?: Record<string, JsonValue> | undefined
}

export interface SolanaTxPayload {
  cluster: "devnet" | "mainnet" | "localnet"
  rpcUrl?: string | undefined
  signature?: string | undefined
  instructionNames: string[]
  accountKeys: string[]
  programIds: string[]
  slot?: number | undefined
  lamports?: string | undefined
  feeLamports?: string | undefined
  confirmationStatus?: "processed" | "confirmed" | "finalized" | undefined
  error?: JsonValue | undefined
  enrichment?: JsonValue | undefined
}

export interface X402PaymentPayload {
  scheme: "exact"
  network: string
  resource: string
  amount: string
  asset: string
  payer?: string | undefined
  payee?: string | undefined
  transaction?: string | undefined
  settled: boolean
  metadata?: Record<string, JsonValue> | undefined
}

export interface McpCallPayload {
  serverName: string
  toolName: string
  request: JsonValue
  response?: JsonValue | undefined
  metadata?: Record<string, JsonValue> | undefined
}

export interface CustomPayload {
  name: string
  data: JsonValue
  metadata?: Record<string, JsonValue> | undefined
}

export type TraceEventPayload =
  | LLMCallPayload
  | ToolCallPayload
  | SolanaTxPayload
  | X402PaymentPayload
  | McpCallPayload
  | CustomPayload

export interface MarketContext {
  slot: number
  timestamp: number
  pythPrices: Record<
    string,
    {
      price: number
      confidence: number
      exponent: number
      publishTime: number
      attestation: string
    }
  >
  jupiterRoutes: Record<
    string,
    {
      inputMint: string
      outputMint: string
      inAmount: string
      outAmount: string
      priceImpactPct: number
      routePlan: unknown[]
      capturedAtMs: number
      responseHash: string
    }
  >
  poolStates: Record<
    string,
    {
      accountPubkey: string
      dataBase64: string
      slot: number
      dataHash: string
    }
  >
}

export interface TraceAnalysis {
  traceId: string
  failureType: FailureType
  confidence: number
  summary: string
  whatAgentSaw: string
  whatAgentMissed: string
  counterfactuals: Counterfactual[]
  suggestedFix: string
  analyzedAt: number
  modelUsed: string
  llmProvider: LLMProvider
}

export interface Counterfactual {
  question: string
  answer: string
  verdict: "avoidable" | "unavoidable" | "unclear"
  evidence: string
}

export interface PdaFundingInfo {
  pdaAddress: string
  requiredLamports: number
  requiredSol: number
  qrCodeDataUrl: string
  solanaPayUrl: string
}
