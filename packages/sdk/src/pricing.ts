// Pricing centralizes model cost estimates for SDK instrumentation and analysis. Ollama cloud API
// usage is billed externally — we return a -1 sentinel so the dashboard can show "usage tracked by Ollama".
import type { LLMProvider, TokenUsage } from "@mortemlabs/shared"

export type PricingProvider = LLMProvider | "openai" | "unknown" | "vercel-ai"

export interface ModelPricing {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

export interface EstimateCostInput {
  provider: PricingProvider
  model: string
  usage?: TokenUsage | undefined
}

const ZERO_PRICING: ModelPricing = {
  inputPerMillionUsd: 0,
  outputPerMillionUsd: 0,
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "anthropic:claude-sonnet-4-20250514": {
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
  },
  "openai:gpt-4o-mini": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  },
  "openai:gpt-4o": {
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10,
  },
}

export const getModelPricing = (provider: PricingProvider, model: string): ModelPricing => {
  if (provider === "ollama" || model.startsWith("ollama/")) {
    return ZERO_PRICING
  }

  return MODEL_PRICING[`${provider}:${model}`] ?? ZERO_PRICING
}

export const estimateLLMCostUsd = ({ provider, model, usage }: EstimateCostInput): number => {
  // Ollama cloud API usage is billed externally — return -1 sentinel
  if (provider === "ollama" || model.startsWith("ollama/")) {
    return -1
  }

  if (usage === undefined) {
    return 0
  }

  const pricing = getModelPricing(provider, model)

  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  )
}
