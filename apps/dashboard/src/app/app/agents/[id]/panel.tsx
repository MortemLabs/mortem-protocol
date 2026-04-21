// Agent detail data is fetched in the browser so Privy JWTs can protect private agent metadata.
// Preview mode renders deterministic sample data for local UI work without backend credentials.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import { AlertCircle, ArrowLeft, Radio, ReceiptText, Settings } from "lucide-react"
import Link from "next/link"
import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

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
          verified: false,
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
    retentionDays: number
    verified: boolean
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
                  {!agent.verified ? <Badge variant="warning">Unverified</Badge> : null}
                  {mode === "preview" ? <Badge variant="warning">preview</Badge> : null}
                </div>
                <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
                  {agent.id}
                </p>
                {!agent.verified ? (
                  <Link
                    href={`/app/agents/new?agentId=${agent.id}`}
                    className="mt-3 inline-flex text-sm font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-300"
                  >
                    Complete setup -&gt;
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

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <Stat label="Network" value={agent.environment} />
              <Stat label="Retention" value={`${agent.retentionDays} days`} />
              <Stat label="Anchoring" value="memo tx" />
            </div>
          </div>

          {mode === "private" ? (
            <AuthenticatedLiveStreamPanel agentId={agent.id} />
          ) : (
            <PreviewLiveStreamPanel />
          )}
        </section>
      </div>
    </main>
  )
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

const ingestUrl = process.env.NEXT_PUBLIC_MORTEM_INGEST_URL ?? "http://localhost:4001"

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
    <aside className="border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-medium tracking-normal">Live stream</h2>
        </div>
        <Badge variant={connected ? "success" : "warning"}>
          {connected ? "SSE ready" : "connecting"}
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
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Button
          type="button"
          variant={follow ? "secondary" : "outline"}
          onClick={() => setFollow(!follow)}
        >
          {follow ? "Follow" : "Paused"}
        </Button>
      </div>

      <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
        j/k move · space toggles follow · / focuses filter
      </div>
      {error === null ? null : (
        <div className="mt-3 rounded-md border border-amber-600/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </div>
      )}

      <div className="mt-5 max-h-[440px] space-y-3 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Waiting for session.
          </div>
        ) : (
          rows.map((row, index) => (
            <Link
              key={row.id}
              href={`/app/traces/${row.id}`}
              className="block rounded-md border border-border p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[focused=true]:border-primary"
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
