import { createHash } from "node:crypto"

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm"
import {
  SYSTEM_CATEGORY_PRESENTATION,
  type CategoryColorToken,
  type CategoryIconName,
} from "@workspace/config"

import { db } from "./client"
import {
  categories,
  extractedSignals,
  financialEvents,
  financialEventSources,
  financialEventValuations,
  paymentProcessors,
  merchants,
  merchantAliases,
  paymentInstruments,
  rawDocuments,
  reviewQueueItems,
  type CategoryKind,
  type ExtractedSignalSelect,
  type FinancialEventDirection,
  type FinancialEventInsert,
  type FinancialEventStatus,
  type FinancialEventType,
  type MerchantType,
  type PaymentInstrumentType,
  type ReviewQueueItemSelect,
} from "./schema"

const SYSTEM_CATEGORY_DEFINITIONS: Array<{
  slug: string
  name: string
  kind: CategoryKind
  iconName: CategoryIconName
  colorToken: CategoryColorToken
}> = [
  {
    slug: "income",
    name: "Income",
    kind: "income",
    ...SYSTEM_CATEGORY_PRESENTATION.income,
  },
  {
    slug: "salary",
    name: "Salary",
    kind: "income",
    ...SYSTEM_CATEGORY_PRESENTATION.salary,
  },
  {
    slug: "shopping",
    name: "Shopping",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.shopping,
  },
  {
    slug: "food",
    name: "Food",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.food,
  },
  {
    slug: "transport",
    name: "Transport",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.transport,
  },
  {
    slug: "subscriptions",
    name: "Subscriptions",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.subscriptions,
  },
  {
    slug: "bills",
    name: "Bills",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.bills,
  },
  {
    slug: "gaming",
    name: "Gaming",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.gaming,
  },
  {
    slug: "software",
    name: "Software",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.software,
  },
  {
    slug: "digital_goods",
    name: "Digital Goods",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.digital_goods,
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.entertainment,
  },
  {
    slug: "travel",
    name: "Travel",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.travel,
  },
  {
    slug: "utilities",
    name: "Utilities",
    kind: "expense",
    ...SYSTEM_CATEGORY_PRESENTATION.utilities,
  },
  {
    slug: "debt",
    name: "Debt",
    kind: "debt",
    ...SYSTEM_CATEGORY_PRESENTATION.debt,
  },
  {
    slug: "transfers",
    name: "Transfers",
    kind: "transfer",
    ...SYSTEM_CATEGORY_PRESENTATION.transfers,
  },
  {
    slug: "refunds",
    name: "Refunds",
    kind: "refund",
    ...SYSTEM_CATEGORY_PRESENTATION.refunds,
  },
  {
    slug: "uncategorized",
    name: "Uncategorized",
    kind: "uncategorized",
    ...SYSTEM_CATEGORY_PRESENTATION.uncategorized,
  },
]

function resolveUserTimeZone(timeZone: string | null | undefined) {
  return timeZone || "Asia/Kolkata"
}

function getUserTimeZoneDateParts(
  value: Date,
  timeZone: string | null | undefined
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

function getUserTimeZoneMonthKey(
  value: Date,
  timeZone: string | null | undefined
) {
  const parts = getUserTimeZoneDateParts(value, timeZone)
  return `${parts.year}-${parts.month}`
}

function getUserTimeZoneDayOfMonth(
  value: Date,
  timeZone: string | null | undefined
) {
  return Number(getUserTimeZoneDateParts(value, timeZone).day)
}

function getTimeZoneOffsetMilliseconds(
  value: Date,
  timeZone: string | null | undefined
) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveUserTimeZone(timeZone),
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
    Number(byType.get("second") ?? "0")
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
    input.millisecond ?? 0
  )
  const offset = getTimeZoneOffsetMilliseconds(
    new Date(utcGuess),
    input.timeZone
  )

  return new Date(utcGuess - offset)
}

function getUtcStartOfUserDay(
  localDate: string,
  timeZone: string | null | undefined
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

function getUtcEndOfUserDay(
  localDate: string,
  timeZone: string | null | undefined
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

function getComparableAmountExpression(reportingCurrency?: string) {
  if (!reportingCurrency) {
    return sql<number>`${financialEvents.amountMinor}`
  }

  return sql<number>`case
    when ${financialEvents.currency} = ${reportingCurrency}
      then ${financialEvents.amountMinor}
    else ${financialEventValuations.normalizedAmountMinor}
  end`
}

function buildMonthDateRange(
  monthKey: string,
  timeZone: string | null | undefined
) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)

  if (!match) {
    return null
  }

  const [, year, month] = match
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const lastDay = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate()

  return {
    dateFrom: getUtcStartOfUserDay(`${year}-${month}-01`, timeZone),
    dateTo: getUtcEndOfUserDay(
      `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
      timeZone
    ),
  }
}

function buildWeekBucketsForMonth(input: {
  monthKey: string
  timeZone: string | null | undefined
}) {
  const match = input.monthKey.match(/^(\d{4})-(\d{2})$/)

  if (!match) {
    return []
  }

  const [, year, month] = match
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const lastDay = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate()
  const weekRanges = [
    { week: 1 as const, startDay: 1, endDay: Math.min(7, lastDay) },
    { week: 2 as const, startDay: 8, endDay: Math.min(14, lastDay) },
    { week: 3 as const, startDay: 15, endDay: Math.min(21, lastDay) },
    { week: 4 as const, startDay: 22, endDay: lastDay },
  ]

  return weekRanges
    .filter((range) => range.startDay <= lastDay)
    .map((range) => {
      const dateFrom = getUtcStartOfUserDay(
        `${year}-${month}-${String(range.startDay).padStart(2, "0")}`,
        input.timeZone
      )
      const dateTo = getUtcEndOfUserDay(
        `${year}-${month}-${String(range.endDay).padStart(2, "0")}`,
        input.timeZone
      )

      return {
        key: `week-${range.week}`,
        week: range.week,
        label: `W${range.week}`,
        dateFrom,
        dateTo,
      }
    })
}

type DetailRangePreset =
  | "this_week"
  | "this_month"
  | "last_three_months"
  | "this_year"

type DetailRangeBucket = {
  key: string
  label: string
  totalMinor: number
  transactionCount: number
}

function getUserTimeZoneLocalDate(
  value: Date,
  timeZone: string | null | undefined
) {
  const parts = getUserTimeZoneDateParts(value, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftLocalDate(localDate: string, offsetDays: number) {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + offsetDays)

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(value.getUTCDate()).padStart(2, "0")}`
}

function formatRangeMonthLabel(monthKey: string) {
  const [year = "0000", month = "01"] = monthKey.split("-")
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, 15))
  return value.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()
}

function formatRangeDayLabel(localDate: string) {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()
}

