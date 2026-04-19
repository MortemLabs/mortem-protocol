// The tRPC route handler exposes the App Router fetch adapter for all server procedures. Context is
// created per request so Authorization headers can carry Privy JWTs from the dashboard.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { createTRPCContext } from "../../../../server/context.js"
import { appRouter } from "../../../../server/root.js"

const handler = (request: Request) =>
  fetchRequestHandler({
    createContext: () => createTRPCContext(request),
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
  })

export { handler as GET, handler as POST }
