import { createRequire } from "node:module"
import { dirname } from "node:path"
import type { NextConfig } from "next"

// Next.js server configuration stays minimal because this app primarily exposes route handlers.
// Runtime behavior is implemented inside App Router files under src/app.
const requireFromConfig = createRequire(import.meta.url)
const requireFromDb = createRequire(requireFromConfig.resolve("@mortemlabs/db"))
const prismaClientEntry = requireFromDb.resolve("@prisma/client")
const generatedPrismaClient = requireFromConfig.resolve(".prisma/client/default", {
  paths: [dirname(prismaClientEntry)],
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve ??= {}
    config.resolve.alias ??= {}
    config.resolve.alias[".prisma/client/default"] = generatedPrismaClient
    return config
  },
}

export default nextConfig
