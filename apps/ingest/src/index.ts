// The ingest entrypoint starts the Fastify service in production-like environments. Tests import
// createIngestServer directly so they can inject requests without opening a port.
import { getIngestEnv } from "./env.js"
import { createIngestServer } from "./server.js"

const main = async (): Promise<void> => {
  const env = getIngestEnv()
  const server = createIngestServer()

  try {
    await server.listen({ host: env.host, port: env.port })
  } catch (error) {
    server.log.error(error)
    process.exitCode = 1
  }
}

void main()
