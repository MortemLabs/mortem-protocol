// The trace detail screen presents metadata, timeline replay, context inspection, and analysis in
// a three-panel layout. It keeps sharing and clipboard actions client-side for fast debugging.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Share2,
} from "lucide-react"
import Link from "next/link"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import type { AppRouter } from "../../../../../../server/src/server/root"

type TraceOutput = NonNullable<inferRouterOutputs<AppRouter>["traces"]["get"]>
type TraceEventOutput = TraceOutput["events"][number]
type TraceAnalysisOutput = NonNullable<TraceOutput["analysis"]>

type CounterfactualView = {
  answer: string
  evidence: string
  question: string
  verdict: "avoidable" | "unavoidable" | "unclear"
}

type TraceAnalysisView = {
  analyzedAt: Date
  confidence: number
  counterfactuals: CounterfactualView[]
  failureType: string
  llmProvider: string
  modelUsed: string
  suggestedFix: string
  summary: string
  whatAgentMissed: string
  whatAgentSaw: string
}

type TraceEventView = {
  durationMs: number | null
  endedAt: Date | null
  errorMessage: string | null
  id: string
  parentEventId: string | null
  payload: unknown
  payloadEncrypted: boolean
  sequence: number
  startedAt: Date
  status: string
  type: string
}

type TraceDetailView = {
  agentId: string
  analysis: TraceAnalysisView | null
  durationMs: number | null
  endedAt: Date | null
  errorMessage: string | null
  eventCount: number
  events: TraceEventView[]
  id: string
  inputSummary: string
  outputSummary: string | null
  shareToken: string | null
  solanaTxCount: number
  startedAt: Date
  status: string
  tags: string[]
  toolsCalled: string[]
  totalCostUsd: string
  totalLamports: string
  totalTokens: number
}

const previewTrace: TraceDetailView = {
  agentId: "01JAGENTPREVIEW",
  analysis: {
    analyzedAt: new Date("2026-04-19T10:15:18.000Z"),
    confidence: 0.82,
    counterfactuals: [
      {
        answer: "The agent would have delayed the swap until a fresh Jupiter quote arrived.",
        evidence: "The route response was older than the market context captured for the tx.",
        question: "Would a fresh route have changed the decision?",
        verdict: "avoidable",
      },
      {
        answer: "The memo signer wallet still needed more SOL before the batch could land.",
        evidence: "The signer balance was below what the retry loop needed for transaction fees.",
        question: "Could the backend have committed without topping up the signer?",
        verdict: "unavoidable",
      },
    ],
    failureType: "market_condition",
    llmProvider: "ollama",
    modelUsed: "qwen2.5:72b",
    suggestedFix: "Refresh route context after every failed transaction simulation.",
    summary: "The trace completed, but the agent relied on stale route context before sending.",
    whatAgentMissed: "The price impact moved after the first quote and before the signed tx.",
    whatAgentSaw:
      "The model saw a valid Jupiter quote, wallet balance, and one successful simulation.",
  },
  durationMs: 1840,
  endedAt: new Date("2026-04-19T10:15:01.840Z"),
  errorMessage: null,
  eventCount: 4,
  events: [
    {
      durationMs: 620,
      endedAt: new Date("2026-04-19T10:15:00.620Z"),
      errorMessage: null,
      id: "01JEVENTLLM",
      parentEventId: null,
      payload: {
        costUsd: 0,
        model: "qwen2.5:72b",
        provider: "ollama",
        streamed: true,
        usage: { inputTokens: 1100, outputTokens: 420, totalTokens: 1520 },
      },
      payloadEncrypted: false,
      sequence: 1,
      startedAt: new Date("2026-04-19T10:15:00.000Z"),
      status: "ok",
      type: "llm_call",
    },
    {
      durationMs: 410,
      endedAt: new Date("2026-04-19T10:15:01.050Z"),
      errorMessage: null,
      id: "01JEVENTTOOL",
      parentEventId: "01JEVENTLLM",
      payload: {
        input: { inputMint: "SOL", outputMint: "USDC" },
        output: { outAmount: "14320000", priceImpactPct: 0.14 },
        toolName: "jupiter.quote",
      },
      payloadEncrypted: false,
      sequence: 2,
      startedAt: new Date("2026-04-19T10:15:00.640Z"),
      status: "ok",
      type: "tool_call",
    },
    {
      durationMs: 530,
      endedAt: new Date("2026-04-19T10:15:01.620Z"),
      errorMessage: null,
      id: "01JEVENTTX",
      parentEventId: null,
      payload: {
        cluster: "devnet",
        confirmationStatus: "confirmed",
        feeLamports: "5000",
        instructionNames: ["swap"],
        signature: "3PreviewSignature111111111111111111111111111111111",
      },
      payloadEncrypted: false,
      sequence: 3,
      startedAt: new Date("2026-04-19T10:15:01.090Z"),
      status: "ok",
      type: "solana_tx",
    },
    {
      durationMs: 190,
      endedAt: new Date("2026-04-19T10:15:01.840Z"),
      errorMessage: null,
      id: "01JEVENTCUSTOM",
      parentEventId: null,
      payload: {
        data: { routeAgeMs: 61200, risk: "stale_quote" },
        name: "risk.snapshot",
      },
      payloadEncrypted: false,
      sequence: 4,
      startedAt: new Date("2026-04-19T10:15:01.650Z"),
      status: "ok",
      type: "custom",
    },
  ],
  id: "01JTRACEPREVIEWA",
  inputSummary: "Swap route evaluation for SOL to USDC.",
  outputSummary: "Swap sent on devnet after the route evaluation completed.",
  shareToken: "01JSHAREPREVIEW",
  solanaTxCount: 1,
  startedAt: new Date("2026-04-19T10:15:00.000Z"),
  status: "completed",
  tags: ["swap", "jupiter"],
  toolsCalled: ["jupiter.quote"],
  totalCostUsd: "0",
  totalLamports: "5000",
  totalTokens: 4320,
}

