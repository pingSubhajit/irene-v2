import {
  formatInUserTimeZone,
  getUserTimeZoneDateParts,
  getUtcEndOfUserDay,
  getUtcStartOfUserDay,
} from "@/lib/date-format"

export const GLOBAL_TIMEFRAME_QUERY_PARAM = "timeframe"
export const GLOBAL_TIMEFRAME_COOKIE_NAME = "irene-global-timeframe"

export const GLOBAL_TIMEFRAME_OPTIONS = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_three_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
] as const

export type GlobalTimeframe = (typeof GLOBAL_TIMEFRAME_OPTIONS)[number]["value"]

export type GlobalTimeframeRange = {
  timeframe: GlobalTimeframe
  label: string
  pageHeading: string
  localDateFrom: string
  localDateTo: string
  dateFrom: Date
  dateTo: Date
}

function requireDate(value: Date | null, label: string) {
  if (!value) {
    throw new Error(`Missing timeframe date for ${label}`)
  }

  return value
}

function shiftLocalDate(localDate: string, offsetDays: number) {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + offsetDays)

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate()
  ).padStart(2, "0")}`
}

export function resolveGlobalTimeframe(
  value: string | null | undefined
): GlobalTimeframe {
  switch (value) {
    case "this_week":
    case "this_month":
    case "last_three_months":
    case "this_year":
      return value
    default:
      return "this_month"
  }
}

export function mapLegacyDashboardRangeToGlobalTimeframe(
  value: string | null | undefined
): GlobalTimeframe | undefined {
  switch (value) {
    case "week":
      return "this_week"
    case "month":
      return "this_month"
    case "year":
      return "this_year"
    default:
      return undefined
  }
}

export function buildGlobalTimeframeRange(
  timeframe: GlobalTimeframe,
  timeZone: string,
  now = new Date()
): GlobalTimeframeRange {
  const todayParts = getUserTimeZoneDateParts(now, timeZone)
  const localDateTo = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
  const dateTo = requireDate(
    getUtcEndOfUserDay(localDateTo, timeZone),
    "dateTo"
  )

  if (timeframe === "this_year") {
    const localDateFrom = `${todayParts.year}-01-01`

    return {
      timeframe,
      label: "This year",
      pageHeading: "this year.",
      localDateFrom,
      localDateTo,
      dateFrom: requireDate(
        getUtcStartOfUserDay(localDateFrom, timeZone),
        "year dateFrom"
      ),
      dateTo,
    }
  }

  if (timeframe === "last_three_months") {
    const startMonthDate = new Date(
      Date.UTC(Number(todayParts.year), Number(todayParts.month) - 3, 1)
    )
    const startParts = getUserTimeZoneDateParts(startMonthDate, timeZone)
    const localDateFrom = `${startParts.year}-${startParts.month}-01`

    return {
      timeframe,
      label: "Last 3 months",
      pageHeading: "last three months.",
      localDateFrom,
      localDateTo,
      dateFrom: requireDate(
        getUtcStartOfUserDay(localDateFrom, timeZone),
        "quarter dateFrom"
      ),
      dateTo,
    }
  }

  if (timeframe === "this_week") {
    const weekday = new Date(
      Date.UTC(
        Number(todayParts.year),
        Number(todayParts.month) - 1,
        Number(todayParts.day)
      )
    ).getUTCDay()
    const daysSinceMonday = (weekday + 6) % 7
    const localDateFrom = shiftLocalDate(localDateTo, -daysSinceMonday)

    return {
      timeframe,
      label: "This week",
      pageHeading: "this week.",
      localDateFrom,
      localDateTo,
      dateFrom: requireDate(
        getUtcStartOfUserDay(localDateFrom, timeZone),
        "week dateFrom"
      ),
      dateTo,
    }
  }

  const localDateFrom = `${todayParts.year}-${todayParts.month}-01`

  return {
    timeframe,
    label: "This month",
    pageHeading: "this month.",
    localDateFrom,
    localDateTo,
    dateFrom: requireDate(
      getUtcStartOfUserDay(localDateFrom, timeZone),
      "month dateFrom"
    ),
    dateTo,
  }
}

export function formatGlobalTimeframeCaption(input: {
  label: string
  dateFrom: Date
  dateTo: Date
  timeZone: string
}) {
  const fromLabel = formatInUserTimeZone(input.dateFrom, input.timeZone, {
    month: "short",
    day: "numeric",
  })
  const toLabel = formatInUserTimeZone(input.dateTo, input.timeZone, {
    month: "short",
    day: "numeric",
  })

  return `${input.label} · ${fromLabel} to ${toLabel}`
}

export function appendGlobalTimeframeToHref(
  href: string,
  timeframe: GlobalTimeframe
) {
  const [pathWithQuery = "", hash = ""] = href.split("#")
  const [pathname = "", search = ""] = pathWithQuery.split("?")
  const searchParams = new URLSearchParams(search)

  searchParams.set(GLOBAL_TIMEFRAME_QUERY_PARAM, timeframe)

  const serialized = searchParams.toString()
  const nextHref = serialized ? `${pathname}?${serialized}` : pathname

  return hash ? `${nextHref}#${hash}` : nextHref
}
