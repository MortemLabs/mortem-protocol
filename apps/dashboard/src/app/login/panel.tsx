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
      <section className="border border-line bg-ink-2 p-6">
        <p className="eyebrow">01 · Privy setup</p>
        <h1 className="stamp mt-4 font-display text-3xl leading-tight">
          Add a Privy app id to sign in
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Set NEXT_PUBLIC_PRIVY_APP_ID and restart the dashboard. Until then, the app renders in
          local preview mode.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/app">Preview workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to file</Link>
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
    <section className="border border-line bg-ink-2 p-6">
      <p className="eyebrow">02 · Secure dashboard access</p>
      <h1 className="stamp mt-4 font-display text-3xl leading-tight">
        {authenticated ? "You are signed in" : "Sign in to inspect agent traces"}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {authenticated
          ? `${email} can open private agents and live streams.`
          : "Login to Mortem. Every project gets a death certificate."}
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {authenticated ? (
          <>
            <Button asChild>
              <Link href="/app">Open dossier</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => logout()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button type="button" disabled={!ready} onClick={() => login()}>
            {ready ? "Sign in" : "Preparing pulse"}
          </Button>
        )}
      </div>
    </section>
  )
}