function buildRangeBucketsForPreset(input: {
  rangePreset: DetailRangePreset
  timeZone: string | null | undefined
  periodDateFrom: Date
  periodDateTo: Date
  rows: Array<{
    eventOccurredAt: Date
    amountMinor: number | null
  }>
}) {
  const periodRows = input.rows.filter(
    (row) =>
      row.eventOccurredAt >= input.periodDateFrom &&
      row.eventOccurredAt <= input.periodDateTo
  )

  if (input.rangePreset === "this_week") {
    const buckets: DetailRangeBucket[] = []

    for (
      let localDate = getUserTimeZoneLocalDate(
        input.periodDateFrom,
        input.timeZone
      );
      localDate <= getUserTimeZoneLocalDate(input.periodDateTo, input.timeZone);
      localDate = shiftLocalDate(localDate, 1)
    ) {
      const rows = periodRows.filter(
        (row) =>
          getUserTimeZoneLocalDate(row.eventOccurredAt, input.timeZone) ===
          localDate
      )

      buckets.push({
        key: localDate,
        label: formatRangeDayLabel(localDate),
        totalMinor: rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
        transactionCount: rows.length,
      })
    }

    return buckets
  }

  if (input.rangePreset === "this_month") {
    const monthKey = getUserTimeZoneMonthKey(
      input.periodDateFrom,
      input.timeZone
    )

    return buildWeekBucketsForMonth({
      monthKey,
      timeZone: input.timeZone,
    }).map((bucket) => {
      const rows = periodRows.filter((row) => {
        const day = getUserTimeZoneDayOfMonth(
          row.eventOccurredAt,
          input.timeZone
        )

        if (bucket.week === 1) return day >= 1 && day <= 7
        if (bucket.week === 2) return day >= 8 && day <= 14
        if (bucket.week === 3) return day >= 15 && day <= 21
        return day >= 22
      })

      return {
        key: bucket.key,
        label: bucket.label,
        totalMinor: rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
        transactionCount: rows.length,
      }
    })
  }

  const startParts = getUserTimeZoneDateParts(
    input.periodDateFrom,
    input.timeZone
  )
  const endParts = getUserTimeZoneDateParts(input.periodDateTo, input.timeZone)
  const monthCount =
    (Number(endParts.year) - Number(startParts.year)) * 12 +
    (Number(endParts.month) - Number(startParts.month)) +
    1

  return Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(
        Number(startParts.year),
        Number(startParts.month) - 1 + index,
        15
      )
    )
    const monthKey = getUserTimeZoneMonthKey(monthDate, input.timeZone)
    const rows = periodRows.filter(
      (row) =>
        getUserTimeZoneMonthKey(row.eventOccurredAt, input.timeZone) ===
        monthKey
    )

    return {
      key: monthKey,
      label: formatRangeMonthLabel(monthKey),
      totalMinor: rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
      transactionCount: rows.length,
    }
  })
}

type CategoryDetailMerchantRow = {
  merchantId: string | null
  merchantName: string
  merchantLogoUrl: string | null
  spendMinor: number
  transactionCount: number
  shareOfCategorySpend: number
}

type CategoryDetailTransactionRow =
  Awaited<ReturnType<typeof db.select>> extends never
    ? never
    : {
        event: typeof financialEvents.$inferSelect
        merchant: typeof merchants.$inferSelect | null
        category: typeof categories.$inferSelect | null
        paymentInstrument: typeof paymentInstruments.$inferSelect | null
        paymentProcessor: typeof paymentProcessors.$inferSelect | null
        reportingAmountMinor: number | null
      }

type MerchantDetailCategoryRow = {
  categoryId: string | null
  categoryName: string
  categorySlug: string | null
  categoryIconName: CategoryIconName | null
  categoryColorToken: CategoryColorToken | null
  spendMinor: number
  transactionCount: number
  shareOfMerchantSpend: number
}

type MerchantDetailTransactionRow = CategoryDetailTransactionRow

