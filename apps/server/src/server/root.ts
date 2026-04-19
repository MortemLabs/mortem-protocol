// The root tRPC router composes feature routers and exports the AppRouter type for clients.
// Additional routers are added here as the server surface grows.
import { agentsRouter } from "./routers/agents.js"
import { analysisRouter } from "./routers/analysis.js"
import { onchainRouter } from "./routers/onchain.js"
import { tracesRouter } from "./routers/traces.js"
import { verifyRouter } from "./routers/verify.js"
import { createTRPCRouter } from "./trpc.js"

export const appRouter = createTRPCRouter({
  agents: agentsRouter,
  analysis: analysisRouter,
  onchain: onchainRouter,
  traces: tracesRouter,
  verify: verifyRouter,
})

export type AppRouter = typeof appRouter
