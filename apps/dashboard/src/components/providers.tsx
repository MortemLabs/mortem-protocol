// Client providers attach Privy auth and a tRPC client that forwards browser JWTs to the backend.
// The provider layer is intentionally thin so pages can consume hooks without duplicating auth headers.
"use client"

import { PrivyProvider, usePrivy } from "@privy-io/react-auth"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { createTRPCReact } from "@trpc/react-query"
import { type ReactNode, createContext, useContext, useState } from "react"
import superjson from "superjson"
import type { AppRouter } from "../../../server/src/server/root"

export const trpc = createTRPCReact<AppRouter>()

type AccessTokenGetter = () => Promise<string | null>
type DashboardAuthState = {
  privyEnabled: boolean
}

const DashboardAuthContext = createContext<DashboardAuthState>({ privyEnabled: false })
const trpcUrl = process.env.NEXT_PUBLIC_MORTEM_SERVER_URL ?? "http://localhost:3001/api/trpc"

export function useDashboardAuth() {
  return useContext(DashboardAuthContext)
}

export function DashboardProviders({ children }: Readonly<{ children: ReactNode }>) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""

  if (appId.trim().length === 0) {
    return (
      <DashboardAuthContext.Provider value={{ privyEnabled: false }}>
        <TRPCProvider getAccessToken={async () => null}>{children}</TRPCProvider>
      </DashboardAuthContext.Provider>
    )
  }

  return (
    <DashboardAuthContext.Provider value={{ privyEnabled: true }}>
      <PrivyProvider appId={appId} config={{ loginMethods: ["email", "wallet"] }}>
        <PrivyTRPCBridge>{children}</PrivyTRPCBridge>
      </PrivyProvider>
    </DashboardAuthContext.Provider>
  )
}

function PrivyTRPCBridge({ children }: Readonly<{ children: ReactNode }>) {
  const { getAccessToken } = usePrivy()

  return <TRPCProvider getAccessToken={getAccessToken}>{children}</TRPCProvider>
}

function TRPCProvider({
  children,
  getAccessToken,
}: Readonly<{ children: ReactNode; getAccessToken: AccessTokenGetter }>) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          async headers() {
            const token = await getAccessToken()
            return token === null ? {} : { Authorization: `Bearer ${token}` }
          },
          transformer: superjson,
          url: trpcUrl,
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
