// Encryption helpers protect private trace payloads with AES-256-GCM. They return undefined on
// failures so instrumentation can remain best-effort and non-throwing.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import type { JsonValue } from "@mortemlabs/shared"

export interface EncryptedPayload {
  algorithm: "aes-256-gcm"
  ivBase64: string
  tagBase64: string
  ciphertextBase64: string
}

const KEY_BYTES = 32
const IV_BYTES = 12

const readEnvKey = (): string | undefined => {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }

  return globalWithProcess.process?.env?.MORTEM_MASTER_KEY
}

const resolveKey = (masterKeyBase64?: string | undefined): Buffer | undefined => {
  const source = masterKeyBase64 ?? readEnvKey()

  if (source === undefined) {
    return undefined
  }

  try {
    const key = Buffer.from(source, "base64")
    return key.byteLength === KEY_BYTES ? key : undefined
  } catch {
    return undefined
  }
}

const parseJson = (input: string): JsonValue | undefined => {
  try {
    return JSON.parse(input) as JsonValue
  } catch {
    return undefined
  }
}

export const encryptPayload = (
  payload: JsonValue,
  masterKeyBase64?: string | undefined,
): EncryptedPayload | undefined => {
  const key = resolveKey(masterKeyBase64)

  if (key === undefined) {
    return undefined
  }

  try {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()

    return {
      algorithm: "aes-256-gcm",
      ciphertextBase64: ciphertext.toString("base64"),
      ivBase64: iv.toString("base64"),
      tagBase64: tag.toString("base64"),
    }
  } catch {
    return undefined
  }
}

export const decryptPayload = (
  encrypted: EncryptedPayload,
  masterKeyBase64?: string | undefined,
): JsonValue | undefined => {
  const key = resolveKey(masterKeyBase64)

  if (key === undefined) {
    return undefined
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.ivBase64, "base64"))
    decipher.setAuthTag(Buffer.from(encrypted.tagBase64, "base64"))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertextBase64, "base64")),
      decipher.final(),
    ]).toString("utf8")

    return parseJson(plaintext)
  } catch {
    return undefined
  }
}
