const DEFAULT_LOCALE = "en-IN"
const DEFAULT_TIME_ZONE = "Asia/Kolkata"

export type ResetBackfillPreset =
  | "last_24_hours"
  | "last_3_days"
  | "last_week"
  | "last_2_weeks"
  | "last_month"
  | "last_quarter"

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

function getTimeZoneOffsetMilliseconds(
  value: Date,
  timeZone: string | null | undefined,
) {
  const resolvedTimeZone = resolveUserTimeZone(timeZone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(value)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  const zonedTimestamp = Date.UTC(
    Number(byType.get("year") ?? "0"),
    Number(byType.get("month") ?? "1") - 1,
    Number(byType.get("day") ?? "1"),
    Number(byType.get("hour") ?? "0"),
    Number(byType.get("minute") ?? "0"),
    Number(byType.get("second") ?? "0"),
  )

  return zonedTimestamp - value.getTime()
}

function getUtcDateForTimeZoneParts(input: {
  timeZone: string | null | undefined
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
  millisecond?: number
}) {
  const utcGuess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour ?? 0,
    input.minute ?? 0,
    input.second ?? 0,
    input.millisecond ?? 0,
  )
  const offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), input.timeZone)

  return new Date(utcGuess - offset)
}

export function parseUserLocalDateTime(
  localDateTime: string,
  timeZone: string | null | undefined,
) {
  const match = localDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  )

  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match

  return getUtcDateForTimeZoneParts({
    timeZone,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? "0"),
    millisecond: 0,
  })
}

export function getUtcStartOfUserDay(
  localDate: string,
  timeZone: string | null | undefined,
) {
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  return getUtcDateForTimeZoneParts({
    timeZone,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  })
}

export function getUtcEndOfUserDay(
  localDate: string,
  timeZone: string | null | undefined,
) {
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  return getUtcDateForTimeZoneParts({
    timeZone,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  })
}

export function getDateRangeForPreset(
  preset: "today" | "last_7_days" | "this_month" | "last_month",
  timeZone: string | null | undefined,
  now = new Date(),
) {
  const parts = getUserTimeZoneDateParts(now, timeZone)
  const currentYear = Number(parts.year)
  const currentMonth = Number(parts.month)

  if (preset === "today") {
    const localDate = `${parts.year}-${parts.month}-${parts.day}`
    return {
      dateFrom: getUtcStartOfUserDay(localDate, timeZone),
      dateTo: getUtcEndOfUserDay(localDate, timeZone),
    }
  }

  if (preset === "last_7_days") {
    const currentUtc = getUtcStartOfUserDay(
      `${parts.year}-${parts.month}-${parts.day}`,
      timeZone,
    )

    if (!currentUtc) {
      return { dateFrom: null, dateTo: null }
    }

    const start = new Date(currentUtc)
    start.setUTCDate(start.getUTCDate() - 6)

    const startParts = getUserTimeZoneDateParts(start, timeZone)
    const startLocalDate = `${startParts.year}-${startParts.month}-${startParts.day}`
    const endLocalDate = `${parts.year}-${parts.month}-${parts.day}`

    return {
      dateFrom: getUtcStartOfUserDay(startLocalDate, timeZone),
      dateTo: getUtcEndOfUserDay(endLocalDate, timeZone),
    }
  }

  if (preset === "this_month") {
    const from = getUtcStartOfUserDay(
      `${parts.year}-${parts.month}-01`,
      timeZone,
    )
    const to = getUtcEndOfUserDay(
      `${parts.year}-${parts.month}-${parts.day}`,
      timeZone,
    )

    return { dateFrom: from, dateTo: to }
  }

  const previousMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1))
  const previousMonthParts = getUserTimeZoneDateParts(previousMonthDate, timeZone)
  const previousMonthYear = Number(previousMonthParts.year)
  const previousMonth = Number(previousMonthParts.month)
  const lastDayOfPreviousMonth = new Date(
    Date.UTC(previousMonthYear, previousMonth, 0),
  ).getUTCDate()

  return {
    dateFrom: getUtcStartOfUserDay(
      `${previousMonthParts.year}-${previousMonthParts.month}-01`,
      timeZone,
    ),
    dateTo: getUtcEndOfUserDay(
      `${previousMonthParts.year}-${previousMonthParts.month}-${String(lastDayOfPreviousMonth).padStart(2, "0")}`,
      timeZone,
    ),
  }
}

const RESET_BACKFILL_PRESET_DURATIONS_MS: Record<ResetBackfillPreset, number> = {
  last_24_hours: 24 * 60 * 60 * 1000,
  last_3_days: 3 * 24 * 60 * 60 * 1000,
  last_week: 7 * 24 * 60 * 60 * 1000,
  last_2_weeks: 14 * 24 * 60 * 60 * 1000,
  last_month: 30 * 24 * 60 * 60 * 1000,
  last_quarter: 90 * 24 * 60 * 60 * 1000,
}

export function getDateRangeForResetBackfillPreset(
  preset: ResetBackfillPreset,
  _timeZone: string | null | undefined,
  now = new Date(),
) {
  const durationMs = RESET_BACKFILL_PRESET_DURATIONS_MS[preset]
  const dateTo = new Date(now)
  const dateFrom = new Date(now.getTime() - durationMs)

  return { dateFrom, dateTo }
}
