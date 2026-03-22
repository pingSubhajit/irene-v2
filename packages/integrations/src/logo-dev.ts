import { getAiEnv } from "@workspace/config/server"
import { z } from "zod"

function normalizeBrandName(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

const logoDotDevSearchResultSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
})

function toTitleCase(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function stripBrandNoise(input: string) {
  return input
    .replace(/\.(?:com|in|co|io|ai|app|net|org)\b/gi, " ")
    .replace(/\b(india|global|intl|international|technologies|technology|systems|services|service|payments|pay|private|pvt|ltd|limited|inc|llc|corp|corporation)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildFallbackBrandResults(query: string) {
  const normalizedQuery = normalizeBrandName(query)
  const strippedQuery = stripBrandNoise(normalizedQuery)
  const candidates = [normalizedQuery, strippedQuery]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4)

  return candidates.map((candidate) => ({
    name: toTitleCase(candidate),
    domain: null,
    logoUrl: buildLogoDotDevBrandLogoUrl(candidate),
  }))
}

export function buildLogoDotDevBrandLogoUrl(brandName: string | null | undefined) {
  const normalizedBrandName = brandName ? normalizeBrandName(brandName) : null

  if (!normalizedBrandName) {
    return null
  }

  const { NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY } = getAiEnv()
  const baseUrl = `https://img.logo.dev/name/${encodeURIComponent(normalizedBrandName)}`
  const searchParams = new URLSearchParams({
    token: NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY,
  })

  return `${baseUrl}?${searchParams.toString()}`
}

export function buildLogoDotDevDomainLogoUrl(domain: string | null | undefined) {
  const normalizedDomain = domain?.trim().toLowerCase() ?? null

  if (!normalizedDomain) {
    return null
  }

  const { NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY } = getAiEnv()
  const baseUrl = `https://img.logo.dev/${encodeURIComponent(normalizedDomain)}`
  const searchParams = new URLSearchParams({
    token: NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY,
  })

  return `${baseUrl}?${searchParams.toString()}`
}

export async function searchLogoDotDevBrands(query: string) {
  const normalizedQuery = normalizeBrandName(query)

  if (!normalizedQuery) {
    return []
  }

  const { LOGO_DOT_DEV_SECRET_KEY } = getAiEnv()

  if (!LOGO_DOT_DEV_SECRET_KEY.startsWith("sk_")) {
    return buildFallbackBrandResults(normalizedQuery)
  }

  const searchParams = new URLSearchParams({
    q: normalizedQuery,
    strategy: "suggest",
  })

  const response = await fetch(`https://api.logo.dev/search?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${LOGO_DOT_DEV_SECRET_KEY}`,
    },
    cache: "no-store",
  })

  if (response.status === 401 || response.status === 403) {
    return buildFallbackBrandResults(normalizedQuery)
  }

  if (!response.ok) {
    throw new Error(`Logo.dev search failed with status ${response.status}`)
  }

  const payload = await response.json()
  const parsed = z.array(logoDotDevSearchResultSchema).parse(payload)

  return parsed.map((result) => ({
    name: result.name,
    domain: result.domain,
    logoUrl: buildLogoDotDevDomainLogoUrl(result.domain),
  }))
}

export async function resolveLogoDotDevBrandLogoUrl(
  brandName: string | null | undefined,
) {
  const normalizedBrandName = brandName ? normalizeBrandName(brandName) : null

  if (!normalizedBrandName) {
    return null
  }

  try {
    const results = await searchLogoDotDevBrands(normalizedBrandName)
    const bestLogoUrl = results.find((result) => result.logoUrl)?.logoUrl ?? null

    if (bestLogoUrl) {
      return bestLogoUrl
    }
  } catch {
    // Fall back to the direct brand endpoint if search is unavailable.
  }

  return buildLogoDotDevBrandLogoUrl(normalizedBrandName)
}
