function normalizeWhitespace(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const normalized = input.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
}

const descriptorCutoffPatterns = [
  /\bthe available credit limit\b/i,
  /\bavailable credit limit\b/i,
  /\bavailable balance\b/i,
  /\bin case you have not\b/i,
  /\bif you have not\b/i,
  /\bif this transaction\b/i,
  /\bfor details\b/i,
  /\bcall on\b/i,
  /\bplease click\b/i,
  /\bkindly click\b/i,
  /\bto report it\b/i,
  /\bcustomer care\b/i,
  /\bdear customer\b/i,
  /\bhttps?:\/\//i,
]

const trailingNoiseTokens = new Set([
  "and",
  "commerce",
  "credit",
  "digital",
  "india",
  "limit",
  "limited",
  "ltd",
  "online",
  "payment",
  "payments",
  "private",
  "pvt",
  "retail",
  "service",
  "services",
  "solution",
  "solutions",
  "syste",
  "system",
  "systems",
  "technolog",
  "technologies",
  "technology",
  "the",
])

function titleCaseToken(token: string) {
  if (token.length === 0) {
    return token
  }

  if (/^[A-Z0-9&/-]+$/.test(token)) {
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  }

  return token.charAt(0).toUpperCase() + token.slice(1)
}

export function sanitizeMerchantDescriptorText(input: string | null | undefined) {
  const normalized = normalizeWhitespace(input)
  if (!normalized) {
    return null
  }

  let cutoffIndex = normalized.length

  for (const pattern of descriptorCutoffPatterns) {
    const match = pattern.exec(normalized)
    if (typeof match?.index === "number") {
      cutoffIndex = Math.min(cutoffIndex, match.index)
    }
  }

  const trimmed = normalized
    .slice(0, cutoffIndex)
    .replace(/\s*(?:\[.*|\(.*)?$/, "")
    .replace(/[.,:;/-]+$/g, "")
    .trim()

  return trimmed.length > 0 ? trimmed : null
}

export function deriveMerchantDisplayName(input: string | null | undefined) {
  const sanitized = sanitizeMerchantDescriptorText(input)
  if (!sanitized) {
    return null
  }

  const tokens = sanitized
    .replace(/[*_/]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9.&/-]+$/gi, ""))
    .filter(Boolean)

  const cutoffTokenIndex = tokens.findIndex((token) =>
    /^(?:transaction|txn|available|credit|balance|limit|used|charged|call|please|dear|report|customer|click|http|https)$/i.test(
      token,
    ),
  )

  const trimmedTokens =
    cutoffTokenIndex === -1 ? [...tokens] : tokens.slice(0, cutoffTokenIndex)

  while (trimmedTokens.length > 1) {
    const lastToken = trimmedTokens[trimmedTokens.length - 1]
    if (!lastToken) {
      trimmedTokens.pop()
      continue
    }

    const lowered = lastToken.toLowerCase()

    if (
      trailingNoiseTokens.has(lowered) ||
      /^[0-9]+$/.test(lowered) ||
      /^[a-z]{1,2}$/.test(lowered)
    ) {
      trimmedTokens.pop()
      continue
    }

    break
  }

  const limitedTokens = trimmedTokens.slice(0, 4)
  if (limitedTokens.length === 0) {
    return null
  }

  return limitedTokens.map(titleCaseToken).join(" ")
}
