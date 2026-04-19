// The Fastify server factory wires shared service concerns before feature routes are registered.
// It installs a gzip-aware JSON parser because the SDK sends compressed trace batches.
import { gunzipSync } from "node:zlib"
import Fastify, { type FastifyInstance } from "fastify"
import { getIngestEnv } from "./env.js"
import { registerBatchRoutes } from "./routes/batch.js"
import { registerCompleteRoutes } from "./routes/complete.js"
import { registerHealthRoutes } from "./routes/health.js"
import { registerLiveRoutes } from "./routes/live.js"

export const createIngestServer = (): FastifyInstance => {
  const env = getIngestEnv()
  const server = Fastify({
    bodyLimit: env.maxBodyBytes,
    logger: true,
  })

  server.removeContentTypeParser("application/json")
  server.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    try {
      const encoding = request.headers["content-encoding"]
      const raw = encoding === "gzip" ? gunzipSync(body) : body
      done(null, JSON.parse(raw.toString("utf8")) as unknown)
    } catch (error) {
      done(error instanceof Error ? error : new Error("Invalid JSON body"))
    }
  })

  registerBatchRoutes(server)
  registerCompleteRoutes(server)
  registerHealthRoutes(server)
  registerLiveRoutes(server)

  return server
}
