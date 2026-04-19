// Merkle helpers build SHA-256 trees from trace hashes and emit directional proofs. Directional
// proof entries keep verification deterministic when a leaf sits on either side of a pair.
import { createHash, timingSafeEqual } from "node:crypto"

const HEX_32_BYTE_PATTERN = /^[0-9a-f]{64}$/iu

const EMPTY_ROOT = createHash("sha256").update("").digest("hex")

const normalizeHash = (hash: string): string => {
  const normalized = hash.startsWith("0x") ? hash.slice(2) : hash

  if (!HEX_32_BYTE_PATTERN.test(normalized)) {
    throw new TypeError("Merkle leaves and nodes must be 32-byte hex strings")
  }

  return normalized.toLowerCase()
}

const toBuffer = (hash: string): Buffer => Buffer.from(normalizeHash(hash), "hex")

const hashPair = (left: string, right: string): string =>
  createHash("sha256")
    .update(Buffer.concat([toBuffer(left), toBuffer(right)]))
    .digest("hex")

const buildNextLayer = (layer: readonly string[]): string[] => {
  const nextLayer: string[] = []

  for (let index = 0; index < layer.length; index += 2) {
    const left = layer[index]
    const right = layer[index + 1] ?? left

    if (left === undefined || right === undefined) {
      throw new Error("Unexpected empty Merkle pair")
    }

    nextLayer.push(hashPair(left, right))
  }

  return nextLayer
}

const constantTimeEqualHex = (left: string, right: string): boolean => {
  try {
    return timingSafeEqual(toBuffer(left), toBuffer(right))
  } catch {
    return false
  }
}

export const buildMerkleTree = (hashes: string[]): string[][] => {
  if (hashes.length === 0) {
    return [[]]
  }

  const tree: string[][] = [hashes.map(normalizeHash)]

  while (tree[tree.length - 1]?.length !== 1) {
    const currentLayer = tree[tree.length - 1]

    if (currentLayer === undefined) {
      throw new Error("Merkle tree has no current layer")
    }

    tree.push(buildNextLayer(currentLayer))
  }

  return tree
}

export const getMerkleRoot = (hashes: string[]): string => {
  if (hashes.length === 0) {
    return EMPTY_ROOT
  }

  const tree = buildMerkleTree(hashes)
  const rootLayer = tree[tree.length - 1]
  const root = rootLayer?.[0]

  if (root === undefined) {
    throw new Error("Merkle tree root is missing")
  }

  return root
}

export const getMerkleProof = (hashes: string[], index: number): string[] => {
  if (!Number.isInteger(index) || index < 0 || index >= hashes.length) {
    throw new RangeError("Merkle proof index is out of bounds")
  }

  const tree = buildMerkleTree(hashes)
  const proof: string[] = []
  let currentIndex = index

  for (let layerIndex = 0; layerIndex < tree.length - 1; layerIndex += 1) {
    const layer = tree[layerIndex]

    if (layer === undefined) {
      throw new Error("Merkle proof layer is missing")
    }

    const isRightNode = currentIndex % 2 === 1
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1
    const sibling = layer[siblingIndex] ?? layer[currentIndex]

    if (sibling === undefined) {
      throw new Error("Merkle proof sibling is missing")
    }

    proof.push(`${isRightNode ? "left" : "right"}:${sibling}`)
    currentIndex = Math.floor(currentIndex / 2)
  }

  return proof
}

export const verifyMerkleProof = (leaf: string, proof: string[], root: string): boolean => {
  let computed = normalizeHash(leaf)

  for (const entry of proof) {
    const separatorIndex = entry.indexOf(":")

    if (separatorIndex === -1) {
      return false
    }

    const direction = entry.slice(0, separatorIndex)
    const sibling = entry.slice(separatorIndex + 1)

    if (direction === "left") {
      computed = hashPair(sibling, computed)
      continue
    }

    if (direction === "right") {
      computed = hashPair(computed, sibling)
      continue
    }

    return false
  }

  return constantTimeEqualHex(computed, root)
}