export async function getCategoryDetailForUser(input: {
  userId: string
  categoryId: string
  reportingCurrency: string
  timeZone: string
  dateFrom?: Date | null
  dateTo?: Date | null
  rangePreset?: DetailRangePreset
  monthKey?: string | null
  week?: number | null
  recentTransactionsLimit?: number
  topMerchantsLimit?: number
}) {
  const category = await getCategoryById(input.userId, input.categoryId)

  if (!category) {
    return null
  }

  const outflowBaseConditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.categoryId, input.categoryId),
    inArray(financialEvents.status, ["confirmed", "needs_review"]),
    eq(financialEvents.direction, "outflow"),
    eq(financialEvents.isTransfer, false),
  ]

  const comparableAmountExpression = getComparableAmountExpression(
    input.reportingCurrency
  )

  const monthBucketRows = await db
    .select({
      eventOccurredAt: financialEvents.eventOccurredAt,
      amountMinor: comparableAmountExpression.mapWith(Number),
    })
    .from(financialEvents)
    .leftJoin(
      financialEventValuations,
      and(
        eq(financialEventValuations.financialEventId, financialEvents.id),
        eq(financialEventValuations.targetCurrency, input.reportingCurrency),
        isNull(financialEventValuations.supersededAt)
      )
    )
    .where(and(...outflowBaseConditions))
    .orderBy(desc(financialEvents.eventOccurredAt))

  const monthBucketMap = new Map<
    string,
    {
      monthKey: string
      totalMinor: number
      transactionCount: number
    }
  >()

  for (const row of monthBucketRows) {
    const monthKey = getUserTimeZoneMonthKey(
      row.eventOccurredAt,
      input.timeZone
    )
    const existing = monthBucketMap.get(monthKey)

    if (existing) {
      existing.totalMinor += row.amountMinor ?? 0
      existing.transactionCount += 1
      continue
    }

    monthBucketMap.set(monthKey, {
      monthKey,
      totalMinor: row.amountMinor ?? 0,
      transactionCount: 1,
    })
  }

  const normalizedMonthBuckets = [...monthBucketMap.values()]
    .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
    .slice(0, 4)
    .map((bucket) => ({
      ...bucket,
      key: bucket.monthKey,
      label: bucket.monthKey,
    }))

  let mode: "month" | "week" | "range" =
    normalizedMonthBuckets.length >= 4 ? "month" : "week"
  const currentMonthKey = getUserTimeZoneMonthKey(new Date(), input.timeZone)

  let selectedMonthKey: string | null = null
  let selectedWeek: 1 | 2 | 3 | 4 | null = null
  let periodDateFrom: Date | null = null
  let periodDateTo: Date | null = null
  let rangeBuckets: DetailRangeBucket[] = []
  let weekBuckets: Array<{
    key: string
    week: 1 | 2 | 3 | 4
    label: string
    dateFrom: Date | null
    dateTo: Date | null
    totalMinor: number
    transactionCount: number
  }> = []

  if (input.dateFrom && input.dateTo) {
    mode = "range"
    periodDateFrom = input.dateFrom
    periodDateTo = input.dateTo
    rangeBuckets = buildRangeBucketsForPreset({
      rangePreset: input.rangePreset ?? "this_month",
      timeZone: input.timeZone,
      periodDateFrom: input.dateFrom,
      periodDateTo: input.dateTo,
      rows: monthBucketRows,
    })
  } else if (mode === "month") {
    selectedMonthKey =
      input.monthKey &&
      normalizedMonthBuckets.some(
        (bucket) => bucket.monthKey === input.monthKey
      )
        ? input.monthKey
        : (normalizedMonthBuckets[0]?.monthKey ?? null)

    const monthRange = selectedMonthKey
      ? buildMonthDateRange(selectedMonthKey, input.timeZone)
      : null

    periodDateFrom = monthRange?.dateFrom ?? null
    periodDateTo = monthRange?.dateTo ?? null
  } else {
    selectedMonthKey = currentMonthKey
    const currentMonthRange = buildMonthDateRange(
      currentMonthKey,
      input.timeZone
    )
    const currentMonthOutflowRows =
      currentMonthRange?.dateFrom && currentMonthRange.dateTo
        ? await db
            .select({
              eventOccurredAt: financialEvents.eventOccurredAt,
              amountMinor: comparableAmountExpression.mapWith(Number),
            })
            .from(financialEvents)
            .leftJoin(
              financialEventValuations,
              and(
                eq(
                  financialEventValuations.financialEventId,
                  financialEvents.id
                ),
                eq(
                  financialEventValuations.targetCurrency,
                  input.reportingCurrency
                ),
                isNull(financialEventValuations.supersededAt)
              )
            )
            .where(
              and(
                ...outflowBaseConditions,
                gte(
                  financialEvents.eventOccurredAt,
                  currentMonthRange.dateFrom
                ),
                lte(financialEvents.eventOccurredAt, currentMonthRange.dateTo)
              )
            )
        : []

    weekBuckets = buildWeekBucketsForMonth({
      monthKey: currentMonthKey,
      timeZone: input.timeZone,
    }).map((bucket) => {
      const rows = currentMonthOutflowRows.filter((row) => {
        const day = getUserTimeZoneDayOfMonth(
          row.eventOccurredAt,
          input.timeZone
        )

        if (bucket.week === 1) return day >= 1 && day <= 7
        if (bucket.week === 2) return day >= 8 && day <= 14
        if (bucket.week === 3) return day >= 15 && day <= 21
        return day >= 22
      })

      return {
        ...bucket,
        totalMinor: rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
        transactionCount: rows.length,
      }
    })

    const preferredWeek =
      input.week && weekBuckets.some((bucket) => bucket.week === input.week)
        ? input.week
        : null
    const currentWeek = (() => {
      const day = getUserTimeZoneDayOfMonth(new Date(), input.timeZone)
      if (day <= 7) return 1
      if (day <= 14) return 2
      if (day <= 21) return 3
      return 4
    })()
    const currentWeekWithActivity = weekBuckets.find(
      (bucket) => bucket.week === currentWeek && bucket.transactionCount > 0
    )
    const latestWeekWithActivity = [...weekBuckets]
      .reverse()
      .find((bucket) => bucket.transactionCount > 0)
    const resolvedWeek =
      preferredWeek ??
      currentWeekWithActivity?.week ??
      latestWeekWithActivity?.week ??
      weekBuckets[0]?.week ??
      1

    selectedWeek = resolvedWeek as 1 | 2 | 3 | 4
    const selectedBucket =
      weekBuckets.find((bucket) => bucket.week === resolvedWeek) ?? null
    periodDateFrom = selectedBucket?.dateFrom ?? null
    periodDateTo = selectedBucket?.dateTo ?? null
  }

  if (!periodDateFrom || !periodDateTo) {
    return {
      category,
      mode,
      monthBuckets: normalizedMonthBuckets,
      selectedMonthKey,
      selectedWeek,
      weekBuckets,
      rangeBuckets,
      summary: {
        totalOutflowMinor: 0,
        transactionCount: 0,
        averageTransactionMinor: 0,
        shareOfTotalOutflow: 0,
        topMerchantName: null,
      },
      topMerchants: [] as CategoryDetailMerchantRow[],
      recentTransactions: [] as CategoryDetailTransactionRow[],
    }
  }

  const periodConditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.categoryId, input.categoryId),
    inArray(financialEvents.status, ["confirmed", "needs_review"]),
    gte(financialEvents.eventOccurredAt, periodDateFrom),
    lte(financialEvents.eventOccurredAt, periodDateTo),
  ]

  const outflowPeriodConditions = [
    ...periodConditions,
    eq(financialEvents.direction, "outflow"),
    eq(financialEvents.isTransfer, false),
  ]

  const [
    periodSummaryRow,
    overallPeriodOutflowRow,
    topMerchantRows,
    recentTransactions,
  ] = await Promise.all([
    db
      .select({
        totalOutflowMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
        transactionCount: count(financialEvents.id).mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...outflowPeriodConditions))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        totalOutflowMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
      })
      .from(financialEvents)
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(
        and(
          eq(financialEvents.userId, input.userId),
          inArray(financialEvents.status, ["confirmed", "needs_review"]),
          eq(financialEvents.direction, "outflow"),
          eq(financialEvents.isTransfer, false),
          gte(financialEvents.eventOccurredAt, periodDateFrom),
          lte(financialEvents.eventOccurredAt, periodDateTo)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        merchantId: financialEvents.merchantId,
        merchantName: sql<string>`coalesce(${merchants.displayName}, 'Unmapped merchant')`,
        merchantLogoUrl: merchants.logoUrl,
        spendMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
        transactionCount: count(financialEvents.id).mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...outflowPeriodConditions))
      .groupBy(
        financialEvents.merchantId,
        merchants.displayName,
        merchants.logoUrl
      )
      .orderBy(
        desc(sql`coalesce(sum(${comparableAmountExpression}), 0)`),
        desc(count(financialEvents.id))
      )
      .limit(input.topMerchantsLimit ?? 5),
    db
      .select({
        event: financialEvents,
        merchant: merchants,
        category: categories,
        paymentInstrument: paymentInstruments,
        paymentProcessor: paymentProcessors,
        reportingAmountMinor: comparableAmountExpression.mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
      .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
      .leftJoin(
        paymentInstruments,
        eq(financialEvents.paymentInstrumentId, paymentInstruments.id)
      )
      .leftJoin(
        paymentProcessors,
        eq(financialEvents.paymentProcessorId, paymentProcessors.id)
      )
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...periodConditions))
      .orderBy(
        desc(financialEvents.eventOccurredAt),
        desc(financialEvents.createdAt)
      )
      .limit(input.recentTransactionsLimit ?? 10),
  ])

  const totalOutflowMinor = periodSummaryRow?.totalOutflowMinor ?? 0
  const transactionCount = periodSummaryRow?.transactionCount ?? 0
  const overallPeriodOutflowMinor =
    overallPeriodOutflowRow?.totalOutflowMinor ?? 0
  const averageTransactionMinor =
    transactionCount > 0 ? Math.round(totalOutflowMinor / transactionCount) : 0

  const topMerchants = topMerchantRows.map((row) => ({
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    merchantLogoUrl: row.merchantLogoUrl,
    spendMinor: row.spendMinor,
    transactionCount: row.transactionCount,
    shareOfCategorySpend:
      totalOutflowMinor > 0 ? row.spendMinor / totalOutflowMinor : 0,
  }))

  return {
    category,
    mode,
    monthBuckets: normalizedMonthBuckets,
    selectedMonthKey,
    selectedWeek,
    weekBuckets,
    rangeBuckets,
    summary: {
      totalOutflowMinor,
      transactionCount,
      averageTransactionMinor,
      shareOfTotalOutflow:
        overallPeriodOutflowMinor > 0
          ? totalOutflowMinor / overallPeriodOutflowMinor
          : 0,
      topMerchantName: topMerchants[0]?.merchantName ?? null,
    },
    topMerchants,
    recentTransactions,
  }
}

