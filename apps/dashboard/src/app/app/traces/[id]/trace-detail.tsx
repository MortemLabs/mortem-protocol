// The trace detail screen presents metadata, timeline replay, context inspection, and analysis in
// a three-panel layout. It keeps sharing and clipboard actions client-side for fast debugging.
"use client"

import { useRegisterCrumb } from "@/components/app-shell"
import { trpc, useDashboardAuth } from "@/components/providers"
import { CopyButton } from "@/components/mortem/copy-button"
import {
  buildDepthMap,
  confidenceBand,
  eventCluster,
  eventHeadline,
  eventSignature,
  eventVariant,
  explorerTxUrl,
  failureLabel,
  failureVariant,
  formatCost,
  formatDate,
  formatDuration,
  formatJson,
  formatOffset,
  formatRelative,
  formatTime,
  isRecord,
  readString,
  statusVariant,
  truncateHash,
  verdictVariant,
} from "@/components/mortem/trace-format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Search,
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
    {
      enabled: ready && authenticated,
      retry: 1,
      // A running trace keeps producing events; poll until it reaches a terminal state.
      refetchInterval: (query) => (query.state.data?.status === "running" ? 4000 : false),
    },
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
  const rerun = trpc.analysis.rerun.useMutation()

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
      onRerun={() => rerun.mutate({ traceId })}
      rerunPending={rerun.isPending}
      rerunQueued={rerun.isSuccess}
    />
  )
}

