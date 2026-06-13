// Shared trace formatting helpers used by the trace detail screen, the agent trace list, and the
// public share page. Centralizing them keeps badge variants, payload parsing, and time formatting
// consistent across every surface that renders forensic trace data.
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export type TraceBadgeVariant =
  | "default"
  | "error"
  | "outline"
  | "secondary"
  | "success"
  | "warning"

type SignedEvent = {
  payload: unknown
  type: string
}

type DepthEvent = {
  id: string
  parentEventId: string | null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" ? value : null
}

export function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export function eventSignature(event: SignedEvent): string | null {
  if (event.type !== "solana_tx") {
    return null
  }

  const payload = isRecord(event.payload) ? event.payload : {}
  return readString(payload, "signature")
}

export function eventCluster(event: SignedEvent): string {
  const payload = isRecord(event.payload) ? event.payload : {}
  return readString(payload, "cluster") ?? "devnet"
}

export function explorerTxUrl(signature: string, cluster: string): string {
  const normalized = cluster === "mainnet" || cluster === "mainnet-beta" ? null : cluster
  const suffix = normalized === null ? "" : `?cluster=${normalized}`
  return `https://explorer.solana.com/tx/${signature}${suffix}`
}

export function eventHeadline(event: SignedEvent): string {
  const payload = isRecord(event.payload) ? event.payload : {}

  if (event.type === "llm_call") {
    const provider = readString(payload, "provider") ?? "llm"
    const model = readString(payload, "model") ?? "model"
    return `${provider} · ${model}`
  }

  if (event.type === "tool_call") {
    const toolName = readString(payload, "toolName") ?? "tool call"
    const output = isRecord(payload.output) ? payload.output : null
    const impact = output === null ? null : readNumber(output, "priceImpactPct")
    return impact === null ? toolName : `${toolName} · ${impact}% impact`
  }

  if (event.type === "solana_tx") {
    const instructions = readStringArray(payload, "instructionNames")
    const status = readString(payload, "confirmationStatus")
    const label =
      instructions.length > 0
        ? instructions.join(", ")
        : (truncateHash(readString(payload, "signature")) ?? "solana tx")
    return status === null ? label : `${label} · ${status}`
  }

  if (event.type === "custom") {
    return readString(payload, "name") ?? "custom event"
  }

  return event.type
}

export function buildDepthMap(events: DepthEvent[]): Record<string, number> {
  const byId = new Map(events.map((event) => [event.id, event]))
  const cache: Record<string, number> = {}

  const depthOf = (event: DepthEvent, seen: Set<string>): number => {
    const cached = cache[event.id]
    if (cached !== undefined) {
      return cached
    }

    if (event.parentEventId === null || seen.has(event.id)) {
      cache[event.id] = 0
      return 0
    }

    const parent = byId.get(event.parentEventId)
    if (parent === undefined) {
      cache[event.id] = 0
      return 0
    }

    seen.add(event.id)
    const depth = depthOf(parent, seen) + 1
    cache[event.id] = depth
    return depth
  }

  for (const event of events) {
    depthOf(event, new Set())
  }

  return cache
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null"
}

export function truncateHash(value: string | null, start = 6, end = 6): string | null {
  if (value === null || value.length <= start + end + 1) {
    return value
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`
}

// Forensic timestamps are always rendered in UTC so server and client agree (no hydration drift)
// and every case file reads in one timezone regardless of who opens it.
const utcDateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const utcTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

export function formatDate(value: Date): string {
  return `${utcDateTimeFormat.format(value)} UTC`
}

export function formatTime(value: Date): string {
  return `${utcTimeFormat.format(value)} UTC`
}

export function formatOffset(start: Date, value: Date): string {
  const deltaMs = Math.max(0, value.getTime() - start.getTime())
  if (deltaMs < 1000) {
    return `${deltaMs}ms`
  }

  return `${(deltaMs / 1000).toFixed(2)}s`
}

export function formatRelative(value: Date): string {
  const deltaSeconds = Math.round((Date.now() - value.getTime()) / 1000)

  if (Math.abs(deltaSeconds) < 60) {
    return "just now"
  }

  const minutes = Math.round(deltaSeconds / 60)
  if (Math.abs(minutes) < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return `${hours}h ago`
  }

  return `${Math.round(hours / 24)}d ago`
}

export function formatDuration(value: number | null): string {
  if (value === null) {
    return "running"
  }

  if (value < 1000) {
    return `${value}ms`
  }

  return `${(value / 1000).toFixed(2)}s`
}

export function formatCost(value: string): ReactNode {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return value
  }

  if (numeric < 0) {
    return (
      <Link
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
        href="https://ollama.com/settings/usage"
        target="_blank"
        rel="noreferrer"
      >
        usage tracked by Ollama
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </Link>
    )
  }

  return `$${numeric.toFixed(6)}`
}

export function confidenceBand(confidence: number): "low" | "moderate" | "high" {
  if (confidence >= 0.75) {
    return "high"
  }

  if (confidence >= 0.5) {
    return "moderate"
  }

  return "low"
}

export function statusVariant(status: string): TraceBadgeVariant {
  if (status === "completed") {
    return "success"
  }

  if (status === "errored" || status === "timeout") {
    return "error"
  }

  if (status === "running") {
    return "warning"
  }

  return "secondary"
}

export function eventVariant(type: string): TraceBadgeVariant {
  if (type === "llm_call") {
    return "default"
  }

  if (type === "solana_tx") {
    return "success"
  }

  if (type === "tool_call" || type === "mcp_call") {
    return "warning"
  }

  return "secondary"
}

export function failureVariant(failureType: string): TraceBadgeVariant {
  if (failureType === "none") {
    return "success"
  }

  if (failureType === "market_condition" || failureType === "model_limit") {
    return "warning"
  }

  if (
    failureType === "missing_information" ||
    failureType === "bad_instruction" ||
    failureType === "guardrail_gap"
  ) {
    return "error"
  }

  return "secondary"
}

export function failureLabel(failureType: string): string {
  if (failureType === "none") {
    return "healthy"
  }

  return failureType.replace(/_/g, " ")
}

export function verdictVariant(
  verdict: "avoidable" | "unavoidable" | "unclear",
): TraceBadgeVariant {
  if (verdict === "avoidable") {
    return "error"
  }

  if (verdict === "unavoidable") {
    return "success"
  }

  return "warning"
}