export async function getMerchantDetailForUser(input: {
  userId: string
  merchantId: string
  reportingCurrency: string
  timeZone: string
  dateFrom?: Date | null
  dateTo?: Date | null
  rangePreset?: DetailRangePreset
  monthKey?: string | null
  week?: number | null
  recentTransactionsLimit?: number
  topCategoriesLimit?: number
}) {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(
      and(
        eq(merchants.userId, input.userId),
        eq(merchants.id, input.merchantId)
      )
    )
    .limit(1)

  if (!merchant) {
    return null
  }

  const outflowBaseConditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.merchantId, input.merchantId),
    inArray(financialEvents.status, ["confirmed", "needs_review"]),
    eq(financialEvents.direction, "outflow"),
    eq(financialEvents.isTransfer, false),
  ]

  const comparableAmountExpression = getComparableAmountExpression(
    input.reportingCurrency
  )

  const monthBucketRows = await db
    .select({
      eventOccurredAt: financialEvents.eventOccurredAt,
      amountMinor: comparableAmountExpression.mapWith(Number),
    })
    .from(financialEvents)
    .leftJoin(
      financialEventValuations,
      and(
        eq(financialEventValuations.financialEventId, financialEvents.id),
        eq(financialEventValuations.targetCurrency, input.reportingCurrency),
        isNull(financialEventValuations.supersededAt)
      )
    )
    .where(and(...outflowBaseConditions))
    .orderBy(desc(financialEvents.eventOccurredAt))

  const monthBucketMap = new Map<
    string,
    {
      monthKey: string
      totalMinor: number
      transactionCount: number
    }
  >()

  for (const row of monthBucketRows) {
    const monthKey = getUserTimeZoneMonthKey(
      row.eventOccurredAt,
      input.timeZone
    )
    const existing = monthBucketMap.get(monthKey)

    if (existing) {
      existing.totalMinor += row.amountMinor ?? 0
      existing.transactionCount += 1
      continue
    }

    monthBucketMap.set(monthKey, {
      monthKey,
      totalMinor: row.amountMinor ?? 0,
      transactionCount: 1,
    })
  }

  const normalizedMonthBuckets = [...monthBucketMap.values()]
    .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
    .slice(0, 4)
    .map((bucket) => ({
      ...bucket,
      key: bucket.monthKey,
      label: bucket.monthKey,
    }))

  let mode: "month" | "week" | "range" =
    normalizedMonthBuckets.length >= 4 ? "month" : "week"
  const currentMonthKey = getUserTimeZoneMonthKey(new Date(), input.timeZone)

  let selectedMonthKey: string | null = null
  let selectedWeek: 1 | 2 | 3 | 4 | null = null
  let periodDateFrom: Date | null = null
  let periodDateTo: Date | null = null
  let rangeBuckets: DetailRangeBucket[] = []
  let weekBuckets: Array<{
    key: string
    week: 1 | 2 | 3 | 4
    label: string
    dateFrom: Date | null
    dateTo: Date | null
    totalMinor: number
    transactionCount: number
  }> = []

  if (input.dateFrom && input.dateTo) {
    mode = "range"
    periodDateFrom = input.dateFrom
    periodDateTo = input.dateTo
    rangeBuckets = buildRangeBucketsForPreset({
      rangePreset: input.rangePreset ?? "this_month",
      timeZone: input.timeZone,
      periodDateFrom: input.dateFrom,
      periodDateTo: input.dateTo,
      rows: monthBucketRows,
    })
  } else if (mode === "month") {
    selectedMonthKey =
      input.monthKey &&
      normalizedMonthBuckets.some(
        (bucket) => bucket.monthKey === input.monthKey
      )
        ? input.monthKey
        : (normalizedMonthBuckets[0]?.monthKey ?? null)

    const monthRange = selectedMonthKey
      ? buildMonthDateRange(selectedMonthKey, input.timeZone)
      : null

    periodDateFrom = monthRange?.dateFrom ?? null
    periodDateTo = monthRange?.dateTo ?? null
  } else {
    selectedMonthKey = currentMonthKey
    const currentMonthRange = buildMonthDateRange(
      currentMonthKey,
      input.timeZone
    )
    const currentMonthOutflowRows =
      currentMonthRange?.dateFrom && currentMonthRange.dateTo
        ? await db
            .select({
              eventOccurredAt: financialEvents.eventOccurredAt,
              amountMinor: comparableAmountExpression.mapWith(Number),
            })
            .from(financialEvents)
            .leftJoin(
              financialEventValuations,
              and(
                eq(
                  financialEventValuations.financialEventId,
                  financialEvents.id
                ),
                eq(
                  financialEventValuations.targetCurrency,
                  input.reportingCurrency
                ),
                isNull(financialEventValuations.supersededAt)
              )
            )
            .where(
              and(
                ...outflowBaseConditions,
                gte(
                  financialEvents.eventOccurredAt,
                  currentMonthRange.dateFrom
                ),
                lte(financialEvents.eventOccurredAt, currentMonthRange.dateTo)
              )
            )
        : []

    weekBuckets = buildWeekBucketsForMonth({
      monthKey: currentMonthKey,
      timeZone: input.timeZone,
    }).map((bucket) => {
      const rows = currentMonthOutflowRows.filter((row) => {
        const day = getUserTimeZoneDayOfMonth(
          row.eventOccurredAt,
          input.timeZone
        )

        if (bucket.week === 1) return day >= 1 && day <= 7
        if (bucket.week === 2) return day >= 8 && day <= 14
        if (bucket.week === 3) return day >= 15 && day <= 21
        return day >= 22
      })

      return {
        ...bucket,
        totalMinor: rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0),
        transactionCount: rows.length,
      }
    })

    const preferredWeek =
      input.week && weekBuckets.some((bucket) => bucket.week === input.week)
        ? input.week
        : null
    const currentWeek = (() => {
      const day = getUserTimeZoneDayOfMonth(new Date(), input.timeZone)
      if (day <= 7) return 1
      if (day <= 14) return 2
      if (day <= 21) return 3
      return 4
    })()
    const currentWeekWithActivity = weekBuckets.find(
      (bucket) => bucket.week === currentWeek && bucket.transactionCount > 0
    )
    const latestWeekWithActivity = [...weekBuckets]
      .reverse()
      .find((bucket) => bucket.transactionCount > 0)
    const resolvedWeek =
      preferredWeek ??
      currentWeekWithActivity?.week ??
      latestWeekWithActivity?.week ??
      weekBuckets[0]?.week ??
      1

    selectedWeek = resolvedWeek as 1 | 2 | 3 | 4
    const selectedBucket =
      weekBuckets.find((bucket) => bucket.week === resolvedWeek) ?? null
    periodDateFrom = selectedBucket?.dateFrom ?? null
    periodDateTo = selectedBucket?.dateTo ?? null
  }

  if (!periodDateFrom || !periodDateTo) {
    return {
      merchant,
      mode,
      monthBuckets: normalizedMonthBuckets,
      selectedMonthKey,
      selectedWeek,
      weekBuckets,
      rangeBuckets,
      summary: {
        totalOutflowMinor: 0,
        transactionCount: 0,
        averageTransactionMinor: 0,
        shareOfTotalOutflow: 0,
        topCategoryName: null,
        categoryCount: 0,
      },
      topCategories: [] as MerchantDetailCategoryRow[],
      recentTransactions: [] as MerchantDetailTransactionRow[],
    }
  }

  const periodConditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.merchantId, input.merchantId),
    inArray(financialEvents.status, ["confirmed", "needs_review"]),
    gte(financialEvents.eventOccurredAt, periodDateFrom),
    lte(financialEvents.eventOccurredAt, periodDateTo),
  ]

  const outflowPeriodConditions = [
    ...periodConditions,
    eq(financialEvents.direction, "outflow"),
    eq(financialEvents.isTransfer, false),
  ]

  const [
    periodSummaryRow,
    overallPeriodOutflowRow,
    topCategoryRows,
    recentTransactions,
  ] = await Promise.all([
    db
      .select({
        totalOutflowMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
        transactionCount: count(financialEvents.id).mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...outflowPeriodConditions))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        totalOutflowMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
      })
      .from(financialEvents)
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(
        and(
          eq(financialEvents.userId, input.userId),
          inArray(financialEvents.status, ["confirmed", "needs_review"]),
          eq(financialEvents.direction, "outflow"),
          eq(financialEvents.isTransfer, false),
          gte(financialEvents.eventOccurredAt, periodDateFrom),
          lte(financialEvents.eventOccurredAt, periodDateTo)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        categoryId: financialEvents.categoryId,
        categoryName: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
        categorySlug: categories.slug,
        categoryIconName: categories.iconName,
        categoryColorToken: categories.colorToken,
        spendMinor:
          sql<number>`coalesce(sum(${comparableAmountExpression}), 0)`.mapWith(
            Number
          ),
        transactionCount: count(financialEvents.id).mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...outflowPeriodConditions))
      .groupBy(
        financialEvents.categoryId,
        categories.name,
        categories.slug,
        categories.iconName,
        categories.colorToken
      )
      .orderBy(
        desc(sql`coalesce(sum(${comparableAmountExpression}), 0)`),
        desc(count(financialEvents.id))
      )
      .limit(input.topCategoriesLimit ?? 5),
    db
      .select({
        event: financialEvents,
        merchant: merchants,
        category: categories,
        paymentInstrument: paymentInstruments,
        paymentProcessor: paymentProcessors,
        reportingAmountMinor: comparableAmountExpression.mapWith(Number),
      })
      .from(financialEvents)
      .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
      .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
      .leftJoin(
        paymentInstruments,
        eq(financialEvents.paymentInstrumentId, paymentInstruments.id)
      )
      .leftJoin(
        paymentProcessors,
        eq(financialEvents.paymentProcessorId, paymentProcessors.id)
      )
      .leftJoin(
        financialEventValuations,
        and(
          eq(financialEventValuations.financialEventId, financialEvents.id),
          eq(financialEventValuations.targetCurrency, input.reportingCurrency),
          isNull(financialEventValuations.supersededAt)
        )
      )
      .where(and(...periodConditions))
      .orderBy(
        desc(financialEvents.eventOccurredAt),
        desc(financialEvents.createdAt)
      )
      .limit(input.recentTransactionsLimit ?? 10),
  ])

  const totalOutflowMinor = periodSummaryRow?.totalOutflowMinor ?? 0
  const transactionCount = periodSummaryRow?.transactionCount ?? 0
  const overallPeriodOutflowMinor =
    overallPeriodOutflowRow?.totalOutflowMinor ?? 0
  const averageTransactionMinor =
    transactionCount > 0 ? Math.round(totalOutflowMinor / transactionCount) : 0

  const topCategories = topCategoryRows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    categoryIconName: row.categoryIconName,
    categoryColorToken: row.categoryColorToken,
    spendMinor: row.spendMinor,
    transactionCount: row.transactionCount,
    shareOfMerchantSpend:
      totalOutflowMinor > 0 ? row.spendMinor / totalOutflowMinor : 0,
  }))

  return {
    merchant,
    mode,
    monthBuckets: normalizedMonthBuckets,
    selectedMonthKey,
    selectedWeek,
    weekBuckets,
    rangeBuckets,
    summary: {
      totalOutflowMinor,
      transactionCount,
      averageTransactionMinor,
      shareOfTotalOutflow:
        overallPeriodOutflowMinor > 0
          ? totalOutflowMinor / overallPeriodOutflowMinor
          : 0,
      topCategoryName: topCategories[0]?.categoryName ?? null,
      categoryCount: topCategories.length,
    },
    topCategories,
    recentTransactions,
  }
}

