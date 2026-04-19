// Ingest schemas validate SDK transport payloads after gzip decoding. They coerce JSON-safe dates
// and bigint strings back into the runtime types Prisma expects.
import { EventTypeSchema, JsonValueSchema, TraceStatusSchema } from "@mortemlabs/shared"
import { z } from "zod"

const BigIntStringSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value))
  .refine((value) => /^-?\d+$/u.test(value), "Expected an integer string")
  .transform((value) => BigInt(value))

const NullableBigIntSchema = z.union([BigIntStringSchema, z.null()]).transform((value) => value)

const DecimalStringSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

export const TraceTransportSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  status: TraceStatusSchema,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  inputSummary: z.string(),
  outputSummary: z.string().nullable(),
  errorMessage: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: DecimalStringSchema,
  totalLamports: BigIntStringSchema,
  solanaTxCount: z.number().int().nonnegative(),
  toolsCalled: z.array(z.string()),
  anchorSignature: z.string().nullable(),
  anchorSlot: NullableBigIntSchema,
  merkleProof: z.string().nullable(),
  traceHash: z.string().nullable(),
  shareToken: z.string().nullable(),
  tags: z.array(z.string()),
})

export const TraceEventTransportSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentEventId: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  type: EventTypeSchema,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  payload: JsonValueSchema,
  payloadEncrypted: z.boolean(),
  status: z.string(),
  errorMessage: z.string().nullable(),
})

export const TraceBatchSchema = z.object({
  batchId: z.string(),
  items: z
    .array(
      z.object({
        trace: TraceTransportSchema,
        events: z.array(TraceEventTransportSchema),
      }),
    )
    .min(1),
})

export type TraceBatchInput = z.infer<typeof TraceBatchSchema>
