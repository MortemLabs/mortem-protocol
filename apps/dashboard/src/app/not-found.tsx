// Branded 404. A missing route is treated as a case the registry never filed.
import { Mark } from "@/components/mortem/mark"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export const metadata = {
  title: "Not found · Mortem",
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-6">
        <section className="w-full max-w-md border border-line bg-ink-2 p-6 text-card-foreground">
          <div className="flex items-center gap-3">
            <Mark size={28} alt="" />
            <span className="font-display text-2xl leading-none">
              Mortem<span className="pl-0.5 text-signal">.</span>
            </span>
          </div>
          <p className="eyebrow mt-6">404 · No record</p>
          <h1 className="mt-3 font-display text-3xl leading-tight">This case was never filed.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The page you are looking for is missing, buried, or never existed. Nothing to autopsy
            here.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/">Back to file</Link>
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
