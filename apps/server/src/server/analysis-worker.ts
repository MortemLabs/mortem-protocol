// The analysis worker consumes trace IDs from Redis, asks the configured LLM for structured failure
// analysis, writes TraceAnalysis, and publishes a ready signal for dashboards.
import "./load-env"
import prisma, { type Prisma, PrismaClient } from "@mortemlabs/db"
import { CounterfactualSchema, FailureTypeSchema, LLMProviderSchema } from "@mortemlabs/shared"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ulid } from "ulid"
import { z } from "zod"
import { getLLMClient } from "../lib/llm"
import { getRedis } from "./redis"

const POLL_INTERVAL_MS = 5_000
const globalForAnalysisWorker = globalThis as typeof globalThis & {
  __mortemAnalysisWorker?: ReturnType<typeof setInterval> | undefined
  __mortemAnalysisWorkerRunning?: boolean | undefined
}
let workerPrisma = prisma
const CounterfactualInputSchema = CounterfactualSchema
const normalizeCounterfactuals = (value: unknown): z.infer<typeof CounterfactualSchema>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const parsed = CounterfactualInputSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return []
  }

  return [
    {
      answer: value.trim(),
      evidence: "Captured from the analysis model as a summary instead of a structured object.",
      question: "What would have happened under a different condition?",
      verdict: "unclear",
    },
  ]
}

const LLMAnalysisSchema = z.object({
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  counterfactuals: z.preprocess(normalizeCounterfactuals, z.array(CounterfactualInputSchema)),
  failureType: FailureTypeSchema.default("unknown"),
  suggestedFix: z
    .string()
    .default("Review the trace and add stronger validation around the failing step."),
  summary: z.string().default("The trace needs manual review."),
  whatAgentMissed: z.string().default("Unknown."),
  whatAgentSaw: z.string().default("Unknown."),
})

const systemPrompt =
  [
    "You analyze TypeScript AI agent traces for Solana workflows.",
    "Return strict JSON with exactly these keys:",
    "failureType, confidence, summary, whatAgentSaw, whatAgentMissed, counterfactuals, suggestedFix.",
    "Allowed failureType values are: none, missing_information, bad_instruction, guardrail_gap, model_limit, market_condition, unknown.",
    "Use failureType = none when the trace completed successfully with no meaningful issue.",
    "counterfactuals must be an array of objects with question, answer, evidence, and verdict.",
    "Allowed verdict values are: avoidable, unavoidable, unclear.",
    "If there are no meaningful counterfactuals, return counterfactuals as [].",
  ].join(" ")
const BACKFILL_BATCH_SIZE = 5
const ANALYSIS_LOCK_SECONDS = 5 * 60
const stringifyForLLM = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  )
const isPrismaConnectionClosedError = (error: unknown): error is { code: string } =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P1017"

const withPrismaReconnect = async <T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (!isPrismaConnectionClosedError(error)) {
      throw error
    }

    console.warn(`[analysis-worker] prisma connection closed during ${label}; reconnecting`)
    const previousPrisma = workerPrisma
    await previousPrisma.$disconnect().catch(() => undefined)
    workerPrisma = new PrismaClient()
    await workerPrisma.$connect()
    return operation()
  }
}

const extractJsonObject = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")

    if (start === -1 || end <= start) {
      throw new Error("LLM response did not contain a JSON object")
    }

    return JSON.parse(raw.slice(start, end + 1)) as unknown
  }
}

const parseAnalysis = (raw: string): z.infer<typeof LLMAnalysisSchema> => {
  try {
    const parsed = extractJsonObject(raw)
    const analysis = LLMAnalysisSchema.safeParse(parsed)

    if (analysis.success) {
      return analysis.data
    }

    console.warn("[analysis-worker] LLM analysis did not match schema", analysis.error.flatten())
  } catch (error) {
    console.warn("[analysis-worker] could not parse LLM analysis response", {
      error: error instanceof Error ? error.message : String(error),
      raw: raw.slice(0, 500),
    })
  }

  return LLMAnalysisSchema.parse({
    confidence: 0,
    failureType: "unknown",
    suggestedFix: "Inspect the trace payload manually; the analysis model returned invalid JSON.",
    summary: "Mortem could not parse a structured analysis from the configured LLM.",
    whatAgentMissed: "Unknown because the analysis response was invalid.",
    whatAgentSaw: "Unknown because the analysis response was invalid.",
  })
}

const providerFromEnv = (): "anthropic" | "ollama" =>
  process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "ollama"

