import type { PwaRouteKey } from "./contracts"

export function getPwaRouteKeyForPathname(
  pathname: string | null | undefined
): PwaRouteKey | null {
  const normalized = pathname?.trim() || ""

  if (
    normalized === "/dashboard" ||
    normalized === "/" ||
    normalized.startsWith("/dashboard?")
  ) {
    return "dashboard"
  }

  if (normalized === "/activity" || normalized.startsWith("/activity?")) {
    return "activity"
  }

  if (normalized === "/review" || normalized.startsWith("/review?")) {
    return "review"
  }

  if (normalized === "/goals" || normalized.startsWith("/goals?")) {
    return "goals"
  }

  if (normalized === "/settings" || normalized.startsWith("/settings?")) {
    return "settings"
  }

  return null
}

export function isPwaCorePathname(pathname: string | null | undefined) {
  return getPwaRouteKeyForPathname(pathname) !== null
}
