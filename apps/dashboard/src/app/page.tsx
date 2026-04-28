import { Button } from "@/components/ui/button"
// The dashboard landing page introduces Mortem and routes authenticated users into the app.
// It is intentionally product-focused while the authenticated workspace carries the main experience.
import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col justify-between gap-12">
        <nav className="flex items-center justify-between" aria-label="Primary">
          <Link
            href="/"
            className="rounded-md text-lg font-semibold tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Mortem
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/app">Open app</Link>
            </Button>
          </div>
        </nav>

        <div className="grid items-end gap-10 pb-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-normal text-muted-foreground">
              Solana agent observability
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
              Debug the exact moment an agent drifts.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Trace LLM calls, tools, Solana transactions, and x402 payments in one timeline built
              for production TypeScript agents.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/app">Review traces</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/share/demo">Open shared trace</Link>
              </Button>
            </div>
          </div>

          <div className="border border-border bg-card p-4 text-card-foreground shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-medium">Live trace activity</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">devnet</span>
            </div>
            <div className="space-y-4 pt-4">
              {[
                ["trace_01H", "LLM retry avoided", "completed"],
                ["trace_01J", "Route refresh running", "waiting"],
                ["trace_01K", "Trace analysis ready", "reviewed"],
              ].map(([trace, detail, status]) => (
                <div
                  key={trace}
                  className="grid grid-cols-[92px_1fr_auto] items-center gap-3 text-sm"
                >
                  <span className="font-mono tabular-nums text-muted-foreground">{trace}</span>
                  <span>{detail}</span>
                  <span className="border border-border px-2 py-1 text-xs text-muted-foreground">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
