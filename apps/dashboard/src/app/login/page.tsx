// The login route gives users a focused entry point into Privy's modal auth flow.
// It also renders a clear local setup state when a Privy app id has not been configured.
import { Mark } from "@/components/mortem/mark"
import Link from "next/link"
import { LoginPanel } from "./panel"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mark size={32} />
            <span className="font-display text-xl leading-none">Mortem.</span>
          </Link>
          <LoginPanel />
        </div>
      </div>
    </main>
  )
}