export function TraceDetail({ traceId }: Readonly<{ traceId: string }>) {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return <TraceDetailFrame preview trace={previewTrace} />
  }

  return <AuthenticatedTraceDetail traceId={traceId} />
}

function AuthenticatedTraceDetail({ traceId }: Readonly<{ traceId: string }>) {
  const { authenticated, login, ready } = usePrivy()
  const utils = trpc.useUtils()
  const trace = trpc.traces.get.useQuery(
    { id: traceId },
    { enabled: ready && authenticated, retry: 1 },
  )
  const share = trpc.traces.share.useMutation({
    onSuccess: async () => {
      await utils.traces.get.invalidate({ id: traceId })
    },
  })
  const unshare = trpc.traces.unshare.useMutation({
    onSuccess: async () => {
      await utils.traces.get.invalidate({ id: traceId })
    },
  })

  if (!ready || trace.isLoading) {
    return <TraceDetailSkeleton />
  }

  if (!authenticated) {
    return (
      <TraceDetailMessage
        title="Sign in to inspect this trace."
        description="Trace payloads, sharing controls, and analysis are protected by your Privy session."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  if (trace.isError) {
    return (
      <TraceDetailMessage
        title="Trace did not load."
        description="Retry the request, check the server app, or sign in again if the session expired."
        actionLabel="Retry"
        onAction={() => trace.refetch()}
      />
    )
  }

  if (trace.data === null || trace.data === undefined) {
    return (
      <TraceDetailMessage
        title="Trace not found."
        description="This trace may have been deleted, unshared, or created under another agent owner."
      />
    )
  }

  return (
    <TraceDetailFrame
      trace={toTraceDetailView(trace.data)}
      onShare={() => share.mutate({ id: traceId })}
      onUnshare={() => unshare.mutate({ id: traceId })}
      sharing={share.isPending || unshare.isPending}
    />
  )
}

function TraceDetailFrame({
  onShare,
  onUnshare,
  preview = false,
  sharing = false,
  trace,
}: Readonly<{
  onShare?: () => void
  onUnshare?: () => void
  preview?: boolean
  sharing?: boolean
  trace: TraceDetailView
}>) {
  const [focusedEventId, setFocusedEventId] = useState<string | null>(trace.events[0]?.id ?? null)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setFocusedEventId(trace.events[0]?.id ?? null)
  }, [trace.events])

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const focusedEvent = useMemo(
    () => trace.events.find((event) => event.id === focusedEventId) ?? trace.events[0] ?? null,
    [focusedEventId, trace.events],
  )
  const focusedIndex = Math.max(
    0,
    trace.events.findIndex((event) => event.id === focusedEvent?.id),
  )
  const shareUrl =
    trace.shareToken === null
      ? null
      : origin.length === 0
        ? `/share/${trace.shareToken}`
        : `${origin}/share/${trace.shareToken}`

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1800px] px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href={`/app/agents/${trace.agentId}/traces`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Traces
            </Link>
          </Button>
          {preview ? <Badge variant="outline">preview data</Badge> : null}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
          <TraceMetadataPanel
            onShare={onShare}
            onUnshare={onUnshare}
            shareUrl={shareUrl}
            sharing={sharing}
            trace={trace}
          />
          <TraceTimelinePanel
            focusedIndex={focusedIndex}
            focusedEventId={focusedEvent?.id ?? null}
            onFocusEvent={setFocusedEventId}
            trace={trace}
          />
          <TraceInspectorPanel event={focusedEvent} trace={trace} />
        </div>
      </div>
    </main>
  )
}