export function normalizeCategorySlug(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")

  return normalized.length > 0 ? normalized.slice(0, 64) : null
}

export function deriveCategoryKindForEventType(
  eventType: FinancialEventType
): CategoryKind {
  switch (eventType) {
    case "income":
      return "income"
    case "refund":
      return "refund"
    case "transfer":
      return "transfer"
    case "emi_payment":
      return "debt"
    case "purchase":
    case "subscription_charge":
    case "bill_payment":
      return "expense"
  }
}

export function normalizeMerchantName(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const withoutAngles = input.replace(/<[^>]*>/g, " ")
  const withoutQuotes = withoutAngles.replace(/["'`]/g, " ")
  const lowered = withoutQuotes.toLowerCase()
  const alphanumeric = lowered.replace(/[^a-z0-9]+/g, " ")
  const collapsed = alphanumeric.replace(/\s+/g, " ").trim()

  return collapsed.length > 1 ? collapsed : null
}

function hashAlias(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

function inferMerchantType(alias: string): MerchantType {
  const lowered = alias.toLowerCase()

  if (
    /\b(bank|credit cards?|debit cards?|instaalert|transaction)\b/.test(lowered)
  ) {
    return "bank"
  }

  if (/\b(payroll|salary|hr|careers)\b/.test(lowered)) {
    return "employer"
  }

  if (
    /\b(google play|uber|apple|amazon|netflix|spotify|youtube)\b/.test(lowered)
  ) {
    return "platform"
  }

  return "merchant"
}

function inferCategorySlug(signal: ExtractedSignalSelect) {
  const hint = signal.categoryHint?.toLowerCase().trim()

  if (hint) {
    if (hint.includes("income")) return "income"
    if (hint.includes("salary")) return "salary"
    if (hint.includes("food")) return "food"
    if (hint.includes("transport")) return "transport"
    if (hint.includes("subscription")) return "subscriptions"
    if (hint.includes("bill")) return "bills"
    if (hint.includes("gaming")) return "gaming"
    if (hint.includes("software")) return "software"
    if (hint.includes("digital")) return "digital_goods"
    if (hint.includes("entertainment")) return "entertainment"
    if (hint.includes("travel")) return "travel"
    if (hint.includes("utilities")) return "utilities"
    if (hint.includes("debt")) return "debt"
    if (hint.includes("refund")) return "refunds"
    if (hint.includes("transfer")) return "transfers"
    if (hint.includes("shop")) return "shopping"
  }

  switch (signal.candidateEventType) {
    case "income":
      return "income"
    case "subscription_charge":
      return "subscriptions"
    case "bill_payment":
      return "bills"
    case "emi_payment":
      return "debt"
    case "refund":
      return "refunds"
    case "transfer":
      return "transfers"
    case "purchase":
      return "shopping"
    default:
      return "uncategorized"
  }
}

export function getDirectionForEventType(
  eventType: FinancialEventType
): FinancialEventDirection {
  switch (eventType) {
    case "income":
    case "refund":
      return "inflow"
    case "purchase":
    case "subscription_charge":
    case "emi_payment":
    case "bill_payment":
      return "outflow"
    case "transfer":
      return "neutral"
  }
}

export async function ensureSystemCategories(userId: string) {
  await db
    .insert(categories)
    .values(
      SYSTEM_CATEGORY_DEFINITIONS.map((category) => ({
        userId,
        name: category.name,
        slug: category.slug,
        kind: category.kind,
        iconName: category.iconName,
        colorToken: category.colorToken,
        isSystem: true,
      }))
    )
    .onConflictDoNothing()

  await Promise.all(
    SYSTEM_CATEGORY_DEFINITIONS.map((category) =>
      db
        .update(categories)
        .set({
          name: category.name,
          kind: category.kind,
          iconName: category.iconName,
          colorToken: category.colorToken,
          isSystem: true,
          updatedAt: new Date(),
        })
        .where(
          and(eq(categories.userId, userId), eq(categories.slug, category.slug))
        )
    )
  )

  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name))
}

export async function getCategoryBySlug(userId: string, slug: string) {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.slug, slug)))
    .limit(1)

  return category ?? null
}

export async function getCategoryById(userId: string, categoryId: string) {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    .limit(1)

  return category ?? null
}

export async function createCategory(input: {
  userId: string
  name: string
  slug: string
  kind: CategoryKind
  iconName: CategoryIconName
  colorToken: CategoryColorToken
  parentCategoryId?: string | null
  isSystem?: boolean
}) {
  const created =
    (
      await db
        .insert(categories)
        .values({
          userId: input.userId,
          parentCategoryId: input.parentCategoryId ?? null,
          name: input.name,
          slug: input.slug,
          kind: input.kind,
          iconName: input.iconName,
          colorToken: input.colorToken,
          isSystem: input.isSystem ?? false,
        })
        .onConflictDoNothing()
        .returning()
    )[0] ?? null

  if (created) {
    return created
  }

  return getCategoryBySlug(input.userId, input.slug)
}

