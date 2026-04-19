// Privy verification is intentionally limited to JWT validation. Mortem never calls Privy server
// APIs beyond verifyAuthToken, and decoded user IDs are used for local access checks only.
import { PrivyClient } from "@privy-io/server-auth"
import type { FastifyRequest } from "fastify"

let privyClient: PrivyClient | undefined

const getPrivyClient = (): PrivyClient | undefined => {
  if (privyClient !== undefined) {
    return privyClient
  }

  const appId = process.env.PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET

  if (appId === undefined || appSecret === undefined) {
    return undefined
  }

  privyClient = new PrivyClient(appId, appSecret)
  return privyClient
}

const extractBearerToken = (request: FastifyRequest): string | undefined => {
  const authorization = request.headers.authorization

  if (authorization?.startsWith("Bearer ") !== true) {
    return undefined
  }

  return authorization.slice("Bearer ".length)
}

export const verifyPrivyJwt = async (request: FastifyRequest): Promise<string | undefined> => {
  const token = extractBearerToken(request)
  const client = getPrivyClient()

  if (token === undefined || client === undefined) {
    return undefined
  }

  try {
    const claims = await client.verifyAuthToken(token)
    return claims.userId
  } catch {
    return undefined
  }
}
