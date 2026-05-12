// The agent list handles authenticated tRPC loading, empty, error, and preview states.
// It keeps the table layout stable so incoming data does not shift workspace navigation.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import { Activity, AlertCircle, Database, Plus, RefreshCcw } from "lucide-react"
import Link from "next/link"
import type { AppRouter } from "../../../../server/src/server/root"

type Agent = inferRouterOutputs<AppRouter>["agents"]["list"][number]

const previewAgents = [
  {
    createdAt: new Date("2026-04-19T00:00:00.000Z"),
    displayName: "devnet-trader",
    environment: "devnet",
    id: "01JPREVIEWTRADER",
    privateMode: false,
    retentionDays: 30,
    verified: true,
  },
  {
    createdAt: new Date("2026-04-19T00:00:00.000Z"),
    displayName: "x402-checkout-agent",
    environment: "devnet",
    id: "01JPREVIEWX402",
    privateMode: true,
    retentionDays: 14,
    verified: false,
  },
] satisfies PreviewAgent[]

type PreviewAgent = Pick<
  Agent,
  "createdAt" | "displayName" | "environment" | "id" | "privateMode" | "retentionDays" | "verified"
>

export function AgentList() {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return (
      <AgentListFrame
        agents={previewAgents}
        banner="Local preview mode"
        description="Set NEXT_PUBLIC_PRIVY_APP_ID to load private agents from the server."
      />
    )
  }

  return <AuthenticatedAgentList />
}

function AuthenticatedAgentList() {
  const { authenticated, login, ready } = usePrivy()
  const agents = trpc.agents.list.useQuery(undefined, {
    enabled: ready && authenticated,
    retry: 1,
  })

  if (!ready) {
    return <AgentListSkeleton />
  }

  if (!authenticated) {
    return (
      <section className="border border-line bg-ink-2 p-6 text-card-foreground">
        <div className="flex h-12 w-12 items-center justify-center border border-line">
          <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-5 font-display text-2xl leading-tight">Sign in to load agents</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Sign in to access your agents and view their traces.
        </p>
        <Button type="button" className="mt-6" onClick={() => login()}>
          Sign in
        </Button>
      </section>
    )
  }

  if (agents.isLoading) {
    return <AgentListSkeleton />
  }

  if (agents.isError) {
    return (
      <section className="border border-line bg-ink-2 p-6 text-card-foreground">
        <div className="flex h-12 w-12 items-center justify-center border border-signal">
          <AlertCircle className="h-5 w-5 text-signal" aria-hidden="true" />
        </div>
        <h2 className="mt-5 font-display text-2xl leading-tight">Cause of death: load failure</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Check the server app, refresh the request, or sign in again if the session expired.
        </p>
        <Button type="button" className="mt-6" variant="outline" onClick={() => agents.refetch()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </section>
    )
  }

  const agentRows = agents.data ?? []

  if (agentRows.length === 0) {
    return <EmptyAgentList />
  }

  return (
    <AgentListFrame
      agents={agentRows}
      banner="Private agents"
      description="Sorted by most recent creation time."
    />
  )
}

function AgentListFrame({
  agents,
  banner,
  description,
}: Readonly<{ agents: PreviewAgent[]; banner: string; description: string }>) {
  return (
    <section className="border border-line bg-ink-2 text-card-foreground">
      <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">02 · {banner}</p>
          <h2 className="mt-2 font-display text-2xl leading-tight">Agent registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/app/agents/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              File new agent
            </Link>
          </Button>
        </div>
      </div>

      <div className="divide-y divide-line">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="grid min-h-24 gap-3 p-4 transition-colors hover:bg-ink-3 md:grid-cols-[minmax(0,1fr)_160px_160px]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/agents/${agent.id}`}
                  className="font-display text-lg leading-none hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {agent.displayName}
                </Link>
                <Badge variant={agent.privateMode ? "secondary" : "outline"}>
                  {agent.privateMode ? "private" : "shared"}
                </Badge>
                {!agent.verified ? <Badge variant="warning">Unverified</Badge> : null}
              </div>
              <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                {agent.id}
              </p>
              {!agent.verified ? (
                <Link
                  href={`/app/agents/new?agentId=${agent.id}`}
                  className="mt-2 inline-flex font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-signal underline-offset-4 hover:underline"
                >
                  Complete setup &rarr;
                </Link>
              ) : null}
            </div>
            <Metric label="Network" value={agent.environment} />
            <Metric label="Retention" value={`${agent.retentionDays} days`} />
          </div>
        ))}
      </div>
    </section>
  )
}

function EmptyAgentList() {
  return (
    <section className="border border-line bg-ink-2 p-6 text-card-foreground">
      <div className="flex h-12 w-12 items-center justify-center border border-line">
        <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="stamp mt-5 font-display text-2xl leading-tight">Empty registry</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        File an agent to receive an API key, start sessions from the SDK, and anchor completed
        traces with Solana memo transactions.
      </p>
      <Button asChild className="mt-6">
        <Link href="/app/agents/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          File new agent
        </Link>
      </Button>
    </section>
  )
}

function AgentListSkeleton() {
  return (
    <section className="border border-line bg-ink-2 p-4 text-card-foreground" aria-busy="true">
      <div className="h-5 w-32 bg-ink-3" />
      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="grid min-h-24 gap-3 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_160px_160px]"
          >
            <div>
              <div className="h-5 w-48 bg-ink-3" />
              <div className="mt-3 h-4 w-32 bg-ink-3" />
            </div>
            <div className="h-10 bg-ink-3" />
            <div className="h-10 bg-ink-3" />
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 md:block">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}
