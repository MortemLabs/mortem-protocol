// The app home route is the authenticated workspace entry point and starts with the user's agents.
// The shared /app layout owns the brand header and navigation, so this screen focuses on content.
import { AgentList } from "./agent-list"

export default function AppHomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <p className="eyebrow">01 · Workspace</p>
          <h1 className="stamp font-display text-4xl leading-[0.95] tracking-tight">Agents</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Monitor trace volume, case status, and live debugging posture for every TypeScript agent
            sending events to Mortem.
          </p>
        </aside>

        <AgentList />
      </section>
    </div>
  )
}