export async function resolveCategoryForSignal(
  userId: string,
  signal: ExtractedSignalSelect
) {
  await ensureSystemCategories(userId)
  return getCategoryBySlug(userId, inferCategorySlug(signal))
}

export async function listCategoriesForUser(userId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name))
}

export async function getOrCreateMerchantForAlias(input: {
  userId: string
  aliasText: string
  source: string
  confidence?: number
  logoUrl?: string | null
}) {
  const normalizedName = normalizeMerchantName(input.aliasText)

  if (!normalizedName) {
    return null
  }

  const [existing] = await db
    .select()
    .from(merchants)
    .where(
      and(
        eq(merchants.userId, input.userId),
        eq(merchants.normalizedName, normalizedName)
      )
    )
    .limit(1)

  const merchant =
    existing ??
    (
      await db
        .insert(merchants)
        .values({
          userId: input.userId,
          displayName: input.aliasText.trim(),
          logoUrl: input.logoUrl ?? null,
          normalizedName,
          merchantType: inferMerchantType(input.aliasText),
          isSubscriptionProne:
            /\b(subscription|renewal|apple|netflix|spotify)\b/i.test(
              input.aliasText
            ),
          isEmiLender: /\b(bank|cards?|emi|installment)\b/i.test(
            input.aliasText
          ),
          lastSeenAt: new Date(),
        })
        .onConflictDoNothing()
        .returning()
    )[0]

  const resolvedMerchant =
    merchant ??
    (
      await db
        .select()
        .from(merchants)
        .where(
          and(
            eq(merchants.userId, input.userId),
            eq(merchants.normalizedName, normalizedName)
          )
        )
        .limit(1)
    )[0]

  if (!resolvedMerchant) {
    throw new Error("Failed to resolve merchant")
  }

  await db
    .insert(merchantAliases)
    .values({
      merchantId: resolvedMerchant.id,
      aliasText: input.aliasText,
      aliasHash: hashAlias(input.aliasText.toLowerCase()),
      source: input.source,
      confidence: input.confidence ?? 1,
    })
    .onConflictDoNothing()

  await db
    .update(merchants)
    .set({
      displayName: resolvedMerchant.displayName || input.aliasText.trim(),
      logoUrl: input.logoUrl ?? resolvedMerchant.logoUrl,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(merchants.id, resolvedMerchant.id))

  const [updated] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, resolvedMerchant.id))
    .limit(1)

  return updated ?? resolvedMerchant
}

export async function maybeResolvePaymentInstrument(input: {
  userId: string
  hint: string | null
  merchantName: string | null
  currency: string
}) {
  const maskedIdentifier = input.hint?.replace(/\D+/g, "").slice(-4) ?? null

  if (!maskedIdentifier || maskedIdentifier.length !== 4) {
    return null
  }

  const providerName = input.merchantName?.trim() || null
  const loweredProvider = providerName?.toLowerCase() ?? ""
  const instrumentType: PaymentInstrumentType = /\bupi\b/.test(loweredProvider)
    ? "upi"
    : /\bdebit\b/.test(loweredProvider)
      ? "debit_card"
      : /\bcredit|card|bank\b/.test(loweredProvider)
        ? "credit_card"
        : "unknown"
  const providerNameCondition = providerName
    ? eq(paymentInstruments.providerName, providerName)
    : isNull(paymentInstruments.providerName)

  const [existing] = await db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.instrumentType, instrumentType),
        providerNameCondition,
        eq(paymentInstruments.maskedIdentifier, maskedIdentifier)
      )
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const [created] = await db
    .insert(paymentInstruments)
    .values({
      userId: input.userId,
      instrumentType,
      providerName,
      displayName:
        instrumentType === "credit_card" || instrumentType === "debit_card"
          ? `${providerName ?? "Card"} •${maskedIdentifier}`
          : `${providerName ?? "Account"} •${maskedIdentifier}`,
      maskedIdentifier,
      currency: input.currency,
      status: "active",
    })
    .onConflictDoNothing()
    .returning()

  if (created) {
    return created
  }

  const [resolved] = await db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.instrumentType, instrumentType),
        providerNameCondition,
        eq(paymentInstruments.maskedIdentifier, maskedIdentifier)
      )
    )
    .limit(1)

  return resolved ?? null
}

export async function getExtractedSignalById(signalId: string) {
  const [signal] = await db
    .select()
    .from(extractedSignals)
    .where(eq(extractedSignals.id, signalId))
    .limit(1)

  return signal ?? null
}

export async function updateExtractedSignalStatus(
  signalId: string,
  status: ExtractedSignalSelect["status"]
) {
  const [signal] = await db
    .update(extractedSignals)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(extractedSignals.id, signalId))
    .returning()

  return signal ?? null
}

export async function getFinancialEventSourceByExtractedSignal(
  signalId: string
) {
  const [source] = await db
    .select()
    .from(financialEventSources)
    .where(eq(financialEventSources.extractedSignalId, signalId))
    .limit(1)

  return source ?? null
}

export async function getFinancialEventSourceByRawDocument(
  rawDocumentId: string
) {
  const [source] = await db
    .select()
    .from(financialEventSources)
    .where(eq(financialEventSources.rawDocumentId, rawDocumentId))
    .orderBy(desc(financialEventSources.createdAt))
    .limit(1)

  return source ?? null
}

export async function getFinancialEventById(eventId: string) {
  const [event] = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, eventId))
    .limit(1)

  return event ?? null
}

export async function listCandidateFinancialEvents(input: {
  userId: string
  eventType: FinancialEventType
  amountMinor: number
  currency: string
  from: Date
  to: Date
}) {
  return db
    .select()
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.userId, input.userId),
        eq(financialEvents.eventType, input.eventType),
        eq(financialEvents.amountMinor, input.amountMinor),
        eq(financialEvents.currency, input.currency),
        gte(financialEvents.eventOccurredAt, input.from),
        lte(financialEvents.eventOccurredAt, input.to)
      )
    )
    .orderBy(desc(financialEvents.eventOccurredAt))
}

export async function listCandidateFinancialEventsByWindow(input: {
  userId: string
  eventTypes: FinancialEventType[]
  from: Date
  to: Date
}) {
  if (input.eventTypes.length === 0) {
    return []
  }

  return db
    .select()
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.userId, input.userId),
        inArray(financialEvents.eventType, input.eventTypes),
        gte(financialEvents.eventOccurredAt, input.from),
        lte(financialEvents.eventOccurredAt, input.to)
      )
    )
    .orderBy(desc(financialEvents.eventOccurredAt))
}

export async function createFinancialEvent(input: FinancialEventInsert) {
  const [event] = await db.insert(financialEvents).values(input).returning()

  if (!event) {
    throw new Error("Failed to create financial event")
  }

  return event
}

export async function updateFinancialEvent(
  eventId: string,
  input: Partial<FinancialEventInsert>
) {
  const [event] = await db
    .update(financialEvents)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(financialEvents.id, eventId))
    .returning()

  return event ?? null
}

export async function createFinancialEventSource(input: {
  financialEventId: string
  rawDocumentId?: string | null
  extractedSignalId?: string | null
  linkReason: string
}) {
  const [source] = await db
    .insert(financialEventSources)
    .values({
      financialEventId: input.financialEventId,
      rawDocumentId: input.rawDocumentId ?? null,
      extractedSignalId: input.extractedSignalId ?? null,
      linkReason: input.linkReason,
    })
    .returning()

  if (!source) {
    throw new Error("Failed to create financial event source")
  }

  return source
}

