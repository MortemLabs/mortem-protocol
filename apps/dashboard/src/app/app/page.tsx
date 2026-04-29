// The app home route is the authenticated workspace entry point and starts with the user's agents.
// Data fetching lives in the client child so Privy JWTs can be attached to tRPC requests.
import { Mark } from "@/components/mortem/mark"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AgentList } from "./agent-list"

export default function AppHomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-line pb-4">
          <Link
            href="/app"
            className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mark size={28} />
            <span className="font-display text-lg leading-none">Mortem.</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Workspace">
            <Button asChild>
              <Link href="/app/agents/new">File new agent</Link>
            </Button>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Account
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <p className="eyebrow">01 · Workspace</p>
            <h1 className="stamp font-display text-4xl leading-[0.95] tracking-tight">
              Agents
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Monitor trace volume, memo anchoring, and live debugging posture for every TypeScript
              agent sending events to Mortem.
            </p>
          </aside>

          <AgentList />
        </section>
      </div>
    </main>
  )
}
