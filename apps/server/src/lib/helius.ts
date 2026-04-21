// Helius webhook helpers manage the watched wallet list without hardcoding the webhook config. They
// preserve the existing webhook URL and settings while adding or removing account addresses.
type JsonRecord = Record<string, unknown>

interface HeliusWebhookConfig {
  accountAddresses: string[]
  authHeader: string | null
  transactionTypes: string[]
  webhookType: string
  webhookURL: string
}

const WEBHOOK_BASE_URL = "https://api-mainnet.helius-rpc.com/v0/webhooks"

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object"

const readString = (record: JsonRecord, key: string): string | null => {
  const value = record[key]
  return typeof value === "string" ? value : null
}

const readStringArray = (record: JsonRecord, key: string): string[] | null => {
  const value = record[key]
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null
}

const webhookRequestUrl = (): string | null => {
  const apiKey = process.env.HELIUS_API_KEY
  const webhookId = process.env.HELIUS_WEBHOOK_ID

  if (apiKey === undefined || webhookId === undefined) {
    console.warn("[helius] HELIUS_API_KEY or HELIUS_WEBHOOK_ID is missing")
    return null
  }

  return `${WEBHOOK_BASE_URL}/${webhookId}?api-key=${apiKey}`
}

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn("[helius] webhook request failed", response.status)
      return null
    }

    return (await response.json()) as unknown
  } catch (error) {
    console.warn("[helius] webhook request failed", error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const getWebhookConfig = async (): Promise<HeliusWebhookConfig | null> => {
  const url = webhookRequestUrl()

  if (url === null) {
    return null
  }

  const payload = await fetchJson(url)

  if (!isRecord(payload)) {
    console.warn("[helius] webhook response was not an object")
    return null
  }

  const accountAddresses = readStringArray(payload, "accountAddresses")
  const transactionTypes = readStringArray(payload, "transactionTypes")
  const webhookType = readString(payload, "webhookType")
  const webhookURL = readString(payload, "webhookURL")
  const authHeader = payload.authHeader === null ? null : readString(payload, "authHeader")

  if (
    accountAddresses === null ||
    transactionTypes === null ||
    webhookType === null ||
    webhookURL === null
  ) {
    console.warn("[helius] webhook response did not include the expected fields")
    return null
  }

  return {
    accountAddresses,
    authHeader,
    transactionTypes,
    webhookType,
    webhookURL,
  }
}

const updateWebhookAddresses = async (addresses: string[]): Promise<void> => {
  const url = webhookRequestUrl()

  if (url === null) {
    return
  }

  const current = await getWebhookConfig()

  if (current === null) {
    return
  }

  await fetchJson(url, {
    body: JSON.stringify({
      accountAddresses: [...new Set(addresses)],
      authHeader: current.authHeader,
      transactionTypes: current.transactionTypes,
      webhookType: current.webhookType,
      webhookURL: current.webhookURL,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "PUT",
  })
}

export async function getWebhookAddresses(): Promise<string[]> {
  const current = await getWebhookConfig()
  return current?.accountAddresses ?? []
}

export async function addWalletToWebhook(wallet: string): Promise<void> {
  const current = await getWebhookConfig()

  if (current === null || current.accountAddresses.includes(wallet)) {
    return
  }

  await updateWebhookAddresses([...current.accountAddresses, wallet])
}

export async function removeWalletFromWebhook(wallet: string): Promise<void> {
  const current = await getWebhookConfig()

  if (current === null || !current.accountAddresses.includes(wallet)) {
    return
  }

  await updateWebhookAddresses(current.accountAddresses.filter((address) => address !== wallet))
}
