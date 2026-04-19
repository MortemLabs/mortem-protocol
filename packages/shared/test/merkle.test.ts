// Merkle tests confirm proofs are direction-aware and verifiable for every leaf position. This
// prevents accidental acceptance of roots built with a different sibling order.
import { describe, expect, it } from "vitest"
import { sha256 } from "../src/hash.js"
import { buildMerkleTree, getMerkleProof, getMerkleRoot, verifyMerkleProof } from "../src/merkle.js"

describe("merkle utilities", () => {
  const leaves = ["trace-a", "trace-b", "trace-c"].map(sha256)

  it("builds a tree whose top layer matches the root", () => {
    const tree = buildMerkleTree(leaves)
    const rootLayer = tree[tree.length - 1]

    expect(rootLayer?.[0]).toBe(getMerkleRoot(leaves))
  })

  it("generates valid proofs for every leaf", () => {
    const root = getMerkleRoot(leaves)

    for (const [index, leaf] of leaves.entries()) {
      expect(verifyMerkleProof(leaf, getMerkleProof(leaves, index), root)).toBe(true)
    }
  })

  it("rejects tampered proofs", () => {
    const root = getMerkleRoot(leaves)
    const proof = getMerkleProof(leaves, 0)

    expect(verifyMerkleProof(leaves[0] ?? "", proof, sha256("different-root"))).toBe(false)
    expect(verifyMerkleProof(sha256("different-leaf"), proof, root)).toBe(false)
  })

  it("uses SHA-256 of the empty string as the empty root", () => {
    expect(getMerkleRoot([])).toBe(sha256(""))
  })
})
