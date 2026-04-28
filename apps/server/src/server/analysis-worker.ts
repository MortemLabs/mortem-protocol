// The analysis worker consumes trace IDs from Redis, asks the configured LLM for structured failure
// analysis, writes TraceAnalysis, and publishes a ready signal for dashboards.
import prisma, { type Prisma } from "@mortemlabs/db"
import { FailureTypeSchema, LLMProviderSchema } from "@mortemlabs/shared"
import { ulid } from "ulid"
import { z } from "zod"
import { getLLMClient } from "../lib/llm"
import { getRedis } from "./redis"

const POLL_INTERVAL_MS = 5_000
const globalForAnalysisWorker = globalThis as typeof globalThis & {
  __mortemAnalysisWorker?: ReturnType<typeof setInterval> | undefined
}

const LLMAnalysisSchema = z.object({
  confidence: z.number().min(0).max(1).default(0.5),
  counterfactuals: z.array(z.unknown()).default([]),
  failureType: FailureTypeSchema.default("unknown"),
  suggestedFix: z
    .string()
    .default("Review the trace and add stronger validation around the failing step."),
  summary: z.string().default("The trace needs manual review."),
  whatAgentMissed: z.string().default("Unknown."),
  whatAgentSaw: z.string().default("Unknown."),
})

const systemPrompt =
  "You analyze TypeScript AI agent traces for Solana workflows. Return strict JSON with failureType, confidence, summary, whatAgentSaw, whatAgentMissed, counterfactuals, and suggestedFix."

const parseAnalysis = (raw: string): z.infer<typeof LLMAnalysisSchema> => {
  try {
    return LLMAnalysisSchema.parse(JSON.parse(raw) as unknown)
  } catch {
    return LLMAnalysisSchema.parse({})
  }
}

const analyzeTrace = async (traceId: string): Promise<void> => {
  console.info(`[analysis-worker] analyzing trace ${traceId}`)
  const trace = await prisma.trace.findUnique({
    include: {
      events: { orderBy: { sequence: "asc" } },
    },
    where: { id: traceId },
  })

  if (trace === null) {
    console.warn(`[analysis-worker] trace ${traceId} no longer exists; skipping`)
    return
  }

  const llm = await getLLMClient()
  const raw = await llm.complete(
    systemPrompt,
    JSON.stringify({
      events: trace.events,
      trace,
    }),
  )
  const analysis = parseAnalysis(raw)

  await prisma.traceAnalysis.upsert({
    create: {
      analyzedAt: new Date(),
      confidence: analysis.confidence,
      counterfactuals: analysis.counterfactuals as Prisma.InputJsonValue,
      failureType: analysis.failureType,
      id: ulid(),
      llmProvider: LLMProviderSchema.parse(llm.provider),
      modelUsed: llm.modelId,
      suggestedFix: analysis.suggestedFix,
      summary: analysis.summary,
      traceId,
      whatAgentMissed: analysis.whatAgentMissed,
      whatAgentSaw: analysis.whatAgentSaw,
    },
    update: {
      analyzedAt: new Date(),
      confidence: analysis.confidence,
      counterfactuals: analysis.counterfactuals as Prisma.InputJsonValue,
      failureType: analysis.failureType,
      llmProvider: LLMProviderSchema.parse(llm.provider),
      modelUsed: llm.modelId,
      suggestedFix: analysis.suggestedFix,
      summary: analysis.summary,
      whatAgentMissed: analysis.whatAgentMissed,
      whatAgentSaw: analysis.whatAgentSaw,
    },
    where: { traceId },
  })

  await getRedis().publish(`analysis:ready:${traceId}`, JSON.stringify({ traceId }))
  console.info(`[analysis-worker] analysis ready for trace ${traceId}`)
}

export const runAnalysisWorkerOnce = async (): Promise<number> => {
  const redis = getRedis()
  const pending = await redis.lrange<string>("analysis:pending", 0, -1)
  let processed = 0
  const traceIds = [...new Set(pending)]

  if (traceIds.length > 0) {
    console.info(`[analysis-worker] found ${traceIds.length} pending trace(s)`)
  }

  for (const traceId of traceIds) {
    await analyzeTrace(traceId)
    await redis.lrem("analysis:pending", 0, traceId)
    processed += 1
  }

  return processed
}

export const startAnalysisWorker = (): ReturnType<typeof setInterval> => {
  if (globalForAnalysisWorker.__mortemAnalysisWorker !== undefined) {
    return globalForAnalysisWorker.__mortemAnalysisWorker
  }

  console.info(`[analysis-worker] started; polling every ${POLL_INTERVAL_MS}ms`)
  void runAnalysisWorkerOnce().catch((error: unknown) => {
    console.error("[analysis-worker] initial run failed", error)
  })

  const interval = setInterval(() => {
    void runAnalysisWorkerOnce().catch((error: unknown) => {
      console.error("[analysis-worker] run failed", error)
    })
  }, POLL_INTERVAL_MS)

  interval.unref?.()
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

if (process.env.ANALYSIS_WORKER_AUTOSTART !== "false") {
  ensureAnalysisWorkerStarted()
}
