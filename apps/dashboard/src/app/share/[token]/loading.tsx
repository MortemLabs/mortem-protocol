// Server-rendered skeleton shown while a public autopsy is fetched. Mirrors the
// page frame so the layout does not jump when data resolves.
export default function ShareLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
        <div className="h-9 w-28 animate-pulse bg-ink-2" aria-hidden="true" />

        <section className="mt-6 border border-line bg-ink-2">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <div className="h-3 w-32 animate-pulse bg-ink-3" />
            <div className="h-3 w-12 animate-pulse bg-ink-3" />
          </div>
          <div className="space-y-3 p-6">
            <div className="h-4 w-20 animate-pulse bg-ink-3" />
            <div className="h-10 w-2/3 animate-pulse bg-ink-3" />
            <div className="h-3 w-48 animate-pulse bg-ink-3" />
          </div>
          <div className="grid gap-px bg-line md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2 bg-ink-2 p-4">
                <div className="h-3 w-16 animate-pulse bg-ink-3" />
                <div className="h-5 w-12 animate-pulse bg-ink-3" />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-48 animate-pulse border border-line bg-ink-2" />
          <div className="h-72 animate-pulse border border-line bg-ink-2" />
        </section>
      </div>
      <span className="sr-only">Loading shared autopsy</span>
    </main>
  )
}
