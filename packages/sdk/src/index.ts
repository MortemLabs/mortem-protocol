// The SDK package is the public instrumentation entrypoint for TypeScript agents. It exports the
// core Mortem client, session primitives, context helpers, and structural wrapper types.
export { Mortem } from "./client.js"
export { getActiveEventId, getActiveSession, runWithEvent, runWithSession } from "./context.js"
export { EventBuilder } from "./event-builder.js"
export { createLangChainHandler, createLangChainHandlerAsync } from "./instrument/langchain.js"
export { estimateLLMCostUsd, getModelPricing } from "./pricing.js"
export { Session } from "./session.js"
export type {
  BeginEventOptions,
  CompleteEventOptions,
  Connection,
  FailEventOptions,
  LanguageModel,
  MortemCallbackHandler,
  MortemConfig,
  MortemLogger,
  SessionOptions,
} from "./types.js"
