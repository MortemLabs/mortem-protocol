// AsyncLocalStorage carries the active Mortem session and parent event through async agent code.
// Instrumentation wrappers read this context without forcing users to thread session objects around.
import { AsyncLocalStorage } from "node:async_hooks"
import type { Session } from "./session.js"

interface MortemAsyncContext {
  session?: Session | undefined
  eventId?: string | undefined
}

const storage = new AsyncLocalStorage<MortemAsyncContext>()

export const getActiveSession = (): Session | undefined => storage.getStore()?.session

export const getActiveEventId = (): string | undefined => storage.getStore()?.eventId

export const runWithSession = <T>(session: Session, callback: () => T): T => {
  const current = storage.getStore()
  return storage.run({ ...current, session }, callback)
}

export const runWithEvent = <T>(eventId: string, callback: () => T): T => {
  const current = storage.getStore()
  return storage.run({ ...current, eventId }, callback)
}
