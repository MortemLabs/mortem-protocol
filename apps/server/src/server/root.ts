// The root tRPC router composes feature routers and exports the AppRouter type for clients.
// Additional routers are added here as the server surface grows.
import { agentsRouter } from "./routers/agents"
import { analysisRouter } from "./routers/analysis"
import { onchainRouter } from "./routers/onchain"
import { tracesRouter } from "./routers/traces"
import { verifyRouter } from "./routers/verify"
import { createTRPCRouter } from "./trpc"

export const appRouter = createTRPCRouter({
  agents: agentsRouter,
  analysis: analysisRouter,
  onchain: onchainRouter,
  traces: tracesRouter,
  verify: verifyRouter,
})

export type AppRouter = typeof appRouter
