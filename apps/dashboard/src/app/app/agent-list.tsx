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
    registryPda: "9xQe...mT9v",
    retentionDays: 30,
  },
  {
    createdAt: new Date("2026-04-19T00:00:00.000Z"),
    displayName: "x402-checkout-agent",
    environment: "devnet",
    id: "01JPREVIEWX402",
    privateMode: true,
    registryPda: null,
    retentionDays: 14,
  },
] satisfies PreviewAgent[]

type PreviewAgent = Pick<
  Agent,
  | "createdAt"
  | "displayName"
  | "environment"
  | "id"
  | "privateMode"
  | "registryPda"
  | "retentionDays"
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
      <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-normal">Sign in to load agents.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Mortem uses your Privy JWT to check agent ownership before returning traces, keys, or live
          streams.
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
      <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-normal">Agents did not load.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Check the server app, refresh the request, or sign in again if the session expired.
        </p>
        <Button type="button" className="mt-6" variant="secondary" onClick={() => agents.refetch()}>
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
    <section className="border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{banner}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">Agent registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild>
          <Link href="/app/agents/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New agent
          </Link>
        </Button>
      </div>

      <div className="divide-y divide-border">
        {agents.map((agent) => (
          <Link
            key={agent.id}
            href={`/app/agents/${agent.id}`}
            className="grid min-h-24 gap-3 p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:grid-cols-[minmax(0,1fr)_160px_160px]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium tracking-normal">{agent.displayName}</h3>
                <Badge variant={agent.privateMode ? "secondary" : "outline"}>
                  {agent.privateMode ? "private" : "shared"}
                </Badge>
              </div>
              <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                {agent.id}
              </p>
            </div>
            <Metric label="Network" value={agent.environment} />
            <Metric label="Retention" value={`${agent.retentionDays} days`} />
          </Link>
        ))}
      </div>
    </section>
  )
}

function EmptyAgentList() {
  return (
    <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
        <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-normal">No agents yet.</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Create an agent to receive an API key, start sessions from the SDK, and anchor completed
        traces to Solana.
      </p>
      <Button asChild className="mt-6">
        <Link href="/app/agents/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New agent
        </Link>
      </Button>
    </section>
  )
}

function AgentListSkeleton() {
  return (
    <section
      className="border border-border bg-card p-4 text-card-foreground shadow-sm"
      aria-busy="true"
    >
      <div className="h-5 w-32 rounded-md bg-muted" />
      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="grid min-h-24 gap-3 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_160px_160px]"
          >
            <div>
              <div className="h-5 w-48 rounded-md bg-muted" />
              <div className="mt-3 h-4 w-32 rounded-md bg-muted" />
            </div>
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 md:block">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}
