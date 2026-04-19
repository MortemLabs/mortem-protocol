// The app home route is the authenticated workspace entry point and starts with the user's agents.
// Data fetching lives in the client child so Privy JWTs can be attached to tRPC requests.
import Link from "next/link"
import { AgentList } from "./agent-list"

export default function AppHomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <Link
            href="/app"
            className="rounded-md text-lg font-semibold tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Mortem
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Workspace">
            <Link
              href="/app/onchain"
              className="inline-flex min-h-10 items-center rounded-md px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              On-chain
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center rounded-md px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Account
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">Agents</h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Monitor trace volume, anchor state, and live debugging posture for every TypeScript
              agent sending events to Mortem.
            </p>
          </aside>

          <AgentList />
        </section>
      </div>
    </main>
  )
}
