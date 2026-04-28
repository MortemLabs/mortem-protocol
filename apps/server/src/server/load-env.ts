// Standalone worker scripts do not get Next.js' automatic .env loading, so this lightweight loader
// hydrates process.env before Redis, Prisma, or LLM clients read configuration.
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const unquote = (value: string): string => {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

const loadEnvFile = (path: string): void => {
  if (!existsSync(path)) {
    return
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/u)

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue
    }

    const separator = trimmed.indexOf("=")

    if (separator <= 0) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()

    if (process.env[key] !== undefined) {
      continue
    }

    process.env[key] = unquote(trimmed.slice(separator + 1))
  }
}

loadEnvFile(resolve(process.cwd(), ".env"))
loadEnvFile(resolve(process.cwd(), "apps/server/.env"))
