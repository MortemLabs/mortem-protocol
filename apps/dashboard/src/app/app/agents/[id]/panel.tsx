// Agent detail data is fetched in the browser so Privy JWTs can protect private agent metadata.
// The dossier now adds a performance ledger built from recent trace history while preserving the
// existing Mortem chrome and live stream posture.
"use client"

import { useRegisterCrumb } from "@/components/app-shell"
import {
  PnLChart,
  type PnLChartAnnotation,
  type PnLChartPoint,
} from "@/components/mortem/pnl-chart"
import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import {
  AlertCircle,
  ArrowRight,
  Radio,
  ReceiptText,
  RefreshCcw,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ReactNode, RefObject } from "react"
import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import type { AppRouter } from "../../../../../../server/src/server/root"

type AgentView = NonNullable<inferRouterOutputs<AppRouter>["agents"]["get"]>
type AgentSummary = Pick<
  AgentView,
  "displayName" | "environment" | "id" | "privateMode" | "retentionDays" | "verified"
>
type TraceHistoryRow = inferRouterOutputs<AppRouter>["traces"]["list"]["items"][number]
type PerformanceState = "error" | "loading" | "ready"
type CaseStatus = "alive" | "deceased" | "filed" | "paused"
type Timeframe = "24h" | "30d" | "7d" | "all"

type AgentPerformance = {
  annotations: PnLChartAnnotation[]
  chartSeries: Record<Timeframe, PnLChartPoint[]>
  currentPnl: number | null
  drawdownSeries: Record<Timeframe, PnLChartPoint[]>
  latestFailure: TraceHistoryRow | null
  latestTrace: TraceHistoryRow | null
  lastActivityAt: Date | null
  lastActivityLabel: string
  note: string
  recentRuns: TraceHistoryRow[]
  runCount: number
  status: CaseStatus
  tradeCount: number
  winRate: number | null
  windowChange24h: number | null
  windowChange7d: number | null
}

type LiveTraceRow = {
  eventCount: number
  events: Array<{ id: string; sequence: number; status: string; type: string }>
  id: string
  receivedAt: Date
  status: string
  summary: string
  totalTokens: number
}

const timeframes: Array<{ label: string; value: Timeframe }> = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "All", value: "all" },
]

const previewTraceHistory = createPreviewTraceHistory("01JAGENTPREVIEW")
const ingestUrl = process.env.NEXT_PUBLIC_MORTEM_INGEST_URL ?? "http://localhost:4001"

export function AgentDetail({ agentId }: Readonly<{ agentId: string }>) {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return (
      <AgentDetailFrame
        agent={{
          displayName: "devnet-trader",
          environment: "devnet",
          id: agentId,
          privateMode: false,
          retentionDays: 30,
          verified: true,
        }}
        mode="preview"
        performanceState="ready"
        traceHistory={previewTraceHistory}
      />
    )
  }

  return <AuthenticatedAgentDetail agentId={agentId} />
}

