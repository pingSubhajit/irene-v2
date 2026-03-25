import { createHash } from "node:crypto"

function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry))
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, normalizeForHash(entry)]),
    )
  }

  return String(value)
}

export function stableStringifyForHash(value: unknown) {
  return JSON.stringify(normalizeForHash(value))
}

export function hashCanonicalJson(value: unknown) {
  return createHash("sha256").update(stableStringifyForHash(value)).digest("hex")
}
