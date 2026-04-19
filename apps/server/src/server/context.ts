// tRPC context verifies Privy JWTs and exposes the decoded user DID to protected procedures. The
// backend only calls Privy verifyAuthToken, never broader server APIs.
import { PrivyClient } from "@privy-io/server-auth"

export interface TRPCContext {
  userId: string | null
}

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

const bearerToken = (request: Request): string | undefined => {
  const authorization = request.headers.get("authorization")

  if (authorization?.startsWith("Bearer ") !== true) {
    return undefined
  }

  return authorization.slice("Bearer ".length)
}

export const createTRPCContext = async (request: Request): Promise<TRPCContext> => {
  const token = bearerToken(request)
  const client = getPrivyClient()

  if (token === undefined || client === undefined) {
    return { userId: null }
  }

  try {
    const claims = await client.verifyAuthToken(token)
    return { userId: claims.userId }
  } catch {
    return { userId: null }
  }
}