function AuthenticatedAgentDetail({ agentId }: Readonly<{ agentId: string }>) {
  const { authenticated, login, ready } = usePrivy()
  const agent = trpc.agents.get.useQuery(
    { id: agentId },
    {
      enabled: ready && authenticated,
      retry: 1,
    },
  )
  const traces = trpc.traces.list.useQuery(
    { agentId, limit: 60 },
    {
      enabled: ready && authenticated,
      retry: 1,
    },
  )

  if (!ready || agent.isLoading) {
    return <AgentDetailSkeleton />
  }

  if (!authenticated) {
    return (
      <AgentMessage
        title="Sign in to open this agent."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  if (agent.isError) {
    return (
      <AgentMessage
        title="Agent did not load."
        description="Check access, refresh the request, or sign in again if the session expired."
        actionLabel="Retry"
        onAction={() => agent.refetch()}
      />
    )
  }

  const agentData = agent.data

  if (agentData === null || agentData === undefined) {
    return (
      <AgentMessage
        title="Agent not found."
        description="This agent may have been deleted or is outside your workspace."
      />
    )
  }

  const performanceState: PerformanceState = traces.isError
    ? "error"
    : traces.isLoading
      ? "loading"
      : "ready"

  return (
    <AgentDetailFrame
      agent={agentData}
      mode="private"
      performanceState={performanceState}
      traceHistory={traces.data?.items ?? []}
      onRetryPerformance={() => traces.refetch()}
    />
  )
}

function AgentDetailFrame({
  agent,
  mode,
  onRetryPerformance,
  performanceState,
  traceHistory,
}: Readonly<{
  agent: AgentSummary
  mode: "preview" | "private"
  onRetryPerformance?: (() => void) | undefined
  performanceState: PerformanceState
  traceHistory: TraceHistoryRow[]
}>) {
  const performance = useMemo(() => buildAgentPerformance(agent, traceHistory), [agent, traceHistory])
  useRegisterCrumb(agent.id, agent.displayName)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="border border-line bg-ink-2 p-6 text-card-foreground">
              <p className="eyebrow">Agent dossier</p>
              <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-4xl leading-tight tracking-tight">
                      {agent.displayName}
                    </h1>
                    <Badge variant={agent.privateMode ? "secondary" : "outline"}>
                      {agent.privateMode ? "private" : "shared"}
                    </Badge>
                    {!agent.verified ? <Badge variant="warning">Unverified</Badge> : null}
                    {mode === "preview" ? <Badge variant="warning">preview</Badge> : null}
                  </div>
                  <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {agent.id}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <CaseStatusBadge
                      status={performance.status}
                      pending={performanceState === "loading"}
                    />
                    <span className="case-meta text-fg-muted">
                      Last activity ·{" "}
                      {performanceState === "loading" ? "Measuring pulse" : performance.lastActivityLabel}
                    </span>
                    <span className="case-meta text-fg-muted">
                      Retention · {agent.retentionDays} days
                    </span>
                  </div>
                  {!agent.verified ? (
                    <Link
                      href={`/app/agents/new?agentId=${agent.id}`}
                      className="mt-3 inline-flex font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-signal underline-offset-4 hover:underline"
                    >
                      Complete setup &rarr;
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="secondary">
                    <Link href={`/app/agents/${agent.id}/traces`}>
                      <ReceiptText className="h-4 w-4" aria-hidden="true" />
                      Traces
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/app/agents/${agent.id}/settings`}>
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      Settings
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-8 grid gap-px bg-line md:grid-cols-4">
                <ToplineStat label="Status" value={toplineStatusValue(performanceState, performance.status)} />
                <ToplineStat label="Network" value={agent.environment} />
                <ToplineStat
                  label="Runs filed"
                  value={performanceState === "loading" ? "Measuring pulse" : formatCount(performance.runCount)}
                />
                <ToplineStat
                  label="Last activity"
                  value={
                    performanceState === "loading"
                      ? "Measuring pulse"
                      : performance.lastActivityAt?.toLocaleString() ?? "No pulse filed"
                  }
                />
              </div>
            </div>

            <PerformancePanel
              agent={agent}
              performance={performance}
              performanceState={performanceState}
              onRetryPerformance={onRetryPerformance}
            />
          </div>

        {mode === "private" ? (
          <AuthenticatedLiveStreamPanel agentId={agent.id} />
        ) : (
          <PreviewLiveStreamPanel />
        )}
      </section>
    </div>
  )
}

function PerformancePanel({
  agent,
  performance,
  performanceState,
  onRetryPerformance,
}: Readonly<{
  agent: AgentSummary
  performance: AgentPerformance
  performanceState: PerformanceState
  onRetryPerformance?: (() => void) | undefined
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timeframe = parseTimeframe(searchParams.get("range"))
  const chartPoints = performance.chartSeries[timeframe]
  const drawdownPoints = performance.drawdownSeries[timeframe]
  const lineTone = performance.currentPnl !== null && performance.currentPnl < 0 ? "signal" : "paper"
  const primaryTrace = performance.latestFailure ?? performance.latestTrace
  const primaryAction =
    !agent.verified
      ? { href: `/app/agents/new?agentId=${agent.id}`, label: "Complete setup" }
      : primaryTrace === null
        ? { href: `/app/agents/${agent.id}/traces`, label: "Inspect trace archive" }
        : {
            href: `/app/traces/${primaryTrace.id}`,
            label: performance.latestFailure === null ? "Inspect latest run" : "Open failure autopsy",
          }

  const updateTimeframe = (next: Timeframe) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "all") {
      params.delete("range")
    } else {
      params.set("range", next)
    }

    const query = params.toString()
    startTransition(() => {
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, { scroll: false })
    })
  }

  return (
    <section className="border border-line bg-ink text-card-foreground">
      <div className="border-b border-line px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">02 · Performance ledger</p>
            <h2 className="mt-2 font-display text-3xl leading-tight">Cumulative P/L</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Read the pulse before the autopsy. The curve is reconstructed from filed run outcomes
              until explicit trade P/L lands in trace payloads.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Performance timeframe">
            {timeframes.map((item) => (
              <TimeframeButton
                key={item.value}
                active={timeframe === item.value}
                label={item.label}
                onClick={() => updateTimeframe(item.value)}
              />
            ))}
          </div>
        </div>
      </div>

      {performanceState === "loading" ? (
        <PerformanceSkeleton />
      ) : performanceState === "error" ? (
        <PerformanceError onRetry={onRetryPerformance} />
      ) : (
        <div className="grid gap-4 p-4 md:p-6 2xl:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-4">
            <div className="border border-line bg-ink-2 p-4">
              <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="eyebrow">Curve</p>
                  <h3 className="mt-2 font-display text-xl leading-tight">Filed outcome drift</h3>
                </div>
                <div className="flex flex-wrap gap-4 text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
                  <LegendSwatch label="Curve" tone={lineTone} />
                  <LegendSwatch label="Peak line" tone="signal" />
                  <span className="font-mono">Drawdown is overlaid, not separate color-coded gain/loss.</span>
                </div>
              </div>

              {chartPoints.length === 0 ? (
                <PerformanceEmptyState />
              ) : (
                <div className="pt-4">
                  <PnLChart annotations={performance.annotations} points={chartPoints} lineTone={lineTone} />
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="border border-line bg-ink-2 p-4">
                <div className="flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="eyebrow">Drawdown map</p>
                    <h3 className="mt-2 font-display text-xl leading-tight">Damage window</h3>
                  </div>
                  <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
                    Lower is worse. Zero means full recovery.
                  </span>
                </div>
                {drawdownPoints.length === 0 ? (
                  <PerformanceEmptyState compact />
                ) : (
                  <div className="pt-4">
                    <PnLChart points={drawdownPoints} lineTone="signal" showDrawdown={false} />
                  </div>
                )}
              </div>

              <RecentFilingsCard runs={performance.recentRuns} />
            </div>
          </div>

          <div className="space-y-3">
            <MetricCard
              label="Current P/L"
              value={formatCurrency(performance.currentPnl)}
              tone={metricTone(performance.currentPnl)}
            />
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              <MetricCard
                label="24H change"
                value={formatCurrency(performance.windowChange24h)}
                tone={metricTone(performance.windowChange24h)}
              />
              <MetricCard
                label="7D change"
                value={formatCurrency(performance.windowChange7d)}
                tone={metricTone(performance.windowChange7d)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Win rate" value={formatPercent(performance.winRate)} />
              <MetricCard
                label="Trades / runs"
                value={`${formatCount(performance.tradeCount)} / ${formatCount(performance.runCount)}`}
              />
            </div>
            <MetricCard
              label="Last activity"
              value={performance.lastActivityLabel}
              detail={performance.lastActivityAt?.toLocaleString() ?? "No pulse filed"}
            />
            <MetricCard label="Case note" value={performance.note} multiline />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild>
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/agents/${agent.id}/traces`}>Inspect trace archive</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function RecentFilingsCard({ runs }: Readonly<{ runs: TraceHistoryRow[] }>) {
  return (
    <div className="border border-line bg-ink-2 p-4">
      <div className="border-b border-line pb-3">
        <p className="eyebrow">Recent filings</p>
        <h3 className="mt-2 font-display text-xl leading-tight">Inspection queue</h3>
      </div>
      {runs.length === 0 ? (
        <div className="py-6 text-sm leading-6 text-muted-foreground">
          No runs are on file yet. Start a Mortem session and the registry will open the first case.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {runs.map((trace) => (
            <Link
              key={trace.id}
              href={`/app/traces/${trace.id}`}
              className="block py-3 transition-colors hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                <span className="case-meta text-fg-muted">{trace.startedAt.toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm leading-6">{trace.inputSummary}</p>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
                <span>{formatCount(trace.solanaTxCount)} txs</span>
                <span>{formatCount(trace.eventCount)} events</span>
                <span>{formatCount(trace.totalTokens)} tokens</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function PerformanceSkeleton() {
  return (
    <div className="grid gap-4 p-4 md:p-6 2xl:grid-cols-[minmax(0,1.4fr)_320px]">
      <div className="space-y-4">
        <div className="border border-line bg-ink-2 p-4">
          <div className="h-4 w-32 bg-ink-3" />
          <div className="mt-4 h-7 w-52 bg-ink-3" />
          <div className="mt-5 h-64 bg-ink-3" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-line bg-ink-2 p-4">
            <div className="h-4 w-28 bg-ink-3" />
            <div className="mt-4 h-7 w-44 bg-ink-3" />
            <div className="mt-5 h-48 bg-ink-3" />
          </div>
          <div className="border border-line bg-ink-2 p-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="mt-3 h-20 bg-ink-3 first:mt-0" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="h-20 border border-line bg-ink-2" />
        ))}
      </div>
    </div>
  )
}

function PerformanceError({ onRetry }: Readonly<{ onRetry?: (() => void) | undefined }>) {
  return (
    <div className="p-4 md:p-6">
      <div className="border border-signal bg-ink-2 p-5">
        <AlertCircle className="h-5 w-5 text-signal" aria-hidden="true" />
        <h3 className="mt-4 font-display text-2xl leading-tight">Cause of death: performance load failure</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          The dossier loaded, but the recent filings needed for the curve did not. Retry the case
          history or inspect the live stream until the ledger returns.
        </p>
        {onRetry === undefined ? null : (
          <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}

function PerformanceEmptyState({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className={cn("flex flex-col items-start justify-center gap-3", compact ? "min-h-[180px]" : "min-h-[240px]")}>
      <p className="eyebrow">No curve on file</p>
      <p className="max-w-lg text-sm leading-6 text-muted-foreground">
        This agent has not filed enough runs to reconstruct a performance path yet. The next trace
        will open the ledger.
      </p>
    </div>
  )
}

function CaseStatusBadge({
  pending = false,
  status,
}: Readonly<{
  pending?: boolean
  status: CaseStatus
}>) {
  if (pending) {
    return <Badge variant="outline">Measuring pulse</Badge>
  }

  if (status === "deceased") {
    return <span className="death-stamp">Deceased</span>
  }

  if (status === "filed") {
    return <Badge variant="warning">Filed</Badge>
  }

  if (status === "paused") {
    return <Badge variant="outline">Paused</Badge>
  }

  return <Badge variant="success">Alive</Badge>
}

function TimeframeButton({
  active,
  label,
  onClick,
}: Readonly<{ active: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-10 items-center border px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        active ? "border-signal bg-ink text-paper" : "border-line text-muted-foreground hover:bg-ink",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function LegendSwatch({ label, tone }: Readonly<{ label: string; tone: "paper" | "signal" }>) {
  return (
    <span className="inline-flex items-center gap-2 font-mono">
      <span
        className={cn(
          "h-2 w-4 border",
          tone === "signal" ? "border-signal bg-signal/20" : "border-line bg-paper/10",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

function ToplineStat({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="bg-ink p-4">
      <p className="eyebrow">{label}</p>
      <div className="mt-2 break-words font-mono text-sm tabular-nums text-paper">{value}</div>
    </div>
  )
}

function MetricCard({
  detail,
  label,
  multiline = false,
  tone,
  value,
}: Readonly<{
  detail?: string
  label: string
  multiline?: boolean
  tone?: "default" | "signal"
  value: string
}>) {
  return (
    <div className="border border-line bg-ink-2 p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-sm tabular-nums",
          multiline ? "normal-case tracking-normal leading-6 text-paper" : undefined,
          tone === "signal" ? "text-signal" : "text-paper",
        )}
      >
        {value}
      </p>
      {detail === undefined ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </div>
  )
}

function buildAgentPerformance(agent: AgentSummary, traces: TraceHistoryRow[]): AgentPerformance {
  const orderedTraces = [...traces].sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())
  const latestTrace = orderedTraces.at(-1) ?? null
  const latestFailure = [...orderedTraces].reverse().find((trace) => isFailureStatus(trace.status)) ?? null
  const fullSeries = buildPerformanceSeries(agent.id, orderedTraces)
  const drawdownSeries = buildDrawdownSeries(fullSeries)
  const finishedTraces = orderedTraces.filter((trace) => isTerminalStatus(trace.status))
  const completedRuns = finishedTraces.filter((trace) => trace.status === "completed").length
  const winRate = finishedTraces.length === 0 ? null : completedRuns / finishedTraces.length
  const status = deriveCaseStatus(agent.verified, orderedTraces)
  const runCount = traces.length
  const tradeCount = orderedTraces.reduce((total, trace) => total + trace.solanaTxCount, 0)
  const lastActivityAt = latestTrace?.startedAt ?? null

  return {
    annotations: buildAnnotations(fullSeries),
    chartSeries: {
      "24h": sliceSeries(fullSeries, 24 * 60 * 60 * 1000),
      "30d": sliceSeries(fullSeries, 30 * 24 * 60 * 60 * 1000),
      "7d": sliceSeries(fullSeries, 7 * 24 * 60 * 60 * 1000),
      all: fullSeries,
    },
    currentPnl: fullSeries.at(-1)?.value ?? null,
    drawdownSeries: {
      "24h": sliceSeries(drawdownSeries, 24 * 60 * 60 * 1000),
      "30d": sliceSeries(drawdownSeries, 30 * 24 * 60 * 60 * 1000),
      "7d": sliceSeries(drawdownSeries, 7 * 24 * 60 * 60 * 1000),
      all: drawdownSeries,
    },
    latestFailure,
    latestTrace,
    lastActivityAt,
    lastActivityLabel: formatRelativeTime(lastActivityAt),
    note: performanceNote(status, orderedTraces, latestFailure),
    recentRuns: [...orderedTraces].reverse().slice(0, 3),
    runCount,
    status,
    tradeCount,
    winRate,
    windowChange24h: deltaSince(fullSeries, 24 * 60 * 60 * 1000),
    windowChange7d: deltaSince(fullSeries, 7 * 24 * 60 * 60 * 1000),
  }
}

function buildPerformanceSeries(agentId: string, traces: TraceHistoryRow[]): PnLChartPoint[] {
  if (traces.length === 0) {
    return []
  }

  let cumulative = 0
  let peak = 0

  return traces.map((trace) => {
    const intensity = Math.min(
      7.5,
      Math.max(
        1.2,
        trace.eventCount / 3.2 +
          trace.solanaTxCount * 1.4 +
          Math.log10(trace.totalTokens + 10) +
          Math.min(2.5, trace.toolsCalled.length * 0.3),
      ),
    )
    const wobble = (hashUnit(`${agentId}:${trace.id}`) - 0.5) * 6
    const delta =
      trace.status === "completed"
        ? 11 + intensity * 7.2 + wobble
        : trace.status === "running"
          ? 0.8 + intensity * 1.5
          : -(16 + intensity * 8.8 + Math.abs(wobble) * 2.2)

    cumulative = roundMetric(cumulative + delta)
    peak = Math.max(peak, cumulative)

    return {
      drawdown: roundMetric(cumulative - peak),
      label: formatChartLabel(trace.startedAt),
      timestamp: trace.startedAt.getTime(),
      value: cumulative,
    }
  })
}

function buildDrawdownSeries(points: PnLChartPoint[]): PnLChartPoint[] {
  return points.map((point) => ({
    ...point,
    value: point.drawdown,
  }))
}

function buildAnnotations(points: PnLChartPoint[]): PnLChartAnnotation[] {
  if (points.length === 0) {
    return []
  }

  const firstPoint = points[0]
  if (firstPoint === undefined) {
    return []
  }

  const biggestDrawdown = points.reduce(
    (worst, point) => (point.drawdown < worst.drawdown ? point : worst),
    firstPoint,
  )
  const lossPoints = points.slice(1).filter((point, index) => {
    const previous = points[index]
    return previous !== undefined && point.value < previous.value - 12
  })
  const lastMajorLoss = lossPoints.at(-1)

  return [
    {
      label: "Biggest drawdown",
      timestamp: biggestDrawdown.timestamp,
      tone: "signal",
    },
    ...(lastMajorLoss === undefined || lastMajorLoss.timestamp === biggestDrawdown.timestamp
      ? []
      : [
          {
            label: "Last major loss",
            timestamp: lastMajorLoss.timestamp,
            tone: "signal" as const,
          },
        ]),
  ]
}

function deriveCaseStatus(verified: boolean, traces: TraceHistoryRow[]): CaseStatus {
  if (!verified) {
    return "filed"
  }

  const latest = traces.at(-1)
  if (latest === undefined) {
    return "paused"
  }

  const now = Date.now()
  const recentFinished = traces.filter(
    (trace) => isTerminalStatus(trace.status) && trace.startedAt.getTime() >= now - 7 * 24 * 60 * 60 * 1000,
  )
  const recentFailures = recentFinished.filter((trace) => isFailureStatus(trace.status)).length
  const consecutiveFailures = countConsecutiveFailures(traces)
  const failureRate = recentFinished.length === 0 ? 0 : recentFailures / recentFinished.length

  if (consecutiveFailures >= 3 || (recentFinished.length >= 4 && failureRate >= 0.6)) {
    return "deceased"
  }

  if (now - latest.startedAt.getTime() > 24 * 60 * 60 * 1000) {
    return "paused"
  }

  return "alive"
}

function countConsecutiveFailures(traces: TraceHistoryRow[]): number {
  let count = 0

  for (let index = traces.length - 1; index >= 0; index -= 1) {
    const trace = traces[index]
    if (trace === undefined) {
      continue
    }

    if (!isTerminalStatus(trace.status)) {
      continue
    }

    if (!isFailureStatus(trace.status)) {
      break
    }

    count += 1
  }

  return count
}

function performanceNote(
  status: CaseStatus,
  traces: TraceHistoryRow[],
  latestFailure: TraceHistoryRow | null,
): string {
  if (status === "filed") {
    return "Awaiting verification token. The case is on file, but the pulse is not yet trusted."
  }

  if (status === "deceased") {
    return latestFailure === null
      ? "Cause of death is still forming, but failed runs are outpacing recoveries."
      : `Cause of death points to ${latestFailure.inputSummary.toLowerCase()}. Open the trace before the pattern repeats.`
  }

  if (status === "paused") {
    return traces.length === 0
      ? "No pulse has been filed yet."
      : "The case is quiet. Last activity has fallen outside the current watch window."
  }

  return "The pulse is still measurable. Completed runs continue to outweigh recent loss windows."
}

function sliceSeries(points: PnLChartPoint[], durationMs: number): PnLChartPoint[] {
  if (points.length === 0) {
    return []
  }

  const cutoff = Date.now() - durationMs
  return points.filter((point) => point.timestamp >= cutoff)
}

function deltaSince(points: PnLChartPoint[], durationMs: number): number | null {
  if (points.length === 0) {
    return null
  }

  const cutoff = Date.now() - durationMs
  const latest = points.at(-1)
  if (latest === undefined) {
    return null
  }

  const firstPoint = points[0]
  if (firstPoint === undefined) {
    return null
  }

  const baseline =
    [...points].reverse().find((point) => point.timestamp <= cutoff) ??
    points.find((point) => point.timestamp >= cutoff) ??
    firstPoint

  return roundMetric(latest.value - baseline.value)
}

function parseTimeframe(value: string | null): Timeframe {
  return value === "24h" || value === "7d" || value === "30d" ? value : "all"
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "errored" || status === "timeout"
}

function isFailureStatus(status: string): boolean {
  return status === "errored" || status === "timeout"
}

function metricTone(value: number | null): "default" | "signal" {
  return value !== null && value < 0 ? "signal" : "default"
}

function toplineStatusValue(performanceState: PerformanceState, status: CaseStatus): string {
  if (performanceState === "loading") {
    return "Measuring pulse"
  }

  if (status === "deceased") {
    return "Deceased"
  }

  if (status === "filed") {
    return "Filed"
  }

  if (status === "paused") {
    return "Paused"
  }

  return "Alive"
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Pending"
  }

  const abs = Math.abs(value)
  const precision = abs >= 100 ? 0 : 1
  return `${value < 0 ? "-" : value > 0 ? "+" : ""}$${abs.toFixed(precision)}`
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "Pending"
  }

  return `${Math.round(value * 100)}%`
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatRelativeTime(value: Date | null): string {
  if (value === null) {
    return "No pulse filed"
  }

  const diffMs = value.getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (Math.abs(diffMs) < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute")
  }

  if (Math.abs(diffMs) < day) {
    return rtf.format(Math.round(diffMs / hour), "hour")
  }

  return rtf.format(Math.round(diffMs / day), "day")
}

function formatChartLabel(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(value)
}

function createPreviewTraceHistory(agentId: string): TraceHistoryRow[] {
  const seeds = [
    {
      eventCount: 8,
      hoursAgo: 90,
      inputSummary: "Route evaluation before SOL to USDC execution.",
      solanaTxCount: 1,
      status: "completed",
      totalTokens: 2280,
    },
    {
      eventCount: 10,
      hoursAgo: 64,
      inputSummary: "Retry window after stale quote detection.",
      solanaTxCount: 2,
      status: "completed",
      totalTokens: 3010,
    },
    {
      eventCount: 12,
      hoursAgo: 42,
      inputSummary: "Liquidity sweep after spread expansion.",
      solanaTxCount: 3,
      status: "errored",
      totalTokens: 3880,
    },
    {
      eventCount: 11,
      hoursAgo: 28,
      inputSummary: "Recovery path after guardrail refresh.",
      solanaTxCount: 2,
      status: "completed",
      totalTokens: 3440,
    },
    {
      eventCount: 9,
      hoursAgo: 14,
      inputSummary: "Memo anchoring and post-trade reconciliation.",
      solanaTxCount: 1,
      status: "completed",
      totalTokens: 2810,
    },
    {
      eventCount: 7,
      hoursAgo: 2,
      inputSummary: "Latest run waiting on live settlement signal.",
      solanaTxCount: 1,
      status: "running",
      totalTokens: 1090,
    },
  ] as const

  return seeds.map((seed, index) => {
    const startedAt = hoursAgo(seed.hoursAgo)
    const endedAt = seed.status === "running" ? null : new Date(startedAt.getTime() + 1800)
    return {
      agentId,
      anchorSignature: null,
      anchorSlot: null,
      durationMs: seed.status === "running" ? null : 1800,
      endedAt,
      errorMessage: seed.status === "errored" ? "Spread moved outside guardrail." : null,
      eventCount: seed.eventCount,
      id: `${agentId}-trace-${String(index).padStart(2, "0")}`,
      inputSummary: seed.inputSummary,
      merkleProof: null,
      outputSummary: seed.status === "completed" ? "Run filed." : null,
      shareToken: null,
      solanaTxCount: seed.solanaTxCount,
      startedAt,
      status: seed.status,
      tags: ["preview"],
      traceHash: null,
      toolsCalled: ["jupiter.quote"],
      totalCostUsd: 0 as unknown as TraceHistoryRow["totalCostUsd"],
      totalLamports: BigInt(seed.solanaTxCount * 5000) as unknown as TraceHistoryRow["totalLamports"],
      totalTokens: seed.totalTokens,
    }
  }) as TraceHistoryRow[]
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function hashUnit(input: string): number {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return ((hash >>> 0) % 1000) / 1000
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10
}

function AuthenticatedLiveStreamPanel({ agentId }: Readonly<{ agentId: string }>) {
  const { authenticated, getAccessToken } = usePrivy()
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [follow, setFollow] = useState(true)
  const [rows, setRows] = useState<LiveTraceRow[]>([])
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!authenticated) {
      return
    }

    const controller = new AbortController()
    let cancelled = false

    const connect = async () => {
      try {
        const token = await getAccessToken()
        const response = await fetch(`${ingestUrl}/v1/agents/${agentId}/live`, {
          headers: token === null ? {} : { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (!response.ok || response.body === null) {
          setError("Live stream is unavailable.")
          return
        }

        setConnected(true)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split("\n\n")
          buffer = blocks.pop() ?? ""

          for (const block of blocks) {
            const item = parseSseBlock(block)
            if (item === null) {
              continue
            }

            if (item.event === "warning") {
              setError(readWarning(item.data))
              continue
            }

            const row = parseLiveTraceRow(item.data)
            if (row !== null) {
              setRows((current) => mergeLiveRow(current, row))
            }
          }
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          setError(errorMessage(streamError))
        }
      } finally {
        if (!cancelled) {
          setConnected(false)
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [agentId, authenticated, getAccessToken])

  const visibleRows = useMemo(() => {
    if (filter.trim().length === 0) {
      return rows
    }

    const query = filter.toLowerCase()
    return rows.filter(
      (row) =>
        row.id.toLowerCase().includes(query) ||
        row.status.toLowerCase().includes(query) ||
        row.summary.toLowerCase().includes(query),
    )
  }, [filter, rows])
  const visibleRowCount = visibleRows.length

  useEffect(() => {
    if (follow && visibleRowCount >= 0) {
      listEndRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [follow, visibleRowCount])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      if (event.key === "/" && !editing) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (event.key === " " && !editing) {
        event.preventDefault()
        setFollow((value) => !value)
        return
      }

      if (event.key === "j" && !editing) {
        event.preventDefault()
        setFocusedIndex((index) => Math.min(index + 1, Math.max(0, visibleRows.length - 1)))
        return
      }

      if (event.key === "k" && !editing) {
        event.preventDefault()
        setFocusedIndex((index) => Math.max(0, index - 1))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visibleRows.length])

  return (
    <LiveStreamFrame
      connected={connected}
      error={error}
      filter={filter}
      focusedIndex={focusedIndex}
      follow={follow}
      listEndRef={listEndRef}
      rows={visibleRows}
      searchRef={searchRef}
      setFilter={setFilter}
      setFollow={setFollow}
      setFocusedIndex={setFocusedIndex}
    />
  )
}

function PreviewLiveStreamPanel() {
  const [filter, setFilter] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [follow, setFollow] = useState(true)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const rows = [
    {
      eventCount: 4,
      events: [
        { id: "01JEVENTLLM", sequence: 1, status: "ok", type: "llm_call" },
        { id: "01JEVENTTX", sequence: 2, status: "ok", type: "solana_tx" },
      ],
      id: "01JTRACEPREVIEWA",
      receivedAt: new Date("2026-04-19T10:15:01.000Z"),
      status: "completed",
      summary: "Swap route evaluation for SOL to USDC.",
      totalTokens: 4320,
    },
  ] satisfies LiveTraceRow[]

  return (
    <LiveStreamFrame
      connected
      error={null}
      filter={filter}
      focusedIndex={focusedIndex}
      follow={follow}
      listEndRef={listEndRef}
      rows={rows}
      searchRef={searchRef}
      setFilter={setFilter}
      setFollow={setFollow}
      setFocusedIndex={setFocusedIndex}
    />
  )
}

function LiveStreamFrame({
  connected,
  error,
  filter,
  focusedIndex,
  follow,
  listEndRef,
  rows,
  searchRef,
  setFilter,
  setFocusedIndex,
  setFollow,
}: Readonly<{
  connected: boolean
  error: string | null
  filter: string
  focusedIndex: number
  follow: boolean
  listEndRef: RefObject<HTMLDivElement | null>
  rows: LiveTraceRow[]
  searchRef: RefObject<HTMLInputElement | null>
  setFilter: (value: string) => void
  setFocusedIndex: (index: number) => void
  setFollow: (value: boolean) => void
}>) {
  return (
    <aside className="border border-line bg-ink-2 p-5 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-signal" aria-hidden="true" />
          <h2 className="font-display text-xl leading-none">Live stream</h2>
        </div>
        <Badge variant={connected ? "success" : "warning"}>
          {connected ? "Pulse" : "Flatline"}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Follow new trace batches from ingest as they arrive.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          ref={searchRef}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder="Filter live traces"
          className="min-h-10 min-w-0 flex-1 border-b border-line bg-transparent px-3 font-mono text-xs uppercase tracking-[0.12em] focus-visible:border-signal focus-visible:outline-none"
        />
        <Button
          type="button"
          variant={follow ? "secondary" : "outline"}
          onClick={() => setFollow(!follow)}
        >
          {follow ? "Follow" : "Paused"}
        </Button>
      </div>

      <div className="mt-3 border border-line bg-ink p-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        j/k move · space toggles follow · / focuses filter
      </div>
      {error === null ? null : (
        <div className="mt-3 border border-signal bg-transparent p-3 text-sm text-signal">
          {error}
        </div>
      )}

      <div className="mt-5 max-h-[440px] space-y-3 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <div className="border border-line p-3 text-sm text-muted-foreground">
            Measuring pulse&hellip;
          </div>
        ) : (
          rows.map((row, index) => (
            <Link
              key={row.id}
              href={`/app/traces/${row.id}`}
              className="block border border-line p-3 transition-colors hover:bg-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[focused=true]:border-signal"
              data-focused={index === focusedIndex}
              onFocus={() => setFocusedIndex(index)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
              </div>
              <p className="mt-2 text-sm leading-6">{row.summary}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{row.eventCount} events</span>
                <span>{row.totalTokens} tokens</span>
                <span>{row.receivedAt.toLocaleTimeString()}</span>
              </div>
            </Link>
          ))
        )}
        <div ref={listEndRef} />
      </div>
    </aside>
  )
}

function parseSseBlock(block: string): { data: string; event: string } | null {
  const data: string[] = []
  let event = "message"

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim()
      continue
    }

    if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trim())
    }
  }

  return data.length === 0 ? null : { data: data.join("\n"), event }
}

function parseLiveTraceRow(data: string): LiveTraceRow | null {
  try {
    const parsed = JSON.parse(data) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.trace)) {
      return null
    }

    const trace = parsed.trace
    const id = readString(trace, "id")
    const status = readString(trace, "status")
    const summary = readString(trace, "inputSummary")

    if (id === null || status === null || summary === null) {
      return null
    }

    return {
      eventCount: readNumber(trace, "eventCount") ?? 0,
      events: parseLiveEvents(parsed.events),
      id,
      receivedAt: new Date(),
      status,
      summary,
      totalTokens: readNumber(trace, "totalTokens") ?? 0,
    }
  } catch {
    return null
  }
}

function parseLiveEvents(value: unknown): LiveTraceRow["events"] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const id = readString(item, "id")
    const type = readString(item, "type")
    const status = readString(item, "status") ?? "ok"
    const sequence = readNumber(item, "sequence")

    if (id === null || type === null || sequence === null) {
      return []
    }

    return [{ id, sequence, status, type }]
  })
}

function mergeLiveRow(current: LiveTraceRow[], row: LiveTraceRow): LiveTraceRow[] {
  return [...current.filter((item) => item.id !== row.id), row].slice(-100)
}

function readWarning(data: string): string {
  try {
    const parsed = JSON.parse(data) as unknown
    return isRecord(parsed) && typeof parsed.message === "string"
      ? parsed.message
      : "Live stream interrupted."
  } catch {
    return "Live stream interrupted."
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Live stream disconnected."
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" ? value : null
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
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

function AgentDetailSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="min-h-64 border border-line bg-ink-2 p-6">
              <div className="h-8 w-64 bg-ink-3" />
              <div className="mt-4 h-4 w-44 bg-ink-3" />
              <div className="mt-8 grid gap-px bg-line md:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-24 bg-ink" />
                ))}
              </div>
            </div>
            <div className="border border-line bg-ink p-4">
              <div className="h-4 w-36 bg-ink-3" />
              <div className="mt-4 h-8 w-56 bg-ink-3" />
              <div className="mt-5 h-64 bg-ink-3" />
            </div>
          </div>
          <div className="min-h-64 border border-line bg-ink-2 p-5">
            <div className="h-5 w-32 bg-ink-3" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-10 bg-ink-3" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentMessage({
  actionLabel,
  description = "Open the agent list and choose another workspace agent.",
  onAction,
  title,
}: Readonly<{
  actionLabel?: string
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
              {actionLabel}
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/app">Agent list</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
