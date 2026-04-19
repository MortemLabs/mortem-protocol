// The trace list renders protected tRPC results and local preview rows with identical layout.
// It includes loading, empty, and recovery states so filtering never leaves a blank surface.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import { AlertCircle, ArrowLeft, Clock, Filter, RefreshCcw } from "lucide-react"
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
    inputSummary: "PDA funding check before anchor commit.",
    solanaTxCount: 0,
    startedAt: new Date("2026-04-19T10:14:00.000Z"),
    status: "errored",
    tags: ["anchor"],
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

  if (!privyEnabled) {
    return (
      <TraceListFrame
        agentId={agentId}
        traces={previewTraces}
        status={status}
        setStatus={setStatus}
      />
    )
  }

  return <AuthenticatedTraceList agentId={agentId} status={status} setStatus={setStatus} />
}

function AuthenticatedTraceList({
  agentId,
  setStatus,
  status,
}: Readonly<{
  agentId: string
  setStatus: (status: StatusFilter) => void
  status: StatusFilter
}>) {
  const { authenticated, login, ready } = usePrivy()
  const traces = trpc.traces.list.useQuery(
    { agentId, limit: 25, status: status === "all" ? undefined : status },
    { enabled: ready && authenticated, retry: 1 },
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

  const traceRows = traces.data?.items ?? []

  if (traceRows.length === 0) {
    return <TraceEmpty agentId={agentId} status={status} setStatus={setStatus} />
  }

  return (
    <TraceListFrame agentId={agentId} traces={traceRows} status={status} setStatus={setStatus} />
  )
}

function TraceListFrame({
  agentId,
  setStatus,
  status,
  traces,
}: Readonly<{
  agentId: string
  setStatus: (status: StatusFilter) => void
  status: StatusFilter
  traces: PreviewTrace[]
}>) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <Button asChild variant="ghost">
          <Link href={`/app/agents/${agentId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Agent
          </Link>
        </Button>

        <section className="mt-6 border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Trace history</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                Chronological sessions
              </h1>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Trace status filters">
              {(["all", "running", "completed", "errored", "timeout"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                  data-active={status === item}
                  onClick={() => setStatus(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border">
            {traces.map((trace) => (
              <Link
                key={trace.id}
                href={`/app/traces/${trace.id}`}
                className="grid gap-4 p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {trace.id}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{trace.inputSummary}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {trace.startedAt.toLocaleString()}
                  </p>
                </div>
                <TraceMetric label="Events" value={String(trace.eventCount)} />
                <TraceMetric label="Tokens" value={String(trace.totalTokens)} />
                <TraceMetric label="Txs" value={String(trace.solanaTxCount)} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function TraceEmpty({
  agentId,
  setStatus,
  status,
}: Readonly<{ agentId: string; setStatus: (status: StatusFilter) => void; status: StatusFilter }>) {
  if (status === "all") {
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
      title="No traces match this filter."
      description="Start a Mortem SDK session from your agent and completed traces will appear here."
      actionLabel="Clear filter"
      onAction={() => setStatus("all")}
    />
  )
}

function TraceListSkeleton({ agentId }: Readonly<{ agentId: string }>) {
  return (
    <main
      className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-7xl">
        <div className="h-10 w-28 rounded-md bg-muted" />
        <section className="mt-6 border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Loading traces for {agentId}
          </div>
          <div className="mt-6 space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px]"
              >
                <div className="space-y-3">
                  <div className="h-5 w-56 rounded-md bg-muted" />
                  <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
                </div>
                <div className="h-10 rounded-md bg-muted" />
                <div className="h-10 rounded-md bg-muted" />
                <div className="h-10 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
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
            <Link href={`/app/agents/${agentId}`}>Agent detail</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function TraceMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 lg:block">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
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