export async function reassignFinancialEventSources(input: {
  fromFinancialEventId: string
  toFinancialEventId: string
}) {
  if (input.fromFinancialEventId === input.toFinancialEventId) {
    return []
  }

  return db
    .update(financialEventSources)
    .set({
      financialEventId: input.toFinancialEventId,
    })
    .where(
      eq(financialEventSources.financialEventId, input.fromFinancialEventId)
    )
    .returning()
}

export async function refreshFinancialEventSourceCount(
  financialEventId: string
) {
  const rows = await db
    .select({ id: financialEventSources.id })
    .from(financialEventSources)
    .where(eq(financialEventSources.financialEventId, financialEventId))

  const [event] = await db
    .update(financialEvents)
    .set({
      sourceCount: rows.length,
      updatedAt: new Date(),
    })
    .where(eq(financialEvents.id, financialEventId))
    .returning()

  return event ?? null
}

export async function createReviewQueueItem(input: {
  userId: string
  itemType: ReviewQueueItemSelect["itemType"]
  priority?: number
  rawDocumentId?: string | null
  extractedSignalId?: string | null
  financialEventId?: string | null
  title: string
  explanation: string
  proposedResolutionJson?: Record<string, unknown>
}) {
  const [item] = await db
    .insert(reviewQueueItems)
    .values({
      userId: input.userId,
      itemType: input.itemType,
      priority: input.priority ?? 3,
      rawDocumentId: input.rawDocumentId ?? null,
      extractedSignalId: input.extractedSignalId ?? null,
      financialEventId: input.financialEventId ?? null,
      title: input.title,
      explanation: input.explanation,
      proposedResolutionJson: input.proposedResolutionJson ?? {},
    })
    .returning()

  if (!item) {
    throw new Error("Failed to create review queue item")
  }

  return item
}

export async function updateReviewQueueItem(
  reviewItemId: string,
  input: {
    status?: ReviewQueueItemSelect["status"]
    financialEventId?: string | null
    proposedResolutionJson?: Record<string, unknown>
    resolvedAt?: Date | null
  }
) {
  const [item] = await db
    .update(reviewQueueItems)
    .set({
      status: input.status,
      financialEventId: input.financialEventId,
      proposedResolutionJson: input.proposedResolutionJson,
      resolvedAt: input.resolvedAt,
    })
    .where(eq(reviewQueueItems.id, reviewItemId))
    .returning()

  return item ?? null
}

export async function getReviewQueueItemById(reviewItemId: string) {
  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(eq(reviewQueueItems.id, reviewItemId))
    .limit(1)

  return item ?? null
}

export async function listReviewQueueItemsForUser(input: {
  userId: string
  status?: ReviewQueueItemSelect["status"]
  limit?: number
}) {
  let query = db
    .select()
    .from(reviewQueueItems)
    .where(eq(reviewQueueItems.userId, input.userId))
    .orderBy(
      asc(reviewQueueItems.status),
      asc(reviewQueueItems.priority),
      desc(reviewQueueItems.createdAt)
    )
    .limit(input.limit ?? 50)

  if (input.status) {
    query = db
      .select()
      .from(reviewQueueItems)
      .where(
        and(
          eq(reviewQueueItems.userId, input.userId),
          eq(reviewQueueItems.status, input.status)
        )
      )
      .orderBy(asc(reviewQueueItems.priority), desc(reviewQueueItems.createdAt))
      .limit(input.limit ?? 50)
  }

  return query
}

export async function listRecentReviewQueueItemsForRawDocumentIds(
  rawDocumentIds: string[]
) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(reviewQueueItems)
    .where(inArray(reviewQueueItems.rawDocumentId, rawDocumentIds))
    .orderBy(desc(reviewQueueItems.createdAt))
}

export async function findOpenReviewQueueItem(input: {
  userId: string
  itemType: ReviewQueueItemSelect["itemType"]
  financialEventId?: string | null
  rawDocumentId?: string | null
}) {
  const conditions = [
    eq(reviewQueueItems.userId, input.userId),
    eq(reviewQueueItems.itemType, input.itemType),
    eq(reviewQueueItems.status, "open"),
  ]

  if (input.financialEventId || input.rawDocumentId) {
    conditions.push(
      or(
        input.financialEventId
          ? eq(reviewQueueItems.financialEventId, input.financialEventId)
          : undefined,
        input.rawDocumentId
          ? eq(reviewQueueItems.rawDocumentId, input.rawDocumentId)
          : undefined
      )!
    )
  }

  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(and(...conditions))
    .orderBy(desc(reviewQueueItems.createdAt))
    .limit(1)

  return item ?? null
}

export async function listLedgerEventsForUser(input: {
  userId: string
  statuses?: FinancialEventStatus[]
  eventType?: FinancialEventType
  eventTypes?: FinancialEventType[]
  categoryId?: string
  categoryIds?: string[]
  direction?: FinancialEventDirection
  merchantIds?: string[]
  paymentInstrumentIds?: string[]
  paymentProcessorIds?: string[]
  needsReview?: boolean
  query?: string
  dateFrom?: Date
  dateTo?: Date
  reportingCurrency?: string
  crossCurrency?: boolean
  amountMinMinor?: number
  amountMaxMinor?: number
  limit?: number
}) {
  const conditions = [
    eq(financialEvents.userId, input.userId),
    inArray(
      financialEvents.status,
      input.statuses ?? ["confirmed", "needs_review"]
    ),
  ]

  if (input.eventType) {
    conditions.push(eq(financialEvents.eventType, input.eventType))
  }

  if (input.eventTypes?.length) {
    conditions.push(inArray(financialEvents.eventType, input.eventTypes))
  }

  if (input.categoryId) {
    conditions.push(eq(financialEvents.categoryId, input.categoryId))
  }

  if (input.categoryIds?.length) {
    conditions.push(inArray(financialEvents.categoryId, input.categoryIds))
  }

  if (input.direction) {
    conditions.push(eq(financialEvents.direction, input.direction))
  }

  if (input.merchantIds?.length) {
    conditions.push(inArray(financialEvents.merchantId, input.merchantIds))
  }

  if (input.paymentInstrumentIds?.length) {
    conditions.push(
      inArray(financialEvents.paymentInstrumentId, input.paymentInstrumentIds)
    )
  }

  if (input.paymentProcessorIds?.length) {
    conditions.push(
      inArray(financialEvents.paymentProcessorId, input.paymentProcessorIds)
    )
  }

  if (typeof input.needsReview === "boolean") {
    conditions.push(eq(financialEvents.needsReview, input.needsReview))
  }

  if (input.dateFrom) {
    conditions.push(gte(financialEvents.eventOccurredAt, input.dateFrom))
  }

  if (input.dateTo) {
    conditions.push(lte(financialEvents.eventOccurredAt, input.dateTo))
  }

  if (input.query?.trim()) {
    const pattern = `%${input.query.trim()}%`
    conditions.push(
      or(
        ilike(financialEvents.description, pattern),
        ilike(financialEvents.notes, pattern),
        existsMerchantMatch(input.query.trim()),
        existsProcessorMatch(input.query.trim()),
        existsInstrumentMatch(input.query.trim())
      )!
    )
  }

  if (input.reportingCurrency && input.crossCurrency) {
    conditions.push(ne(financialEvents.currency, input.reportingCurrency))
  }

  const comparableAmountExpression =
    input.reportingCurrency &&
    (typeof input.amountMinMinor === "number" ||
      typeof input.amountMaxMinor === "number")
      ? sql<number>`case
          when ${financialEvents.currency} = ${input.reportingCurrency}
            then ${financialEvents.amountMinor}
          else ${financialEventValuations.normalizedAmountMinor}
        end`
      : null

  if (comparableAmountExpression && typeof input.amountMinMinor === "number") {
    conditions.push(
      sql<boolean>`${comparableAmountExpression} is not null and ${comparableAmountExpression} >= ${input.amountMinMinor}`
    )
  }

  if (comparableAmountExpression && typeof input.amountMaxMinor === "number") {
    conditions.push(
      sql<boolean>`${comparableAmountExpression} is not null and ${comparableAmountExpression} <= ${input.amountMaxMinor}`
    )
  }

  return db
    .select({
      event: financialEvents,
      merchant: merchants,
      category: categories,
      paymentInstrument: paymentInstruments,
      paymentProcessor: paymentProcessors,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id)
    )
    .leftJoin(
      paymentProcessors,
      eq(financialEvents.paymentProcessorId, paymentProcessors.id)
    )
    .leftJoin(
      financialEventValuations,
      input.reportingCurrency
        ? and(
            eq(financialEventValuations.financialEventId, financialEvents.id),
            eq(
              financialEventValuations.targetCurrency,
              input.reportingCurrency
            ),
            isNull(financialEventValuations.supersededAt)
          )
        : sql`false`
    )
    .where(and(...conditions))
    .orderBy(
      desc(financialEvents.eventOccurredAt),
      desc(financialEvents.createdAt)
    )
    .limit(input.limit ?? 100)
}

