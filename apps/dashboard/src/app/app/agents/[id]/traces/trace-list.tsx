// The trace list renders protected tRPC results and local preview rows with identical layout.
// It includes loading, empty, and recovery states so filtering never leaves a blank surface.
"use client"

import { formatDate, statusVariant } from "@/components/mortem/trace-format"
import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import { AlertCircle, Clock, Filter, RefreshCcw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import type { AppRouter } from "../../../../../../../server/src/server/root"

type TraceListItem = inferRouterOutputs<AppRouter>["traces"]["list"]["items"][number]
type StatusFilter = "all" | "running" | "completed" | "errored" | "timeout"

const previewTraces = [
  {
    durationMs: 1840,
    eventCount: 12,
    id: "01JTRACEPREVIEWA",
    inputSummary: "Swap route evaluation for SOL to USDC.",
    solanaTxCount: 1,
    startedAt: new Date("2026-04-19T10:10:00.000Z"),
    status: "completed",
    tags: ["swap", "jupiter"],
    totalTokens: 4320,
  },
  {
    durationMs: null,
    eventCount: 7,
    id: "01JTRACEPREVIEWB",
    inputSummary: "Memo commit retry after signer fee exhaustion.",
    solanaTxCount: 0,
    startedAt: new Date("2026-04-19T10:14:00.000Z"),
    status: "errored",
    tags: ["memo-anchor"],
    totalTokens: 980,
  },
] satisfies PreviewTrace[]

type PreviewTrace = Pick<
  TraceListItem,
  | "durationMs"
  | "eventCount"
  | "id"
  | "inputSummary"
  | "solanaTxCount"
  | "startedAt"
  | "status"
  | "tags"
  | "totalTokens"
>

export function TraceList({ agentId }: Readonly<{ agentId: string }>) {
  const { privyEnabled } = useDashboardAuth()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [tag, setTag] = useState<string | null>(null)

  const clearFilters = () => {
    setStatus("all")
    setTag(null)
  }

  if (!privyEnabled) {
    return (
      <PreviewTraceList
        agentId={agentId}
        status={status}
        setStatus={setStatus}
        tag={tag}
        setTag={setTag}
        onClearFilters={clearFilters}
      />
    )
  }

  return (
    <AuthenticatedTraceList
      agentId={agentId}
      status={status}
      setStatus={setStatus}
      tag={tag}
      setTag={setTag}
      onClearFilters={clearFilters}
    />
  )
}

function PreviewTraceList({
  agentId,
  onClearFilters,
  setStatus,
  setTag,
  status,
  tag,
}: Readonly<{
  agentId: string
  onClearFilters: () => void
  setStatus: (status: StatusFilter) => void
  setTag: (tag: string | null) => void
  status: StatusFilter
  tag: string | null
}>) {
  const tags = collectTags(previewTraces)
  const visible = previewTraces.filter(
    (trace) =>
      (status === "all" || trace.status === status) && (tag === null || trace.tags.includes(tag)),
  )

  if (visible.length === 0) {
    return (
      <TraceEmpty
        agentId={agentId}
        status={status}
        tag={tag}
        onClearFilters={onClearFilters}
      />
    )
  }

  return (
    <TraceListFrame
      traces={visible}
      status={status}
      setStatus={setStatus}
      tag={tag}
      setTag={setTag}
      tags={tags}
    />
  )
}

function AuthenticatedTraceList({
  agentId,
  onClearFilters,
  setStatus,
  setTag,
  status,
  tag,
}: Readonly<{
  agentId: string
  onClearFilters: () => void
  setStatus: (status: StatusFilter) => void
  setTag: (tag: string | null) => void
  status: StatusFilter
  tag: string | null
}>) {
  const { authenticated, login, ready } = usePrivy()
  const traces = trpc.traces.list.useInfiniteQuery(
    {
      agentId,
      limit: 25,
      status: status === "all" ? undefined : status,
      tag: tag ?? undefined,
    },
    {
      enabled: ready && authenticated,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      retry: 1,
    },
  )

  if (!ready || traces.isLoading) {
    return <TraceListSkeleton agentId={agentId} />
  }

  if (!authenticated) {
    return (
      <TraceMessage
        agentId={agentId}
        title="Sign in to load traces."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  if (traces.isError) {
    return (
      <TraceMessage
        agentId={agentId}
        title="Traces did not load."
        description="Check the server app, retry the request, or sign in again if your session expired."
        actionLabel="Retry"
        onAction={() => traces.refetch()}
      />
    )
  }

  const traceRows = traces.data?.pages.flatMap((page) => page.items) ?? []

  if (traceRows.length === 0) {
    return (
      <TraceEmpty agentId={agentId} status={status} tag={tag} onClearFilters={onClearFilters} />
    )
  }

  return (
    <TraceListFrame
      traces={traceRows}
      status={status}
      setStatus={setStatus}
      tag={tag}
      setTag={setTag}
      tags={collectTags(traceRows)}
      hasMore={traces.hasNextPage ?? false}
      loadingMore={traces.isFetchingNextPage}
      onLoadMore={() => void traces.fetchNextPage()}
    />
  )
}

function TraceListFrame({
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  setStatus,
  setTag,
  status,
  tag,
  tags,
  traces,
}: Readonly<{
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  setStatus: (status: StatusFilter) => void
  setTag: (tag: string | null) => void
  status: StatusFilter
  tag: string | null
  tags: string[]
  traces: PreviewTrace[]
}>) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <section className="border border-line bg-ink-2 text-card-foreground">
        <div className="flex flex-col gap-4 border-b border-line p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Case ledger</p>
            <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight">
              Trace history
            </h1>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Trace status filters"
          >
            {(["all", "running", "completed", "errored", "timeout"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={status === item}
                className="inline-flex min-h-9 items-center border border-line px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-signal data-[active=true]:text-paper"
                data-active={status === item}
                onClick={() => setStatus(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {tags.length === 0 ? null : (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-line p-4"
            role="group"
            aria-label="Trace tag filters"
          >
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-fg-muted">
              Tags
            </span>
            <button
              type="button"
              aria-pressed={tag === null}
              data-active={tag === null}
              onClick={() => setTag(null)}
              className="inline-flex min-h-8 items-center border border-line px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-signal data-[active=true]:text-paper"
            >
              all
            </button>
            {tags.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={tag === item}
                data-active={tag === item}
                onClick={() => setTag(item)}
                className="inline-flex min-h-8 items-center border border-line px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-signal data-[active=true]:text-paper"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="divide-y divide-line">
          {traces.map((trace) => (
            <Link
              key={trace.id}
              href={`/app/traces/${trace.id}`}
              className="grid gap-4 p-5 transition-colors hover:bg-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(0,1fr)_100px_100px_100px]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                  <span className="font-mono text-xs tabular-nums text-fg-muted">{trace.id}</span>
                </div>
                <p className="mt-2 text-sm leading-6">{trace.inputSummary}</p>
                <p className="mt-2 flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-fg-muted">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(trace.startedAt)}
                </p>
              </div>
              <TraceMetric label="Events" value={String(trace.eventCount)} />
              <TraceMetric label="Tokens" value={String(trace.totalTokens)} />
              <TraceMetric label="Txs" value={String(trace.solanaTxCount)} />
            </Link>
          ))}
        </div>

        {hasMore ? (
          <div className="border-t border-line p-4">
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Load older traces
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function collectTags(traces: PreviewTrace[]): string[] {
  return Array.from(new Set(traces.flatMap((trace) => trace.tags))).sort()
}

function TraceEmpty({
  agentId,
  onClearFilters,
  status,
  tag,
}: Readonly<{
  agentId: string
  onClearFilters: () => void
  status: StatusFilter
  tag: string | null
}>) {
  if (status === "all" && tag === null) {
    return (
      <TraceMessage
        agentId={agentId}
        title="No traces yet."
        description="Start a Mortem SDK session from your agent and completed traces will appear here."
      />
    )
  }

  return (
    <TraceMessage
      agentId={agentId}
      title="No traces match these filters."
      description="Loosen the status or tag filters to see more of the case ledger."
      actionLabel="Clear filters"
      onAction={onClearFilters}
    />
  )
}

function TraceListSkeleton({ agentId }: Readonly<{ agentId: string }>) {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div>
        <section className="border border-line bg-ink-2 p-5">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Loading traces for {agentId}
          </div>
          <div className="mt-6 space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_100px_100px_100px]"
              >
                <div className="space-y-3">
                  <div className="h-5 w-56 bg-ink-3" />
                  <div className="h-4 w-full max-w-xl bg-ink-3" />
                </div>
                <div className="h-10 bg-ink-3" />
                <div className="h-10 bg-ink-3" />
                <div className="h-10 bg-ink-3" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function TraceMessage({
  actionLabel,
  agentId,
  description = "Return to the agent detail page and check the ingest configuration.",
  onAction,
  title,
}: Readonly<{
  actionLabel?: string
  agentId: string
  description?: string
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
            <Link href={`/app/agents/${agentId}`}>Agent detail</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

function TraceMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 lg:block">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-fg-muted">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}
