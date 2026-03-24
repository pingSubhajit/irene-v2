import type { Metadata } from "next"

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
  null

const normalizedSiteUrl = rawSiteUrl
  ? rawSiteUrl.startsWith("http")
    ? rawSiteUrl
    : `https://${rawSiteUrl}`
  : null

export const metadataBase = normalizedSiteUrl ? new URL(normalizedSiteUrl) : undefined

const privateRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
}

function formatTitle(title: string) {
  return title === "Irene" ? title : `${title} | Irene`
}

export const rootMetadata: Metadata = {
  metadataBase,
  applicationName: "Irene",
  title: "Irene",
  description: "Calm money clarity from your inbox.",
}

export const authenticatedAppMetadata: Metadata = {
  robots: privateRobots,
}

export function createPublicMetadata(input: {
  title: string
  description: string
  path?: string
}): Metadata {
  const title = formatTitle(input.title)

  return {
    title,
    description: input.description,
    alternates:
      metadataBase && input.path
        ? {
            canonical: input.path,
          }
        : undefined,
    openGraph:
      metadataBase && input.path
        ? {
            type: "website",
            locale: "en_US",
            siteName: "Irene",
            title,
            description: input.description,
            url: input.path,
          }
        : undefined,
    twitter: {
      card: "summary",
      title,
      description: input.description,
    },
  }
}

export function createPrivateMetadata(input: {
  title: string
  description: string
}): Metadata {
  return {
    title: formatTitle(input.title),
    description: input.description,
    robots: privateRobots,
  }
}
