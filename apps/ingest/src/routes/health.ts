// Health routes provide a lightweight readiness check for load balancers and deployment probes.
// They avoid touching external dependencies so failures reflect process health only.
import type { FastifyInstance } from "fastify"

export const registerHealthRoutes = (server: FastifyInstance): void => {
  server.get("/healthz", async () => ({
    ok: true,
    service: "mortem-ingest",
  }))
}
