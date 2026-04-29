// The dashboard landing page introduces Mortem and routes authenticated users into the app.
// Brand voice: dry, exact, unsentimental. Coroner files what others would call a feature.
import { Mark } from "@/components/mortem/mark"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />

      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] max-w-7xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <nav
          className="flex items-center justify-between border-b border-line pb-6"
          aria-label="Primary"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mark size={36} />
            <span className="font-display text-2xl leading-none">Mortem.</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/app">Open dossier</Link>
            </Button>
          </div>
        </nav>

        <section className="grid flex-1 items-end gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="max-w-3xl">
            <p className="eyebrow">Case File № 003 · Solana agent observability</p>
            <h1 className="stamp mt-6 font-display text-5xl leading-[0.95] tracking-tight md:text-7xl lg:text-8xl">
              Ship<span className="text-signal">.</span> Bury<span className="text-signal">.</span> Repeat
            </h1>
            <p className="mt-8 max-w-2xl font-display text-2xl italic leading-snug text-foreground md:text-3xl">
              Every project gets a death certificate.
            </p>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Trace LLM calls, tools, Solana transactions, and x402 payments in one timeline built
              for production TypeScript agents. We do not hype. We file.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/app">Open dossier</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/share/demo">Read public autopsy</Link>
              </Button>
            </div>
          </div>

          <aside className="border border-line bg-ink-2 text-card-foreground">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="case-meta">04 · Live evidence</span>
              <span className="case-meta text-fg-muted">DEVNET</span>
            </div>
            <ul className="divide-y divide-line">
              {[
                ["TRC_01H", "LLM retry avoided", "FILED"],
                ["TRC_01J", "Route refresh running", "PULSE"],
                ["TRC_01K", "Trace autopsy ready", "REVIEWED"],
              ].map(([trace, detail, status]) => (
                <li
                  key={trace}
                  className="grid grid-cols-[120px_1fr_auto] items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-fg-muted">
                    {trace}
                  </span>
                  <span>{detail}</span>
                  <span className="case-meta text-signal">{status}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-3">
              <span className="death-stamp">Certified Dead</span>
            </div>
          </aside>
        </section>

        <footer className="border-t border-line py-6">
          <p className="case-meta text-fg-muted">
            ☩ Ship · Learn · Bury · Repeat ☩
          </p>
        </footer>
      </div>
    </main>
  )
}
