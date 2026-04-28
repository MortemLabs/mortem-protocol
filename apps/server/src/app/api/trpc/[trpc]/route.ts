// The tRPC route handler exposes the App Router fetch adapter for all server procedures. Context is
// created per request so Authorization headers can carry Privy JWTs from the dashboard.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { ensureAnalysisWorkerStarted } from "../../../../server/analysis-worker"
import { createTRPCContext } from "../../../../server/context"
import { appRouter } from "../../../../server/root"

ensureAnalysisWorkerStarted()

const corsHeaders = (request: Request): Headers => {
  const headers = new Headers()
  const origin = request.headers.get("origin")
  const requestedHeaders = request.headers.get("access-control-request-headers")

  if (origin !== null) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders ?? "authorization, content-type, trpc-accept, x-trpc-source",
  )

  return headers
}

const withCors = (response: Response, request: Request): Response => {
  const headers = new Headers(response.headers)

  for (const [key, value] of corsHeaders(request).entries()) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

const handler = async (request: Request) =>
  withCors(
    await fetchRequestHandler({
      createContext: () => createTRPCContext(request),
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
    }),
    request,
  )

const options = async (request: Request) =>
  new Response(null, {
    headers: corsHeaders(request),
    status: 204,
  })

export { handler as GET, options as OPTIONS, handler as POST }