function existsMerchantMatch(query: string) {
  const pattern = `%${query}%`

  return sql<boolean>`exists (
    select 1 from merchant
    where merchant.id = ${financialEvents.merchantId}
      and (merchant.display_name ilike ${pattern} or merchant.normalized_name ilike ${pattern})
  )`
}

function existsProcessorMatch(query: string) {
  const pattern = `%${query}%`

  return sql<boolean>`exists (
    select 1 from payment_processor
    where payment_processor.id = ${financialEvents.paymentProcessorId}
      and (payment_processor.display_name ilike ${pattern} or payment_processor.normalized_name ilike ${pattern})
  )`
}

function existsInstrumentMatch(query: string) {
  const pattern = `%${query}%`

  return sql<boolean>`exists (
    select 1 from payment_instrument
    where payment_instrument.id = ${financialEvents.paymentInstrumentId}
      and (
        payment_instrument.display_name ilike ${pattern}
        or coalesce(payment_instrument.provider_name, '') ilike ${pattern}
        or coalesce(payment_instrument.masked_identifier, '') ilike ${pattern}
      )
  )`
}

export async function listActivityMerchantsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select({
      id: merchants.id,
      displayName: merchants.displayName,
      normalizedName: merchants.normalizedName,
      logoUrl: merchants.logoUrl,
      lastSeenAt: merchants.lastSeenAt,
    })
    .from(merchants)
    .where(eq(merchants.userId, input.userId))
    .orderBy(desc(merchants.lastSeenAt), asc(merchants.displayName))
    .limit(input.limit ?? 200)
}

export async function listActivityPaymentProcessorsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select({
      id: paymentProcessors.id,
      displayName: paymentProcessors.displayName,
      normalizedName: paymentProcessors.normalizedName,
    })
    .from(paymentProcessors)
    .where(eq(paymentProcessors.userId, input.userId))
    .orderBy(asc(paymentProcessors.displayName))
    .limit(input.limit ?? 200)
}

export async function listActivityPaymentInstrumentsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select({
      id: paymentInstruments.id,
      displayName: paymentInstruments.displayName,
      instrumentType: paymentInstruments.instrumentType,
      maskedIdentifier: paymentInstruments.maskedIdentifier,
      providerName: paymentInstruments.providerName,
    })
    .from(paymentInstruments)
    .where(eq(paymentInstruments.userId, input.userId))
    .orderBy(asc(paymentInstruments.displayName))
    .limit(input.limit ?? 200)
}

export async function listFinancialEventSourcesForEventIds(eventIds: string[]) {
  if (eventIds.length === 0) {
    return []
  }

  return db
    .select({
      source: financialEventSources,
      rawDocument: rawDocuments,
      extractedSignal: extractedSignals,
    })
    .from(financialEventSources)
    .leftJoin(
      rawDocuments,
      eq(financialEventSources.rawDocumentId, rawDocuments.id)
    )
    .leftJoin(
      extractedSignals,
      eq(financialEventSources.extractedSignalId, extractedSignals.id)
    )
    .where(inArray(financialEventSources.financialEventId, eventIds))
    .orderBy(desc(financialEventSources.createdAt))
}

export async function listFinancialEventReconciliationContexts(
  eventIds: string[]
) {
  if (eventIds.length === 0) {
    return []
  }

  return db
    .select({
      event: financialEvents,
      merchant: merchants,
      paymentProcessor: paymentProcessors,
      paymentInstrument: paymentInstruments,
      source: financialEventSources,
      rawDocument: rawDocuments,
      extractedSignal: extractedSignals,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(
      paymentProcessors,
      eq(financialEvents.paymentProcessorId, paymentProcessors.id)
    )
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id)
    )
    .leftJoin(
      financialEventSources,
      eq(financialEventSources.financialEventId, financialEvents.id)
    )
    .leftJoin(
      rawDocuments,
      eq(financialEventSources.rawDocumentId, rawDocuments.id)
    )
    .leftJoin(
      extractedSignals,
      eq(financialEventSources.extractedSignalId, extractedSignals.id)
    )
    .where(inArray(financialEvents.id, eventIds))
    .orderBy(
      desc(financialEventSources.createdAt),
      desc(financialEvents.createdAt)
    )
}

export async function listFinancialEventSourcesForRawDocumentIds(
  rawDocumentIds: string[]
) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select({
      source: financialEventSources,
      event: financialEvents,
    })
    .from(financialEventSources)
    .leftJoin(
      financialEvents,
      eq(financialEventSources.financialEventId, financialEvents.id)
    )
    .where(inArray(financialEventSources.rawDocumentId, rawDocumentIds))
    .orderBy(desc(financialEventSources.createdAt))
}

export async function countOpenReviewQueueItemsForUser(userId: string) {
  const rows = await db
    .select({ id: reviewQueueItems.id })
    .from(reviewQueueItems)
    .where(
      and(
        eq(reviewQueueItems.userId, userId),
        eq(reviewQueueItems.status, "open")
      )
    )

  return rows.length
}

export async function countFinancialEventsForUser(userId: string) {
  const rows = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.userId, userId))

  return rows.length
}

export async function getReviewQueueContext(reviewItemId: string) {
  const item = await getReviewQueueItemById(reviewItemId)

  if (!item) {
    return null
  }

  const [rawDocument] = item.rawDocumentId
    ? await db
        .select()
        .from(rawDocuments)
        .where(eq(rawDocuments.id, item.rawDocumentId))
        .limit(1)
    : []

  const [signal] = item.extractedSignalId
    ? await db
        .select()
        .from(extractedSignals)
        .where(eq(extractedSignals.id, item.extractedSignalId))
        .limit(1)
    : []

  const [event] = item.financialEventId
    ? await db
        .select()
        .from(financialEvents)
        .where(eq(financialEvents.id, item.financialEventId))
        .limit(1)
    : []

  return {
    item,
    rawDocument: rawDocument ?? null,
    signal: signal ?? null,
    event: event ?? null,
  }
}
