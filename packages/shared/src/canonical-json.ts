// Canonical JSON produces byte-stable strings for hashing traces and market snapshots. It
// sorts object keys, serializes Dates and bigint values predictably, and rejects invalid numbers.
type CanonicalObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is CanonicalObject => {
  if (value === null || typeof value !== "object") {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const serialize = (value: unknown, inArray: boolean): string | undefined => {
  if (value === null) {
    return "null"
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Cannot canonicalize non-finite numbers")
    }

    return JSON.stringify(value)
  }

  if (typeof value === "bigint") {
    return JSON.stringify(value.toString())
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Cannot canonicalize invalid Date values")
    }

    return JSON.stringify(value.toISOString())
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item, true) ?? "null").join(",")}]`
  }

  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const serialized = serialize(value[key], false)
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`]
      })

    return `{${entries.join(",")}}`
  }

  if (inArray) {
    return "null"
  }

  return undefined
}

export const canonicalize = (obj: unknown): string => {
  const serialized = serialize(obj, false)

  if (serialized === undefined) {
    throw new TypeError("Cannot canonicalize unsupported root value")
  }

  return serialized
}