function TraceDetailFrame({
  onRerun,
  onShare,
  onUnshare,
  preview = false,
  rerunPending = false,
  rerunQueued = false,
  sharing = false,
  trace,
}: Readonly<{
  onRerun?: () => void
  onShare?: () => void
  onUnshare?: () => void
  preview?: boolean
  rerunPending?: boolean
  rerunQueued?: boolean
  sharing?: boolean
  trace: TraceDetailView
}>) {
  const [focusedEventId, setFocusedEventId] = useState<string | null>(trace.events[0]?.id ?? null)
  const [origin, setOrigin] = useState("")
  useRegisterCrumb(trace.id, trace.inputSummary)

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
    <div className="mx-auto max-w-[1800px] px-4 py-8 md:px-6 lg:px-8">
        {preview ? (
          <div className="mb-4 flex justify-end">
            <Badge variant="outline">preview data</Badge>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
          <TraceMetadataPanel
            onRerun={onRerun}
            onShare={onShare}
            onUnshare={onUnshare}
            preview={preview}
            rerunPending={rerunPending}
            rerunQueued={rerunQueued}
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
  )
}

function TraceMetadataPanel({
  onRerun,
  onShare,
  onUnshare,
  preview,
  rerunPending,
  rerunQueued,
  shareUrl,
  sharing,
  trace,
}: Readonly<{
  onRerun: (() => void) | undefined
  onShare: (() => void) | undefined
  onUnshare: (() => void) | undefined
  preview: boolean
  rerunPending: boolean
  rerunQueued: boolean
  shareUrl: string | null
  sharing: boolean
  trace: TraceDetailView
}>) {
  return (
    <aside className="border border-line bg-ink-2 text-card-foreground xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
      <div className="border-b border-line p-4">
        <p className="eyebrow">Dossier</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
          {trace.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 font-display text-2xl leading-tight">{trace.inputSummary}</h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {trace.id}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        <TraceStat label="Duration" value={formatDuration(trace.durationMs)} />
        <TraceStat label="Events" value={String(trace.eventCount)} />
        <TraceStat label="Tokens" value={String(trace.totalTokens)} />
        <TraceStat label="Cost" value={formatCost(trace.totalCostUsd)} />
        <TraceStat label="Lamports" value={trace.totalLamports} />
        <TraceStat label="Txs" value={String(trace.solanaTxCount)} />
      </div>

      <section className="border-b border-line p-4">
        <h2 className="eyebrow">Cause of death</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
          {trace.endedAt === null ? (
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
              in progress
            </span>
          ) : (
            <span
              className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted"
              title={formatDate(trace.endedAt)}
            >
              closed {formatRelative(trace.endedAt)}
            </span>
          )}
        </div>
        {trace.errorMessage === null ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {trace.outputSummary ?? "No closing summary was recorded for this trace."}
          </p>
        ) : (
          <p className="mt-3 break-words border border-signal/40 bg-ink p-3 text-sm leading-6 text-signal">
            {trace.errorMessage}
          </p>
        )}
      </section>

      <section className="border-b border-line p-4">
        <h2 className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em]">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share controls
        </h2>
        <div className="mt-3 space-y-3">
          {shareUrl === null ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Create a read-only public link for this trace.
            </p>
          ) : (
            <div className="border border-line bg-ink p-3">
              <p className="eyebrow">Public link</p>
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

      <TraceAnalysisPanel
        analysis={trace.analysis}
        onRerun={onRerun}
        preview={preview}
        rerunPending={rerunPending}
        rerunQueued={rerunQueued}
        traceStatus={trace.status}
      />
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
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const depthMap = useMemo(() => buildDepthMap(trace.events), [trace.events])
  const eventTypes = useMemo(
    () => Array.from(new Set(trace.events.map((event) => event.type))),
    [trace.events],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEvents = useMemo(
    () =>
      trace.events.filter((event) => {
        if (typeFilter !== "all" && event.type !== typeFilter) {
          return false
        }

        if (normalizedQuery.length === 0) {
          return true
        }

        return eventSearchText(event).includes(normalizedQuery)
      }),
    [trace.events, typeFilter, normalizedQuery],
  )

  return (
    <section className="min-w-0 border border-line bg-ink-2 text-card-foreground">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">06 · Timeline</p>
            <h2 className="mt-2 font-display text-2xl leading-tight">Event chronology</h2>
          </div>
          <Badge variant="outline">{formatDate(trace.startedAt)}</Badge>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search events, payloads, signatures"
              aria-label="Search events"
              className="h-10 w-full border border-line bg-ink pl-9 pr-3 font-mono text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events by type">
            <button
              type="button"
              aria-pressed={typeFilter === "all"}
              data-active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              className="inline-flex min-h-9 items-center border border-line px-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-signal data-[active=true]:text-paper"
            >
              all
            </button>
            {eventTypes.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={typeFilter === type}
                data-active={typeFilter === type}
                onClick={() => setTypeFilter(type)}
                className="inline-flex min-h-9 items-center border border-line px-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-signal data-[active=true]:text-paper"
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block font-mono text-[0.625rem] uppercase tracking-[0.16em] text-fg-muted" htmlFor="scrub">
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
          className="mt-2 h-10 w-full accent-signal"
        />
      </div>

      {filteredEvents.length === 0 ? (
        <p className="p-4 font-mono text-xs uppercase tracking-[0.16em] text-fg-muted">
          No events match this filter.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {filteredEvents.map((event) => {
            const signature = eventSignature(event)
            const depth = depthMap[event.id] ?? 0

            return (
              <details
                key={event.id}
                open={event.id === focusedEventId}
                className="group p-4 open:bg-ink-3"
                style={{ paddingLeft: `${16 + depth * 20}px` }}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.preventDefault()
                      onFocusEvent(event.id)
                    }}
                    className="min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {depth > 0 ? (
                        <span className="font-mono text-xs text-line" aria-hidden="true">
                          └
                        </span>
                      ) : null}
                      <Badge variant={eventVariant(event.type)}>{event.type}</Badge>
                      <Badge variant={event.status === "ok" ? "success" : "error"}>
                        {event.status}
                      </Badge>
                      <span className="font-mono text-xs text-fg-muted">#{event.sequence}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{eventHeadline(event)}</p>
                    <p
                      className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-fg-muted"
                      title={formatDate(event.startedAt)}
                    >
                      +{formatOffset(trace.startedAt, event.startedAt)} ·{" "}
                      {formatDuration(event.durationMs)}
                    </p>
                  </button>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {signature === null ? null : (
                    <div className="md:col-span-2">
                      <p className="eyebrow">Signature</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="font-mono text-xs tabular-nums">{truncateHash(signature)}</p>
                        <CopyButton label="Copy tx hash" size="sm" value={signature} />
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={explorerTxUrl(signature, eventCluster(event))}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Explorer
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
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
            )
          })}
        </div>
      )}
    </section>
  )
}

function TraceInspectorPanel({
  event,
  trace,
}: Readonly<{ event: TraceEventView | null; trace: TraceDetailView }>) {
  if (event === null) {
    return (
      <aside className="border border-line bg-ink-2 p-4 text-card-foreground">
        <p className="eyebrow">Inspector</p>
        <h2 className="mt-2 font-display text-2xl leading-tight">Context inspector</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No events were captured for this trace.
        </p>
      </aside>
    )
  }

  const markdown = buildEventMarkdown(trace, event)
  const signature = eventSignature(event)

  return (
    <aside className="min-w-0 border border-line bg-ink-2 text-card-foreground xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
      <div className="border-b border-line p-4">
        <p className="eyebrow">Inspector</p>
        <h2 className="mt-2 font-display text-2xl leading-tight">{eventHeadline(event)}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton label="Copy as markdown" value={markdown} />
          {signature === null ? null : <CopyButton label="Copy tx hash" value={signature} />}
          {signature === null ? null : (
            <Button asChild size="sm" variant="outline">
              <Link
                href={explorerTxUrl(signature, eventCluster(event))}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explorer
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          )}
          <Badge variant={event.payloadEncrypted ? "warning" : "outline"}>
            {event.payloadEncrypted ? "encrypted" : "visible"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        <TraceStat label="Type" value={event.type} />
        <TraceStat label="Sequence" value={String(event.sequence)} />
        <TraceStat label="Started" value={formatTime(event.startedAt)} />
        <TraceStat label="Duration" value={formatDuration(event.durationMs)} />
      </div>

      <section className="p-4">
        <h3 className="eyebrow">Payload</h3>
        <pre className="mt-3 max-h-[560px] overflow-auto border border-line bg-ink p-3 text-xs leading-5">
          {formatJson(event.payload)}
        </pre>
      </section>
    </aside>
  )
}

function TraceAnalysisPanel({
  analysis,
  onRerun,
  preview,
  rerunPending,
  rerunQueued,
  traceStatus,
}: Readonly<{
  analysis: TraceAnalysisView | null
  onRerun: (() => void) | undefined
  preview: boolean
  rerunPending: boolean
  rerunQueued: boolean
  traceStatus: string
}>) {
  if (analysis === null) {
    const traceClosed = traceStatus !== "running"

    return (
      <section className="p-4">
        <h2 className="eyebrow">Autopsy</h2>
        {!traceClosed ? (
          <p className="mt-2 flex items-center gap-2 text-sm leading-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            The trace is still open. Autopsy runs once it closes.
          </p>
        ) : rerunQueued ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Autopsy queued. It appears here once the analysis worker finishes — refresh in a moment.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              No autopsy has been filed for this trace yet.
            </p>
            {preview ? null : (
              <Button
                type="button"
                className="mt-4"
                disabled={onRerun === undefined || rerunPending}
                onClick={onRerun}
              >
                {rerunPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Run autopsy
              </Button>
            )}
          </>
        )}
      </section>
    )
  }

  return (
    <section className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="eyebrow">Autopsy</h2>
        <Badge variant={failureVariant(analysis.failureType)}>
          {failureLabel(analysis.failureType)}
        </Badge>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <span>Confidence · {confidenceBand(analysis.confidence)}</span>
          <span>{Math.round(analysis.confidence * 100)}%</span>
        </div>
        <div className="mt-2 h-2 bg-ink-3">
          <div
            className="h-2 bg-signal"
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
          <details key={`${item.question}-${index}`} className="border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

      {preview ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={onRerun === undefined || rerunPending || rerunQueued}
          onClick={onRerun}
        >
          {rerunPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          )}
          {rerunQueued ? "Autopsy re-queued" : "Rerun autopsy"}
        </Button>
      )}
    </section>
  )
}

function TraceDetailSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1800px] px-4 py-8 md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div>
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
          {[0, 1, 2].map((panel) => (
            <section key={panel} className="border border-line bg-ink-2 p-4">
              <div className="h-6 w-40 bg-ink-3" />
              <div className="mt-6 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-12 bg-ink-3" />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
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
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10 md:px-6">
      <section className="w-full max-w-md border border-line bg-ink-2 p-6 text-card-foreground">
        <AlertCircle className="h-5 w-5 text-signal" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl leading-tight">{title}</h1>
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
    </div>
  )
}

function TraceStat({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="bg-ink-2 p-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 break-words font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}

function TraceDetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="py-1">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 break-words font-mono text-xs tabular-nums">{value}</p>
    </div>
  )
}

function AnalysisBlock({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <h3 className="eyebrow">{label}</h3>
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

function eventSearchText(event: TraceEventView): string {
  return [
    event.type,
    event.status,
    String(event.sequence),
    eventHeadline(event),
    event.errorMessage ?? "",
    formatJson(event.payload),
  ]
    .join(" ")
    .toLowerCase()
}

function readVerdict(value: unknown): CounterfactualView["verdict"] | null {
  return value === "avoidable" || value === "unavoidable" || value === "unclear" ? value : null
}
