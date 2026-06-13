// Public share pages render trace evidence on the server so links remain readable without browser
// JavaScript. Data is loaded through a public trace read instead of protected dashboard APIs.
import { CopyButton } from "@/components/mortem/copy-button"
import {
  eventHeadline,
  eventSignature,
  failureLabel,
  failureVariant,
  formatCost,
  formatDate,
  formatDuration,
  formatJson,
  statusVariant,
  truncateHash,
  eventVariant,
} from "@/components/mortem/trace-format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import type { inferRouterOutputs } from "@trpc/server"
import { AlertCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import superjson from "superjson"
import type { AppRouter } from "../../../../../server/src/server/root"

type ShareResult = inferRouterOutputs<AppRouter>["traces"]["byShareToken"]
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
      <div className="tape h-2 w-full" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Mortem
          </Link>
        </Button>

        <section className="mt-6 border border-line bg-ink-2 text-card-foreground">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <p className="case-meta">04 · Public autopsy</p>
            <span className="death-stamp">Filed</span>
          </div>
          <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
              </div>
              <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight">
                {data.inputSummary}
              </h1>
              <p className="mt-3 break-all font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {data.id}
              </p>
            </div>
            <div className="border border-line bg-ink p-3">
              <p className="eyebrow">Established</p>
              <p className="mt-1 font-mono text-xs">{formatDate(data.startedAt)}</p>
            </div>
          </div>

          <div className="grid gap-px bg-line md:grid-cols-4">
            <ShareStat label="Events" value={String(data.eventCount)} />
            <ShareStat label="Tokens" value={String(data.totalTokens)} />
            <ShareStat label="Cost" value={formatCost(data.totalCostUsd.toString())} />
            <ShareStat label="Solana txs" value={String(data.solanaTxCount)} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border border-line bg-ink-2 p-5 text-card-foreground">
            <p className="eyebrow">Autopsy</p>
            <h2 className="mt-2 font-display text-2xl leading-tight">Cause of death</h2>
            {data.analysis === null ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Autopsy has not been written for this trace.
              </p>
            ) : (
              <div className="mt-4 space-y-3 text-sm leading-6">
                <Badge variant={failureVariant(data.analysis.failureType)}>
                  {failureLabel(data.analysis.failureType)}
                </Badge>
                <p>{data.analysis.summary}</p>
                <p className="text-muted-foreground">{data.analysis.suggestedFix}</p>
              </div>
            )}
          </aside>

          <section className="border border-line bg-ink-2 text-card-foreground">
            <div className="border-b border-line p-5">
              <p className="eyebrow">05 · Timeline</p>
              <h2 className="mt-2 font-display text-2xl leading-tight">Event chronology</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ordered events captured by the Mortem SDK.
              </p>
            </div>
            <div className="divide-y divide-line">
              {data.events.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground">No events were shared.</div>
              ) : (
                data.events.map((event: SharedEvent) => (
                  <SharedEventRow key={event.id} event={event} />
                ))
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
    return await publicClient.traces.byShareToken.query({ token })
  } catch {
    return null
  }
}

function ShareMessage({ token }: Readonly<{ token: string }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md border border-line bg-ink-2 p-6 text-card-foreground">
        <AlertCircle className="h-5 w-5 text-signal" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl leading-tight">Shared trace buried</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The link may have been disabled or the token may be wrong.
        </p>
        <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{token}</p>
      </section>
    </main>
  )
}

function SharedEventRow({ event }: Readonly<{ event: SharedEvent }>) {
  const signature = eventSignature(event)

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
      {signature === null ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {truncateHash(signature)}
          </p>
          <CopyButton label="Copy tx hash" size="sm" value={signature} />
        </div>
      )}
      <pre className="mt-4 max-h-96 overflow-auto border border-line bg-ink p-3 text-xs leading-5">
        {formatJson(event.payload)}
      </pre>
    </details>
  )
}

function ShareStat({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="bg-ink-2 p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 break-all font-mono text-sm tabular-nums">{value}</p>
    </div>
  )
}
