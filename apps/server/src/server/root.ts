// The root tRPC router composes feature routers and exports the AppRouter type for clients.
// Additional routers are added here as the server surface grows.
import { agentsRouter } from "./routers/agents.js"
import { createTRPCRouter } from "./trpc.js"

export const appRouter = createTRPCRouter({
  agents: agentsRouter,
})

export type AppRouter = typeof appRouter
