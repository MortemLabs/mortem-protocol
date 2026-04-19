// The login route gives users a focused entry point into Privy's modal auth flow.
// It also renders a clear local setup state when a Privy app id has not been configured.
import Link from "next/link"
import { LoginPanel } from "./panel"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground md:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex min-h-10 items-center rounded-md text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Mortem
        </Link>
        <LoginPanel />
      </div>
    </main>
  )
}
