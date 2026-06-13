// Root error boundary. Renders a clinical failure card instead of a raw stack trace.
"use client"

import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCcw } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-6">
        <section className="w-full max-w-md border border-signal bg-ink-2 p-6 text-card-foreground">
          <AlertCircle className="h-5 w-5 text-signal" aria-hidden="true" />
          <p className="eyebrow mt-4">Cause of death: runtime error</p>
          <h1 className="mt-3 font-display text-3xl leading-tight">Something died mid-request.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The page hit an unexpected error. Retry the render, or return to the workspace if it
            keeps flatlining.
          </p>
          {error.digest === undefined ? null : (
            <p className="mt-3 break-all font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
              Ref · {error.digest}
            </p>
          )}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => reset()}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Open workspace</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
