// Canonical JSON tests protect the stable serialization contract used before hashing. These
// cases cover sorted keys, Date/bigint normalization, and JSON-compatible undefined handling.
import { describe, expect, it } from "vitest"
import { canonicalize } from "../src/canonical-json.js"

describe("canonicalize", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalize({ z: 1, a: { c: true, b: "two" } })).toBe(
      '{"a":{"b":"two","c":true},"z":1}',
    )
  })

  it("serializes dates and bigint values predictably", () => {
    expect(canonicalize({ at: new Date("2026-04-19T12:00:00.000Z"), lamports: 10n })).toBe(
      '{"at":"2026-04-19T12:00:00.000Z","lamports":"10"}',
    )
  })

  it("omits undefined object values and converts undefined array values to null", () => {
    expect(canonicalize({ keep: [1, undefined, 3], skip: undefined })).toBe('{"keep":[1,null,3]}')
  })

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ bad: Number.NaN })).toThrow("non-finite")
  })
})
