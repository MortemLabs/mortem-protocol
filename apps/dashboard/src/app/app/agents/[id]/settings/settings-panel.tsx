// The agent settings panel handles API key rotation, retention visibility, and destructive agent
// deletion. Raw API keys are only displayed immediately after a successful rotation.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import type { inferRouterOutputs } from "@trpc/server"
import {
  AlertCircle,
  CalendarClock,
  Copy,
  KeyRound,
  Loader2,
  RefreshCcw,
  Shield,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { AppRouter } from "../../../../../../../server/src/server/root"

type AgentOutput = NonNullable<inferRouterOutputs<AppRouter>["agents"]["get"]>

type AgentSettingsView = {
  apiKeyHash: string
  displayName: string
  environment: string
  id: string
  privateMode: boolean
  retentionDays: number
}

const previewAgent: AgentSettingsView = {
  apiKeyHash: "4c0f3e6f9d41f7b7e2e9d7a8c4b2a1d0c8e7f6a5b4c3d2e1f0a9b8c7d6e5f401",
  displayName: "devnet-trader",
  environment: "devnet",
  id: "01JAGENTPREVIEW",
  privateMode: false,
  retentionDays: 30,
}

export function AgentSettings({ agentId }: Readonly<{ agentId: string }>) {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return <AgentSettingsFrame agent={{ ...previewAgent, id: agentId }} mode="preview" />
  }

  return <AuthenticatedAgentSettings agentId={agentId} />
}

function AuthenticatedAgentSettings({ agentId }: Readonly<{ agentId: string }>) {
  const { authenticated, login, ready } = usePrivy()
  const router = useRouter()
  const utils = trpc.useUtils()
  const [latestApiKey, setLatestApiKey] = useState<string | null>(null)
  const agent = trpc.agents.get.useQuery(
    { id: agentId },
    {
      enabled: ready && authenticated,
      retry: 1,
    },
  )
  const rotateKey = trpc.agents.rotateKey.useMutation({
    onSuccess: async (result) => {
      if (result !== null) {
        setLatestApiKey(result.apiKey)
        await utils.agents.get.invalidate({ id: agentId })
      }
    },
  })
  const deleteAgent = trpc.agents.delete.useMutation({
    onSuccess: async (deleted) => {
      if (deleted) {
        await utils.agents.list.invalidate()
        router.push("/app")
      }
    },
  })

  if (!ready || agent.isLoading) {
    return <AgentSettingsSkeleton />
  }

  if (!authenticated) {
    return (
      <AgentSettingsMessage
        title="Sign in to manage this agent."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  if (agent.isError) {
    return (
      <AgentSettingsMessage
        title="Settings did not load."
        description="Retry the request, check the server app, or sign in again if the session expired."
        actionLabel="Retry"
        onAction={() => agent.refetch()}
      />
    )
  }

  if (agent.data === null || agent.data === undefined) {
    return (
      <AgentSettingsMessage
        title="Agent not found."
        description="This agent may have been deleted or is outside your workspace."
      />
    )
  }

  return (
    <AgentSettingsFrame
      agent={toAgentSettingsView(agent.data)}
      latestApiKey={latestApiKey}
      mode="private"
      onDelete={() => deleteAgent.mutate({ id: agentId })}
      onRotate={() => rotateKey.mutate({ id: agentId })}
      deleting={deleteAgent.isPending}
      rotating={rotateKey.isPending}
    />
  )
}

function AgentSettingsFrame({
  agent,
  deleting = false,
  latestApiKey = null,
  mode,
  onDelete,
  onRotate,
  rotating = false,
}: Readonly<{
  agent: AgentSettingsView
  deleting?: boolean
  latestApiKey?: string | null
  mode: "preview" | "private"
  onDelete?: () => void
  onRotate?: () => void
  rotating?: boolean
}>) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        <section className="border border-border bg-card text-card-foreground">
          <div className="border-b border-border p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-normal">{agent.displayName}</h1>
              <Badge variant={agent.privateMode ? "secondary" : "outline"}>
                {agent.privateMode ? "private" : "shared"}
              </Badge>
              {mode === "preview" ? <Badge variant="warning">preview</Badge> : null}
            </div>
            <p className="mt-3 font-mono text-xs text-muted-foreground">{agent.id}</p>
          </div>

          <div className="grid gap-px bg-border md:grid-cols-3">
            <SettingsStat icon={Shield} label="Network" value={agent.environment} />
            <SettingsStat
              icon={CalendarClock}
              label="Retention"
              value={`${agent.retentionDays} days`}
            />
            <SettingsStat
              icon={KeyRound}
              label="API key hash"
              value={shortenHash(agent.apiKeyHash)}
            />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-semibold tracking-normal">API key</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Rotate the ingest key when it is exposed or when an SDK host leaves your control.
            </p>
            <div className="mt-5 border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground">Stored hash</p>
              <p className="mt-2 break-all font-mono text-xs">{agent.apiKeyHash}</p>
            </div>
            {latestApiKey === null ? null : (
              <div className="mt-4 border border-line bg-ink-3 p-4 text-paper">
                <p className="text-sm font-medium">New key</p>
                <p className="mt-2 break-all font-mono text-xs">{latestApiKey}</p>
                <div className="mt-3">
                  <CopyButton label="Copy key" value={latestApiKey} />
                </div>
              </div>
            )}
            <div className="mt-5">
              <Button
                type="button"
                disabled={onRotate === undefined || rotating}
                onClick={onRotate}
              >
                {rotating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Rotate key
              </Button>
            </div>
          </div>

          <aside className="border border-border bg-card p-6 text-card-foreground">
            <h2 className="text-xl font-semibold tracking-normal">Retention</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This agent keeps trace payloads for {agent.retentionDays} days before policy cleanup.
            </p>
            <div className="mt-5 space-y-3">
              <ReadonlyRow label="Anchoring mode" value="Solana memo transaction" />
              <ReadonlyRow label="Signing flow" value="Backend signer pays the tx fee" />
            </div>
          </aside>
        </section>

        <section className="mt-6 border border-destructive/30 bg-card p-6 text-card-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-destructive">Danger zone</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Deleting an agent removes the database record and its linked traces.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "outline"}
              disabled={deleting}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }

                onDelete?.()
              }}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              {confirmDelete ? "Confirm delete" : "Delete agent"}
            </Button>
            {confirmDelete ? (
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </section>
    </div>
  )
}

function AgentSettingsSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div>
        <section className="border border-border bg-card p-6">
          <div className="h-8 w-64 bg-ink-3" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 bg-ink-3" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function AgentSettingsMessage({
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
      <section className="w-full max-w-md border border-border bg-card p-6 text-card-foreground">
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
            <Link href="/app">Agent list</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

function SettingsStat({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof Shield
  label: string
  value: string
}>) {
  return (
    <div className="bg-card p-4">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}

function ReadonlyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-mono text-xs">{value}</p>
    </div>
  )
}

function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
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

function toAgentSettingsView(agent: AgentOutput): AgentSettingsView {
  return {
    apiKeyHash: agent.apiKeyHash,
    displayName: agent.displayName,
    environment: agent.environment,
    id: agent.id,
    privateMode: agent.privateMode,
    retentionDays: agent.retentionDays,
  }
}

function shortenHash(value: string): string {
  if (value.length <= 20) {
    return value
  }

  return `${value.slice(0, 10)}...${value.slice(-10)}`
}
