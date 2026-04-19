// Solana instrumentation proxies Connection-like objects without importing web3.js. It records
// transaction signatures from send calls and starts best-effort confirmation polling in the background.
import type { JsonValue, SolanaTxPayload } from "@mortemlabs/shared"
import { getActiveSession } from "../context.js"

type MutableRecord = Record<PropertyKey, unknown>
type UnknownFunction = (...args: unknown[]) => unknown

const PROXIED = Symbol.for("mortem.solana.proxied")
const SEND_METHODS = new Set(["sendRawTransaction", "sendTransaction"])
const CONFIRMATION_ATTEMPTS = 10
const CONFIRMATION_DELAY_MS = 1_000

const isRecord = (value: unknown): value is MutableRecord =>
  value !== null && typeof value === "object"

const toJsonValue = (value: unknown, depth = 0): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (depth > 8) {
    return "[truncated]"
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, depth + 1))
  }

  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {}

    for (const [key, entry] of Object.entries(value)) {
      if (
        typeof entry === "undefined" ||
        typeof entry === "function" ||
        typeof entry === "symbol"
      ) {
        continue
      }

      output[key] = toJsonValue(entry, depth + 1)
    }

    return output
  }

  return String(value)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const stringFromRecord = (record: MutableRecord, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const getRpcUrl = (connection: MutableRecord): string | undefined =>
  stringFromRecord(connection, "rpcEndpoint") ?? stringFromRecord(connection, "_rpcEndpoint")

const getCluster = (rpcUrl: string | undefined): SolanaTxPayload["cluster"] => {
  if (rpcUrl?.includes("mainnet") === true) {
    return "mainnet"
  }

  if (rpcUrl?.includes("localhost") === true || rpcUrl?.includes("127.0.0.1") === true) {
    return "localnet"
  }

  return "devnet"
}

const getInstructionNames = (transaction: unknown): string[] => {
  if (!isRecord(transaction)) {
    return []
  }

  const instructions = transaction.instructions

  if (!Array.isArray(instructions)) {
    return []
  }

  return instructions.map((instruction, index) => {
    const record = isRecord(instruction) ? instruction : {}
    return (
      stringFromRecord(record, "name") ??
      stringFromRecord(record, "programId") ??
      `instruction_${index}`
    )
  })
}

const buildPayload = (
  connection: MutableRecord,
  methodName: string,
  args: readonly unknown[],
): SolanaTxPayload => {
  const rpcUrl = getRpcUrl(connection)

  return {
    accountKeys: [],
    cluster: getCluster(rpcUrl),
    instructionNames: methodName === "sendTransaction" ? getInstructionNames(args[0]) : [],
    programIds: [],
    rpcUrl,
  }
}

const confirmationStatus = (result: unknown): SolanaTxPayload["confirmationStatus"] | undefined => {
  if (!isRecord(result)) {
    return undefined
  }

  const value = result.value
  const valueRecord = isRecord(value) ? value : result
  const status = stringFromRecord(valueRecord, "confirmationStatus")

  if (status === "processed" || status === "confirmed" || status === "finalized") {
    return status
  }

  return undefined
}

const pollConfirmation = async (
  connection: MutableRecord,
  signature: string,
): Promise<SolanaTxPayload["confirmationStatus"] | undefined> => {
  const confirmTransaction = connection.confirmTransaction

  if (typeof confirmTransaction !== "function") {
    return undefined
  }

  for (let attempt = 0; attempt < CONFIRMATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await (confirmTransaction as UnknownFunction).call(
        connection,
        signature,
        "confirmed",
      )
      const status = confirmationStatus(result)

      if (status === "confirmed" || status === "finalized") {
        return status
      }
    } catch {
      return undefined
    }

    await sleep(CONFIRMATION_DELAY_MS)
  }

  return undefined
}

export const wrapSolanaConnection = <T extends object>(connection: T): T => {
  if (!isRecord(connection) || connection[PROXIED] === true) {
    return connection
  }

  const connectionRecord = connection as MutableRecord

  const proxy = new Proxy(connection, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (
        typeof property !== "string" ||
        !SEND_METHODS.has(property) ||
        typeof value !== "function"
      ) {
        return value
      }

      return function patchedSolanaSend(this: unknown, ...args: unknown[]) {
        const session = getActiveSession()

        if (session === undefined) {
          return (value as UnknownFunction).apply(this, args)
        }

        const payload = buildPayload(connectionRecord, property, args)
        const event = session.beginEvent("solana_tx", toJsonValue(payload))

        try {
          const result = (value as UnknownFunction).apply(this, args)

          if (result instanceof Promise) {
            return result
              .then((signature) => {
                const signatureString = typeof signature === "string" ? signature : undefined
                event.complete({
                  payload: toJsonValue({
                    ...payload,
                    signature: signatureString,
                  }),
                })

                if (signatureString !== undefined) {
                  void pollConfirmation(connectionRecord, signatureString)
                }

                return signature
              })
              .catch((error: unknown) => {
                event.fail(error)
                throw error
              })
          }

          const signatureString = typeof result === "string" ? result : undefined
          event.complete({
            payload: toJsonValue({
              ...payload,
              signature: signatureString,
            }),
          })

          if (signatureString !== undefined) {
            void pollConfirmation(connectionRecord, signatureString)
          }

          return result
        } catch (error) {
          event.fail(error)
          throw error
        }
      }
    },
  })

  connectionRecord[PROXIED] = true
  return proxy
}
