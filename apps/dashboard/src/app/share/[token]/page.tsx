// Public share pages render trace evidence on the server so links remain readable without browser
// JavaScript. Data is loaded through the public tRPC verify router instead of protected dashboard APIs.
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import type { inferRouterOutputs } from "@trpc/server"
import { AlertCircle, ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import superjson from "superjson"
import type { AppRouter } from "../../../../../server/src/server/root"

type ShareResult = inferRouterOutputs<AppRouter>["verify"]["byShareToken"]
type SharedTrace = NonNullable<ShareResult>
type SharedEvent = SharedTrace["events"][number]

const trpcUrl = process.env.NEXT_PUBLIC_MORTEM_SERVER_URL ?? "http://localhost:3001/api/trpc"

export const dynamic = "force-dynamic"

const publicClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: trpcUrl,
    }),
  ],
})

export default async function SharePage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const data = await getSharedTrace(token)

  if (data === null) {
    return <ShareMessage token={token} />
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Mortem
          </Link>
        </Button>

        <section className="mt-6 border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(data.trace.status)}>{data.trace.status}</Badge>
                <Badge variant={data.verification.anchored ? "success" : "warning"}>
                  {data.verification.anchored ? "anchored" : "not anchored"}
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal">
                {data.trace.inputSummary}
              </h1>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {data.trace.id}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">Started</p>
              <p className="mt-1 font-mono text-xs">{formatDate(data.trace.startedAt)}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <ShareStat label="Events" value={String(data.trace.eventCount)} />
            <ShareStat label="Tokens" value={String(data.trace.totalTokens)} />
            <ShareStat label="Cost" value={formatCost(data.trace.totalCostUsd.toString())} />
            <ShareStat label="Solana txs" value={String(data.trace.solanaTxCount)} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border border-border bg-card p-5 text-card-foreground shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-normal">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Verification
            </h2>
            <div className="mt-4 space-y-3">
              <ReadonlyRow
                label="Merkle proof"
                value={data.verification.merkleProofValid ? "valid" : "not verified"}
              />
              <ReadonlyRow
                label="Trace hash"
                value={"traceHash" in data.verification ? data.verification.traceHash : "missing"}
              />
              <ReadonlyRow
                label="Merkle root"
                value={
                  "merkleRoot" in data.verification
                    ? (data.verification.merkleRoot ?? "missing")
                    : "missing"
                }
              />
              <ReadonlyRow
                label="Memo root"
                value={
                  "onChainRootMatched" in data.verification && data.verification.onChainRootMatched
                    ? "matched"
                    : "not matched"
                }
              />
              <ReadonlyRow
                label="Anchor slot"
                value={
                  "anchorSlot" in data.verification
                    ? (data.verification.anchorSlot ?? "pending")
                    : "pending"
                }
              />
              {"anchorSignature" in data.verification &&
              data.verification.anchorSignature !== null ? (
                <a
                  href={`https://explorer.solana.com/tx/${data.verification.anchorSignature}?cluster=devnet`}
                  className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold tracking-normal">AI Analysis</h3>
              {data.analysis === null ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Analysis has not been written for this trace.
                </p>
              ) : (
                <div className="mt-3 space-y-3 text-sm leading-6">
                  <Badge variant={failureVariant(data.analysis.failureType)}>
                    {data.analysis.failureType}
                  </Badge>
                  <p>{data.analysis.summary}</p>
                  <p className="text-muted-foreground">{data.analysis.suggestedFix}</p>
                </div>
              )}
            </div>
          </aside>

          <section className="border border-border bg-card text-card-foreground shadow-sm">
            <div className="border-b border-border p-5">
              <h2 className="text-xl font-semibold tracking-normal">Event timeline</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ordered events captured by the Mortem SDK.
              </p>
            </div>
            <div className="divide-y divide-border">
              {data.events.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground">No events were shared.</div>
              ) : (
                data.events.map((event) => <SharedEventRow key={event.id} event={event} />)
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}

async function getSharedTrace(token: string): Promise<ShareResult> {
  try {
    return await publicClient.verify.byShareToken.query({ token })
  } catch {
    return null
  }
}

function ShareMessage({ token }: Readonly<{ token: string }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-normal">Shared trace not found.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The link may have been disabled or the token may be wrong.
        </p>
        <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{token}</p>
      </section>
    </main>
  )
}

function SharedEventRow({ event }: Readonly<{ event: SharedEvent }>) {
  return (
    <details className="group p-5">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={eventVariant(event.type)}>{event.type}</Badge>
            <Badge variant={event.status === "ok" ? "success" : "error"}>{event.status}</Badge>
            <span className="font-mono text-xs text-muted-foreground">#{event.sequence}</span>
          </div>
          <p className="mt-2 text-sm font-medium">{eventHeadline(event)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(event.startedAt)} · {formatDuration(event.durationMs)}
          </p>
        </div>
      </summary>
      <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5">
        {formatJson(event.payload)}
      </pre>
    </details>
  )
}

function ShareStat({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-mono text-sm">{value}</p>
    </div>
  )
}

function ReadonlyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono text-xs">{value}</p>
    </div>
  )
}

function eventHeadline(event: SharedEvent): string {
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
    const signature = readString(payload, "signature")
    return signature ?? "solana transaction"
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