function TraceMetadataPanel({
  onShare,
  onUnshare,
  shareUrl,
  sharing,
  trace,
}: Readonly<{
  onShare: (() => void) | undefined
  onUnshare: (() => void) | undefined
  shareUrl: string | null
  sharing: boolean
  trace: TraceDetailView
}>) {
  return (
    <aside className="border border-border bg-card text-card-foreground shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
          {trace.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">{trace.inputSummary}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{trace.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <TraceStat label="Duration" value={formatDuration(trace.durationMs)} />
        <TraceStat label="Events" value={String(trace.eventCount)} />
        <TraceStat label="Tokens" value={String(trace.totalTokens)} />
        <TraceStat label="Cost" value={formatCost(trace.totalCostUsd)} />
        <TraceStat label="Lamports" value={trace.totalLamports} />
        <TraceStat label="Txs" value={String(trace.solanaTxCount)} />
      </div>
      <section className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-normal">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share controls
        </h2>
        <div className="mt-3 space-y-3">
          {shareUrl === null ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Create a read-only public link for this trace.
            </p>
          ) : (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">Public link</p>
              <Link className="mt-1 block break-all font-mono text-xs underline" href={shareUrl}>
                {shareUrl}
              </Link>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {trace.shareToken === null ? (
              <Button type="button" disabled={onShare === undefined || sharing} onClick={onShare}>
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Share
              </Button>
            ) : (
              <Button
                type="button"
                disabled={onUnshare === undefined || sharing}
                onClick={onUnshare}
                variant="secondary"
              >
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Unshare
              </Button>
            )}
            {shareUrl === null ? null : <CopyButton label="Copy link" value={shareUrl} />}
          </div>
        </div>
      </section>

      <TraceAnalysisPanel analysis={trace.analysis} />
    </aside>
  )
}

function TraceTimelinePanel({
  focusedEventId,
  focusedIndex,
  onFocusEvent,
  trace,
}: Readonly<{
  focusedEventId: string | null
  focusedIndex: number
  onFocusEvent: (id: string) => void
  trace: TraceDetailView
}>) {
  return (
    <section className="min-w-0 border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Timeline</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">Chronological events</h2>
          </div>
          <Badge variant="outline">{formatDate(trace.startedAt)}</Badge>
        </div>

        <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="scrub">
          Scrub events
        </label>
        <input
          id="scrub"
          type="range"
          min={0}
          max={Math.max(0, trace.events.length - 1)}
          value={focusedIndex}
          onChange={(event) => {
            const next = trace.events[Number(event.currentTarget.value)]
            if (next !== undefined) {
              onFocusEvent(next.id)
            }
          }}
          className="mt-2 h-10 w-full accent-primary"
        />
      </div>

      <div className="divide-y divide-border">
        {trace.events.map((event) => (
          <details
            key={event.id}
            open={event.id === focusedEventId}
            className="group p-4 open:bg-accent/40"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <button
                type="button"
                onClick={(clickEvent) => {
                  clickEvent.preventDefault()
                  onFocusEvent(event.id)
                }}
                className="min-w-0 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={eventVariant(event.type)}>{event.type}</Badge>
                  <Badge variant={event.status === "ok" ? "success" : "error"}>
                    {event.status}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">#{event.sequence}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{eventHeadline(event)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(event.startedAt)} · {formatDuration(event.durationMs)}
                </p>
              </button>
              <ChevronRight
                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <TraceDetailRow label="Parent" value={event.parentEventId ?? "root"} />
              <TraceDetailRow
                label="Ended"
                value={event.endedAt === null ? "pending" : formatDate(event.endedAt)}
              />
              <TraceDetailRow
                label="Payload"
                value={event.payloadEncrypted ? "encrypted" : "plain JSON"}
              />
              <TraceDetailRow label="Error" value={event.errorMessage ?? "none"} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function TraceInspectorPanel({
  event,
  trace,
}: Readonly<{ event: TraceEventView | null; trace: TraceDetailView }>) {
  if (event === null) {
    return (
      <aside className="border border-border bg-card p-4 text-card-foreground shadow-sm">
        <h2 className="text-xl font-semibold tracking-normal">Context inspector</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No events were captured for this trace.
        </p>
      </aside>
    )
  }

  const markdown = buildEventMarkdown(trace, event)

  return (
    <aside className="min-w-0 border border-border bg-card text-card-foreground shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
      <div className="border-b border-border p-4">
        <p className="text-sm font-medium text-muted-foreground">Context inspector</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal">{eventHeadline(event)}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton label="Copy as markdown" value={markdown} />
          <Badge variant={event.payloadEncrypted ? "warning" : "outline"}>
            {event.payloadEncrypted ? "encrypted" : "visible"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <TraceStat label="Type" value={event.type} />
        <TraceStat label="Sequence" value={String(event.sequence)} />
        <TraceStat label="Started" value={formatTime(event.startedAt)} />
        <TraceStat label="Duration" value={formatDuration(event.durationMs)} />
      </div>

      <section className="p-4">
        <h3 className="text-sm font-semibold tracking-normal">Payload</h3>
        <pre className="mt-3 max-h-[560px] overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5">
          {formatJson(event.payload)}
        </pre>
      </section>
    </aside>
  )
}

function TraceAnalysisPanel({ analysis }: Readonly<{ analysis: TraceAnalysisView | null }>) {
  if (analysis === null) {
    return (
      <section className="p-4">
        <h2 className="text-sm font-semibold tracking-normal">AI Analysis</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Analysis is queued once the trace completes.
        </p>
      </section>
    )
  }

  return (
    <section className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-normal">AI Analysis</h2>
        <Badge variant={failureVariant(analysis.failureType)}>{analysis.failureType}</Badge>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Confidence</span>
          <span>{Math.round(analysis.confidence * 100)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-sm bg-muted">
          <div
            className="h-2 rounded-sm bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, analysis.confidence * 100))}%` }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-4 text-sm leading-6">
        <AnalysisBlock label="Summary" value={analysis.summary} />
        <AnalysisBlock label="What agent saw" value={analysis.whatAgentSaw} />
        <AnalysisBlock label="What agent missed" value={analysis.whatAgentMissed} />
        <AnalysisBlock label="Suggested fix" value={analysis.suggestedFix} />
      </div>

      <div className="mt-5 space-y-2">
        {analysis.counterfactuals.map((item, index) => (
          <details
            key={`${item.question}-${index}`}
            className="rounded-md border border-border p-3"
          >
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {item.question}
            </summary>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <Badge variant={verdictVariant(item.verdict)}>{item.verdict}</Badge>
              <p>{item.answer}</p>
              <p>{item.evidence}</p>
            </div>
          </details>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {analysis.llmProvider} · {analysis.modelUsed} · {formatDate(analysis.analyzedAt)}
      </p>
    </section>
  )
}

function TraceDetailSkeleton() {
  return (
    <main
      className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-[1800px]">
        <div className="h-10 w-28 rounded-md bg-muted" />
        <div className="mt-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
          {[0, 1, 2].map((panel) => (
            <section key={panel} className="border border-border bg-card p-4 shadow-sm">
              <div className="h-6 w-40 rounded-md bg-muted" />
              <div className="mt-6 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-12 rounded-md bg-muted" />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}

function TraceDetailMessage({
  actionLabel,
  description,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {actionLabel === undefined || onAction === undefined ? null : (
            <Button type="button" onClick={onAction}>
              {actionLabel === "Retry" ? (
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              ) : null}
              {actionLabel}
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/app">Agents</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button type="button" variant="outline" onClick={copy}>
      <Copy className="h-4 w-4" aria-hidden="true" />
      {copied ? "Copied" : label}
    </Button>
  )
}

function TraceStat({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}

function TraceDetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="py-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-xs tabular-nums">{value}</p>
    </div>
  )
}

function AnalysisBlock({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </h3>
      <p className="mt-1">{value}</p>
    </div>
  )
}

function toTraceDetailView(trace: TraceOutput): TraceDetailView {
  return {
    agentId: trace.agentId,
    analysis: trace.analysis === null ? null : toAnalysisView(trace.analysis),
    durationMs: trace.durationMs,
    endedAt: trace.endedAt,
    errorMessage: trace.errorMessage,
    eventCount: trace.eventCount,
    events: trace.events.map(toEventView),
    id: trace.id,
    inputSummary: trace.inputSummary,
    outputSummary: trace.outputSummary,
    shareToken: trace.shareToken,
    solanaTxCount: trace.solanaTxCount,
    startedAt: trace.startedAt,
    status: trace.status,
    tags: trace.tags,
    toolsCalled: trace.toolsCalled,
    totalCostUsd: trace.totalCostUsd.toString(),
    totalLamports: trace.totalLamports.toString(),
    totalTokens: trace.totalTokens,
  }
}

function toEventView(event: TraceEventOutput): TraceEventView {
  return {
    durationMs: event.durationMs,
    endedAt: event.endedAt,
    errorMessage: event.errorMessage,
    id: event.id,
    parentEventId: event.parentEventId,
    payload: event.payload,
    payloadEncrypted: event.payloadEncrypted,
    sequence: event.sequence,
    startedAt: event.startedAt,
    status: event.status,
    type: event.type,
  }
}

function toAnalysisView(analysis: TraceAnalysisOutput): TraceAnalysisView {
  return {
    analyzedAt: analysis.analyzedAt,
    confidence: analysis.confidence,
    counterfactuals: parseCounterfactuals(analysis.counterfactuals),
    failureType: analysis.failureType,
    llmProvider: analysis.llmProvider,
    modelUsed: analysis.modelUsed,
    suggestedFix: analysis.suggestedFix,
    summary: analysis.summary,
    whatAgentMissed: analysis.whatAgentMissed,
    whatAgentSaw: analysis.whatAgentSaw,
  }
}

function parseCounterfactuals(value: unknown): CounterfactualView[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const question = readString(item, "question")
    const answer = readString(item, "answer")
    const evidence = readString(item, "evidence")
    const verdict = readVerdict(item.verdict)

    if (question === null || answer === null || evidence === null || verdict === null) {
      return []
    }

    return [{ answer, evidence, question, verdict }]
  })
}

function buildEventMarkdown(trace: TraceDetailView, event: TraceEventView): string {
  return [
    `### ${event.type} #${event.sequence}`,
    "",
    `Trace: ${trace.id}`,
    `Status: ${event.status}`,
    `Started: ${formatDate(event.startedAt)}`,
    `Duration: ${formatDuration(event.durationMs)}`,
    "",
    "```json",
    formatJson(event.payload),
    "```",
  ].join("\n")
}

function eventHeadline(event: TraceEventView): string {
  const payload = isRecord(event.payload) ? event.payload : {}

  if (event.type === "llm_call") {
    const provider = readString(payload, "provider") ?? "llm"
    const model = readString(payload, "model") ?? "model"
    return `${provider} · ${model}`
  }

  if (event.type === "tool_call") {
    return readString(payload, "toolName") ?? "tool call"
  }

  if (event.type === "solana_tx") {
    return (
      readString(payload, "signature") ??
      readStringArray(payload, "instructionNames").join(", ") ??
      "solana tx"
    )
  }

  if (event.type === "custom") {
    return readString(payload, "name") ?? "custom event"
  }

  return event.type
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null"
}

function formatDate(value: Date): string {
  return value.toLocaleString()
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString()
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "running"
  }

  if (value < 1000) {
    return `${value}ms`
  }

  return `${(value / 1000).toFixed(2)}s`
}

function formatCost(value: string): ReactNode {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" ? value : null
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function readVerdict(value: unknown): CounterfactualView["verdict"] | null {
  return value === "avoidable" || value === "unavoidable" || value === "unclear" ? value : null
}

function statusVariant(
  status: string,
): "default" | "error" | "outline" | "secondary" | "success" | "warning" {
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

function eventVariant(
  type: string,
): "default" | "error" | "outline" | "secondary" | "success" | "warning" {
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

function failureVariant(
  failureType: string,
): "default" | "error" | "outline" | "secondary" | "success" | "warning" {
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

function verdictVariant(
  verdict: CounterfactualView["verdict"],
): "default" | "error" | "outline" | "secondary" | "success" | "warning" {
  if (verdict === "avoidable") {
    return "error"
  }

  if (verdict === "unavoidable") {
    return "success"
  }

  return "warning"
}