const modelFromEnv = (provider: "anthropic" | "ollama"): string =>
  provider === "anthropic"
    ? (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514")
    : (process.env.OLLAMA_MODEL ?? "")

const writeAnalysis = async ({
  analysis,
  llmProvider,
  modelUsed,
  traceId,
}: {
  analysis: z.infer<typeof LLMAnalysisSchema>
  llmProvider: "anthropic" | "ollama"
  modelUsed: string
  traceId: string
}): Promise<void> => {
  await withPrismaReconnect(`write analysis ${traceId}`, () =>
    workerPrisma.traceAnalysis.upsert({
      create: {
        analyzedAt: new Date(),
        confidence: analysis.confidence,
        counterfactuals: analysis.counterfactuals as unknown as Prisma.InputJsonValue,
        failureType: analysis.failureType,
        id: ulid(),
        llmProvider: LLMProviderSchema.parse(llmProvider),
        modelUsed,
        suggestedFix: analysis.suggestedFix,
        summary: analysis.summary,
        traceId,
        whatAgentMissed: analysis.whatAgentMissed,
        whatAgentSaw: analysis.whatAgentSaw,
      },
      update: {
        analyzedAt: new Date(),
        confidence: analysis.confidence,
        counterfactuals: analysis.counterfactuals as unknown as Prisma.InputJsonValue,
        failureType: analysis.failureType,
        llmProvider: LLMProviderSchema.parse(llmProvider),
        modelUsed,
        suggestedFix: analysis.suggestedFix,
        summary: analysis.summary,
        whatAgentMissed: analysis.whatAgentMissed,
        whatAgentSaw: analysis.whatAgentSaw,
      },
      where: { traceId },
    }),
  )
}

const analyzeTrace = async (traceId: string): Promise<void> => {
  const redis = getRedis()
  const lock = await redis.set(`analysis:lock:${traceId}`, "1", {
    ex: ANALYSIS_LOCK_SECONDS,
    nx: true,
  })

  if (lock !== "OK") {
    console.info(`[analysis-worker] trace ${traceId} is already being analyzed; skipping`)
    return
  }

  console.info(`[analysis-worker] analyzing trace ${traceId}`)
  const trace = await withPrismaReconnect(`load trace ${traceId}`, () =>
    workerPrisma.trace.findUnique({
      include: {
        analysis: { select: { id: true } },
        events: { orderBy: { sequence: "asc" } },
      },
      where: { id: traceId },
    }),
  )

  if (trace === null) {
    console.warn(`[analysis-worker] trace ${traceId} no longer exists; skipping`)
    return
  }

  if (trace.analysis !== null) {
    console.info(`[analysis-worker] trace ${traceId} already has analysis; skipping`)
    return
  }

  if (trace.events.length === 0) {
    const provider = providerFromEnv()

    await writeAnalysis({
      analysis: LLMAnalysisSchema.parse({
        confidence: 0.95,
        failureType: "unknown",
        suggestedFix:
          "Wrap the LLM, tool, or Solana clients used by this agent, then run it again so Mortem can capture trace events.",
        summary:
          "The trace completed, but Mortem did not capture any child events for the run.",
        whatAgentMissed:
          "Mortem cannot inspect the agent's reasoning because no LLM calls, tool calls, or Solana calls were recorded.",
        whatAgentSaw:
          "Only the top-level session metadata was recorded: status, start/end time, and summary.",
      }),
      llmProvider: provider,
      modelUsed: modelFromEnv(provider),
      traceId,
    })
    await redis.publish(`analysis:ready:${traceId}`, JSON.stringify({ traceId }))
    console.info(`[analysis-worker] analysis ready for empty trace ${traceId}`)
    return
  }

  const llm = await getLLMClient()
  const raw = await llm.complete(
    systemPrompt,
    stringifyForLLM({
      events: trace.events,
      trace,
    }),
  )
  const analysis = parseAnalysis(raw)

  await writeAnalysis({
    analysis,
    llmProvider: llm.provider,
    modelUsed: llm.modelId,
    traceId,
  })

  await redis.publish(`analysis:ready:${traceId}`, JSON.stringify({ traceId }))
  console.info(`[analysis-worker] analysis ready for trace ${traceId}`)
}

export const runAnalysisWorkerOnce = async (): Promise<number> => {
  const redis = getRedis()
  const pending = await redis.lrange<string>("analysis:pending", 0, -1)
  const missingAnalyses = await withPrismaReconnect("scan missing analyses", () =>
    workerPrisma.trace.findMany({
      orderBy: { endedAt: "desc" },
      select: { id: true },
      take: BACKFILL_BATCH_SIZE,
      where: {
        analysis: null,
        status: { in: ["completed", "errored"] },
      },
    }),
  )
  let processed = 0
  const traceIds = [...new Set([...pending, ...missingAnalyses.map((trace) => trace.id)])]

  if (traceIds.length > 0) {
    console.info(`[analysis-worker] found ${traceIds.length} pending trace(s)`)
  }

  for (const traceId of traceIds) {
    try {
      await redis.lrem("analysis:pending", 0, traceId)
      await analyzeTrace(traceId)
      processed += 1
    } catch (error) {
      console.error(`[analysis-worker] failed to analyze trace ${traceId}`, error)
    }
  }

  return processed
}

const runAnalysisWorkerTick = async (): Promise<void> => {
  if (globalForAnalysisWorker.__mortemAnalysisWorkerRunning === true) {
    console.info("[analysis-worker] previous run still active; skipping tick")
    return
  }

  globalForAnalysisWorker.__mortemAnalysisWorkerRunning = true

  try {
    await runAnalysisWorkerOnce()
  } finally {
    globalForAnalysisWorker.__mortemAnalysisWorkerRunning = false
  }
}

export const startAnalysisWorker = (): ReturnType<typeof setInterval> => {
  if (globalForAnalysisWorker.__mortemAnalysisWorker !== undefined) {
    return globalForAnalysisWorker.__mortemAnalysisWorker
  }

  console.info(`[analysis-worker] started; polling every ${POLL_INTERVAL_MS}ms`)
  void runAnalysisWorkerTick().catch((error: unknown) => {
    console.error("[analysis-worker] initial run failed", error)
  })

  const interval = setInterval(() => {
    void runAnalysisWorkerTick().catch((error: unknown) => {
      console.error("[analysis-worker] run failed", error)
    })
  }, POLL_INTERVAL_MS)

  globalForAnalysisWorker.__mortemAnalysisWorker = interval
  return interval
}

export const ensureAnalysisWorkerStarted = (): ReturnType<typeof setInterval> | undefined => {
  if (process.env.ANALYSIS_WORKER_AUTOSTART === "false") {
    console.info("[analysis-worker] autostart disabled")
    return undefined
  }

  return startAnalysisWorker()
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectRun && process.env.ANALYSIS_WORKER_AUTOSTART !== "false") {
  ensureAnalysisWorkerStarted()
}
