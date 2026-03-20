const DEFAULT_LOCALE = "en-IN"
const DEFAULT_TIME_ZONE = "Asia/Kolkata"

export function resolveUserTimeZone(timeZone: string | null | undefined) {
  return timeZone || DEFAULT_TIME_ZONE
}

export function formatInUserTimeZone(
  value: Date,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    ...options,
    timeZone: resolveUserTimeZone(timeZone),
  }).format(value)
}

export function getUserTimeZoneDateParts(
  value: Date,
  timeZone: string | null | undefined,
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveUserTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const parts = formatter.formatToParts(value)
  const byType = new Map(parts.map((part) => [part.type, part.value]))

  return {
    year: byType.get("year") ?? "0000",
    month: byType.get("month") ?? "01",
    day: byType.get("day") ?? "01",
  }
}

export function getUserTimeZoneMonthKey(
  value: Date,
  timeZone: string | null | undefined,
) {
  const parts = getUserTimeZoneDateParts(value, timeZone)
  return `${parts.year}-${parts.month}`
}

export function getUserTimeZoneDayOfMonth(
  value: Date,
  timeZone: string | null | undefined,
) {
  return Number(getUserTimeZoneDateParts(value, timeZone).day)
}
