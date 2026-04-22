// The login panel bridges the page shell to Privy's client-only modal controls.
// It avoids calling Privy hooks unless the provider was initialized with a real app id.
"use client"

import { useDashboardAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"

export function LoginPanel() {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return (
      <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Privy setup</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">
          Add a Privy app id to sign in.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Set NEXT_PUBLIC_PRIVY_APP_ID and restart the dashboard. Until then, the app renders in
          local preview mode.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/app">Preview workspace</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </section>
    )
  }

  return <PrivyLoginPanel />
}

function PrivyLoginPanel() {
  const { authenticated, login, logout, ready, user } = usePrivy()
  const email = user?.email?.address ?? "Connected account"

  return (
    <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Secure dashboard access</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-normal">
        {authenticated ? "You are signed in." : "Sign in to inspect agent traces."}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {authenticated
          ? `${email} can open private agents and live streams`
          : "login to Mortem."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {authenticated ? (
          <>
            <Button asChild>
              <Link href="/app">Open workspace</Link>
            </Button>
            <Button type="button" variant="secondary" onClick={() => logout()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button type="button" disabled={!ready} onClick={() => login()}>
            {ready ? "Sign in" : "Preparing sign in"}
          </Button>
        )}
      </div>
    </section>
  )
}
