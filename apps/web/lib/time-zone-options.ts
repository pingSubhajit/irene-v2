const COMMON_TIME_ZONE_OPTIONS = [
  "Asia/Kolkata",
  "UTC",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const

export function isSupportedTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function getTimeZoneOptions(currentTimeZone?: string | null) {
  const options = new Set<string>()

  if (currentTimeZone && isSupportedTimeZone(currentTimeZone)) {
    options.add(currentTimeZone)
  }

  for (const timeZone of COMMON_TIME_ZONE_OPTIONS) {
    if (isSupportedTimeZone(timeZone)) {
      options.add(timeZone)
    }
  }

  return [...options]
}
