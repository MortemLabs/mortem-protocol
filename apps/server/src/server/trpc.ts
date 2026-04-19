// tRPC setup defines shared public and protected procedures for the server app. Protected
// procedures require a verified Privy DID attached by createTRPCContext.
import { TRPCError, initTRPC } from "@trpc/server"
import superjson from "superjson"
import type { TRPCContext } from "./context.js"

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  })
})
