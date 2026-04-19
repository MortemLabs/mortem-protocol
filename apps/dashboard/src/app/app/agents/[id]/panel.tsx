// Agent detail data is fetched in the browser so Privy JWTs can protect private agent metadata.
// Preview mode renders deterministic sample data for local UI work without backend credentials.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import { AlertCircle, ArrowLeft, Radio, ReceiptText, Settings } from "lucide-react"
import Link from "next/link"

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
          registryPda: "9xQe...mT9v",
          retentionDays: 30,
        }}
        mode="preview"
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

  return <AgentDetailFrame agent={agentData} mode="private" />
}

function AgentDetailFrame({
  agent,
  mode,
}: Readonly<{
  agent: {
    displayName: string
    environment: string
    id: string
    privateMode: boolean
    registryPda: string | null
    retentionDays: number
  }
  mode: "preview" | "private"
}>) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <Button asChild variant="ghost">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Agents
          </Link>
        </Button>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-border bg-card p-6 text-card-foreground shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold tracking-normal">{agent.displayName}</h1>
                  <Badge variant={agent.privateMode ? "secondary" : "outline"}>
                    {agent.privateMode ? "private" : "shared"}
                  </Badge>
                  {mode === "preview" ? <Badge variant="warning">preview</Badge> : null}
                </div>
                <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
                  {agent.id}
                </p>
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

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <Stat label="Network" value={agent.environment} />
              <Stat label="Retention" value={`${agent.retentionDays} days`} />
              <Stat
                label="Registry PDA"
                value={agent.registryPda === null ? "not registered" : agent.registryPda}
              />
            </div>
          </div>

          <aside className="border border-border bg-card p-5 text-card-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-medium tracking-normal">Live stream</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Connect the SDK and keep this page open to follow new events as they arrive.
            </p>
            <div className="mt-5 space-y-3">
              {["waiting for session", "SSE ready", "auto-follow off"].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between border border-border px-3 py-2 text-sm"
                >
                  <span>{item}</span>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function AgentDetailSkeleton() {
  return (
    <main
      className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-7xl">
        <div className="h-10 w-28 rounded-md bg-muted" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-64 border border-border bg-card p-6 shadow-sm">
            <div className="h-8 w-64 rounded-md bg-muted" />
            <div className="mt-4 h-4 w-44 rounded-md bg-muted" />
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-md bg-muted" />
              ))}
            </div>
          </div>
          <div className="min-h-64 border border-border bg-card p-5 shadow-sm">
            <div className="h-5 w-32 rounded-md bg-muted" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-10 rounded-md bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-normal">{title}</h1>
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
    </main>
  )
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}
