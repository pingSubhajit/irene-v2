import {
  applyAdviceHomeRanking,
  clearAdviceHomeRankingForUser,
  countOpenReviewQueueItemsForUser,
  createModelRun,
  expireMissingAdviceItems,
  getLatestForecastRunWithSnapshots,
  getMemoryBundleForUser,
  getUserSettings,
  listAdviceItemsForUser,
  listFinancialGoalsForUser,
  listIncomeStreamsForUser,
  listLedgerEventsForUser,
  listRecurringObligationsForUser,
  updateModelRun,
  upsertAdviceItem,
  upsertGoalContributionSnapshot,
  type AdviceItemAction,
  type AdviceItemPriority,
  type AdviceItemTriggerType,
} from "@workspace/db"
import {
  aiModels,
  aiPromptVersions,
  generateAdviceDecisionsWithAi,
  rankAdviceForHomeWithAi,
  type AdviceDecisionCandidate,
} from "@workspace/ai"
import { createLogger } from "@workspace/observability"

const logger = createLogger("worker.advice")

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_AI_ADVICE_ITEMS = 5
const MAX_HOME_RANKED_ADVICE_ITEMS = 3

type AdviceRefreshReason =
  | "forecast_changed"
  | "goals_changed"
  | "manual_refresh"
  | "nightly_rebuild"
  | "startup_rebuild"
  | "manual_rebuild"
  | "logic_change"

type CandidateIssue = {
  id: string
  issueType: AdviceItemTriggerType
  priorityHint: AdviceItemPriority
  dedupeSeed: string
  validFrom: Date
  validUntil: Date | null
  relatedMerchantId: string | null
  relatedFinancialGoalId: string | null
  payload: Record<string, unknown>
  fallback: {
    title: string
    summary: string
    detail: string
    whyNow?: string
  }
  memoryMerchantHints?: string[]
  allowedActionTypes: AdviceItemAction["type"][]
  fallbackAction?: AdviceItemAction | null
}

type PersistableAdvice = {
  triggerType: AdviceItemTriggerType
  priority: AdviceItemPriority
  dedupeKey: string
  validFrom: Date
  validUntil: Date | null
  relatedMerchantId: string | null
  relatedFinancialGoalId: string | null
  title: string
  summary: string
  detail: string
  evidenceJson: Record<string, unknown>
  primaryActionJson: AdviceItemAction | null
  secondaryActionJson: AdviceItemAction | null
}

type ValidationContext = {
  activeGoalIds: Set<string>
  merchantIds: Set<string>
  openReviewCount: number
  availableNavigationHrefs: Set<string>
}

type GeneratedAdviceAction = NonNullable<AdviceDecisionCandidate["primaryAction"]>
type ActiveAdviceRow = Awaited<ReturnType<typeof listAdviceItemsForUser>>[number]

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS)
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

function currencyAmount(amountMinor: number, currency = "INR") {
  const amount = amountMinor / 100

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function humanDate(date: Date | string) {
  const value = typeof date === "string" ? parseDateKey(date) : date

  return value.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (!value) {
      return false
    }

    return array.indexOf(value) === index
  })
}

function normalizeDateStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function clampPriority(value: number): AdviceItemPriority {
  if (value <= 1) {
    return 1
  }

  if (value >= 3) {
    return 3
  }

  return 2
}

function buildGoalHref(goalId: string) {
  return `/goals/${goalId}`
}

function buildActivityHref(input: {
  view?: "all" | "outflow" | "inflow" | "review" | "subscriptions" | "emis" | "income"
  merchantIds?: string[]
  eventTypes?: string[]
}) {
  const searchParams = new URLSearchParams()

  if (input.view && input.view !== "all") {
    searchParams.set("view", input.view)
  }

  for (const merchantId of input.merchantIds ?? []) {
    searchParams.append("merchant", merchantId)
  }

  for (const eventType of input.eventTypes ?? []) {
    searchParams.append("type", eventType)
  }

  const search = searchParams.toString()
  return search ? `/activity?${search}` : "/activity"
}

function buildSettingsHref(subpage: string) {
  return subpage.startsWith("/") ? subpage : `/settings/${subpage}`
}

function buildAvailableNavigationHrefs(input: {
  activeGoalIds: string[]
}) {
  const hrefs = new Set<string>([
    "/activity",
    "/activity?view=subscriptions",
    "/activity?view=emis",
    "/activity?view=income",
    "/review",
    "/advice",
    "/settings",
    "/settings/accounts/baseline",
    "/settings/accounts/cash",
    "/settings/accounts/links",
  ])

  for (const goalId of input.activeGoalIds) {
    hrefs.add(buildGoalHref(goalId))
  }

  return hrefs
}

function buildLowCashProjectionCandidate(input: {
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  reportingCurrency: string
  now: Date
}): CandidateIssue | null {
  if (!input.forecast) {
    return null
  }

  const urgentSnapshot = input.forecast.snapshots.find((snapshot) => {
    const date = parseDateKey(snapshot.snapshotDate)
    const daysAhead = daysBetween(normalizeDateStart(input.now), normalizeDateStart(date))
    if (daysAhead < 0 || daysAhead > 14) {
      return false
    }

    if (input.forecast?.run.runType === "anchored") {
      return (
        (snapshot.safeToSpendMinor ?? 0) < 0 ||
        (snapshot.projectedBalanceMinor ?? Number.MAX_SAFE_INTEGER) < 0
      )
    }

    return (snapshot.projectedVariableOutflowMinor ?? 0) > 0
  })

  if (!urgentSnapshot) {
    return null
  }

  const missingAnchor = input.forecast.run.runType !== "anchored"
  const priority: AdviceItemPriority =
    missingAnchor ||
    (urgentSnapshot.projectedBalanceMinor ?? 0) < 0 ||
    (urgentSnapshot.safeToSpendMinor ?? 0) < -5000
      ? 1
      : 2

  const fallbackAction = missingAnchor
    ? ({
        type: "open_accounts_baseline",
        label: "Set balance baseline",
        href: "/settings/accounts/baseline",
      } satisfies AdviceItemAction)
    : ({
        type: "open_activity_filtered",
        label: "Review activity",
        href: "/activity?view=outflow",
        view: "outflow",
      } satisfies AdviceItemAction)

  return {
    id: `low_cash_projection:${input.forecast.run.id}:${urgentSnapshot.snapshotDate}`,
    issueType: "low_cash_projection",
    priorityHint: priority,
    dedupeSeed: `low_cash_projection:${input.forecast.run.id}:${urgentSnapshot.snapshotDate}`,
    validFrom: input.now,
    validUntil: addDays(parseDateKey(urgentSnapshot.snapshotDate), 7),
    relatedMerchantId: null,
    relatedFinancialGoalId: null,
    payload: {
      runType: input.forecast.run.runType,
      forecastRunId: input.forecast.run.id,
      snapshotDate: urgentSnapshot.snapshotDate,
      reportingCurrency: input.reportingCurrency,
      projectedBalanceMinor: urgentSnapshot.projectedBalanceMinor,
      projectedBalanceLabel:
        urgentSnapshot.projectedBalanceMinor !== null
          ? currencyAmount(
              urgentSnapshot.projectedBalanceMinor,
              input.reportingCurrency,
            )
          : null,
      safeToSpendMinor: urgentSnapshot.safeToSpendMinor,
      safeToSpendLabel:
        urgentSnapshot.safeToSpendMinor !== null
          ? currencyAmount(urgentSnapshot.safeToSpendMinor, input.reportingCurrency)
          : null,
      projectedIncomeMinor: urgentSnapshot.projectedIncomeMinor,
      projectedFixedOutflowMinor: urgentSnapshot.projectedFixedOutflowMinor,
      projectedVariableOutflowMinor: urgentSnapshot.projectedVariableOutflowMinor,
      projectedEmiOutflowMinor: urgentSnapshot.projectedEmiOutflowMinor,
      missingAnchor,
    },
    fallback: {
      title: missingAnchor
        ? "Forecast needs a balance baseline"
        : "Projected cash turns tight soon",
      summary: missingAnchor
        ? "Irene can see the pressure building, but a confirmed cash baseline would make the projection more reliable."
        : `Your forecast looks tight around ${humanDate(urgentSnapshot.snapshotDate)}.`,
      detail: missingAnchor
        ? "Add a confirmed cash balance so projected balance and safe-to-spend become more dependable."
        : `Projected balance is ${urgentSnapshot.projectedBalanceMinor !== null ? currencyAmount(urgentSnapshot.projectedBalanceMinor, input.reportingCurrency) : "unclear"} and safe-to-spend is ${urgentSnapshot.safeToSpendMinor !== null ? currencyAmount(urgentSnapshot.safeToSpendMinor, input.reportingCurrency) : "unclear"} by ${humanDate(urgentSnapshot.snapshotDate)}.`,
      whyNow: missingAnchor
        ? "The forecast is running in net-only mode."
        : "The near-term forecast shows pressure inside the next two weeks.",
    },
    allowedActionTypes: [
      "open_accounts_baseline",
      "open_activity_filtered",
      "open_settings_subpage",
      "navigate",
      "refresh_advice",
    ],
    fallbackAction,
  }
}

function buildRecurringPressureCandidate(input: {
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  recurring: Awaited<ReturnType<typeof listRecurringObligationsForUser>>
  reportingCurrency: string
  now: Date
}): CandidateIssue | null {
  if (!input.forecast) {
    return null
  }

  const windowSnapshots = input.forecast.snapshots.slice(0, 30)
  const fixedOutflowMinor = sum(
    windowSnapshots.map(
      (snapshot) =>
        (snapshot.projectedFixedOutflowMinor ?? 0) + (snapshot.projectedEmiOutflowMinor ?? 0),
    ),
  )
  const projectedIncomeMinor = sum(
    windowSnapshots.map((snapshot) => snapshot.projectedIncomeMinor ?? 0),
  )
  const activeRecurring = input.recurring.filter((row) => row.obligation.status === "active")

  if (activeRecurring.length < 2 || fixedOutflowMinor < 10000) {
    return null
  }

  const share = projectedIncomeMinor > 0 ? fixedOutflowMinor / projectedIncomeMinor : null
  if (share !== null && share < 0.35 && fixedOutflowMinor < 25000) {
    return null
  }

  const merchants = uniqueNonEmpty(activeRecurring.map((row) => row.merchant?.displayName)).slice(
    0,
    3,
  )

  return {
    id: `rising_recurring_obligations:${input.forecast.run.id}:${activeRecurring.length}:${fixedOutflowMinor}`,
    issueType: "rising_recurring_obligations",
    priorityHint: share !== null && share >= 0.55 ? 1 : 2,
    dedupeSeed: `rising_recurring_obligations:${input.forecast.run.id}:${activeRecurring.length}:${fixedOutflowMinor}`,
    validFrom: input.now,
    validUntil: addDays(input.now, 14),
    relatedMerchantId: activeRecurring[0]?.merchant?.id ?? null,
    relatedFinancialGoalId: null,
    payload: {
      forecastRunId: input.forecast.run.id,
      reportingCurrency: input.reportingCurrency,
      activeRecurringCount: activeRecurring.length,
      recurringMerchants: merchants,
      upcoming30DayFixedOutflowMinor: fixedOutflowMinor,
      upcoming30DayFixedOutflowLabel: currencyAmount(
        fixedOutflowMinor,
        input.reportingCurrency,
      ),
      upcoming30DayIncomeMinor: projectedIncomeMinor,
      upcoming30DayIncomeLabel: currencyAmount(
        projectedIncomeMinor,
        input.reportingCurrency,
      ),
      fixedOutflowShareOfIncome: share,
    },
    fallback: {
      title: "Recurring commitments are stacking up",
      summary: `About ${currencyAmount(fixedOutflowMinor, input.reportingCurrency)} in fixed obligations are expected over the next 30 days.`,
      detail:
        merchants.length > 0
          ? `Recurring outflows from ${merchants.join(", ")} are taking a larger share of the next month than usual.`
          : "Your active subscriptions, bills, and EMI obligations are taking a larger share of the next month.",
      whyNow: "Fixed commitments are taking a larger slice of the next 30 days.",
    },
    memoryMerchantHints: merchants,
    allowedActionTypes: ["open_activity_filtered", "navigate"],
    fallbackAction: {
      type: "open_activity_filtered",
      label: "Open recurring activity",
      href: "/activity?view=subscriptions",
      view: "subscriptions",
    },
  }
}

function buildDelayedIncomeCandidates(input: {
  incomeStreams: Awaited<ReturnType<typeof listIncomeStreamsForUser>>
  now: Date
}) {
  return input.incomeStreams
    .filter((row) => row.incomeStream.status === "active" && row.incomeStream.nextExpectedAt)
    .flatMap((row): CandidateIssue[] => {
      const nextExpectedAt = row.incomeStream.nextExpectedAt
      if (!nextExpectedAt) {
        return []
      }

      const daysLate = daysBetween(normalizeDateStart(nextExpectedAt), normalizeDateStart(input.now))
      if (daysLate < 3) {
        return []
      }

      const amountLabel =
        row.incomeStream.expectedAmountMinor !== null
          ? currencyAmount(
              row.incomeStream.expectedAmountMinor,
              row.incomeStream.currency ?? "INR",
            )
          : "the expected amount"
      const streamName = row.incomeStream.name

      return [
        {
          id: `delayed_income:${row.incomeStream.id}:${formatDateKey(nextExpectedAt)}`,
          issueType: "delayed_income",
          priorityHint: daysLate >= 7 ? 1 : 2,
          dedupeSeed: `delayed_income:${row.incomeStream.id}:${formatDateKey(nextExpectedAt)}`,
          validFrom: input.now,
          validUntil: addDays(input.now, 7),
          relatedMerchantId: row.merchant?.id ?? null,
          relatedFinancialGoalId: null,
          payload: {
            incomeStreamId: row.incomeStream.id,
            incomeStreamName: streamName,
            expectedAmountMinor: row.incomeStream.expectedAmountMinor,
            currency: row.incomeStream.currency ?? "INR",
            expectedAmountLabel:
              row.incomeStream.expectedAmountMinor !== null
                ? currencyAmount(
                    row.incomeStream.expectedAmountMinor,
                    row.incomeStream.currency ?? "INR",
                  )
                : null,
            nextExpectedAt: nextExpectedAt.toISOString(),
            daysLate,
            cadence: row.incomeStream.cadence,
          },
          fallback: {
            title: `${streamName} looks delayed`,
            summary: `${streamName} was expected around ${humanDate(nextExpectedAt)} and still has not clearly arrived.`,
            detail: `${amountLabel} from this income stream now looks ${daysLate} days late against the current schedule.`,
            whyNow: "The expected income date has already passed.",
          },
          memoryMerchantHints: row.merchant?.displayName
            ? [row.merchant.displayName]
            : undefined,
          allowedActionTypes: ["open_activity_filtered", "navigate"],
          fallbackAction: {
            type: "open_activity_filtered",
            label: "Open income view",
            href: "/activity?view=income",
            view: "income",
          },
        },
      ]
    })
}

function buildDiscretionaryOverspendingCandidate(input: {
  events: Awaited<ReturnType<typeof listLedgerEventsForUser>>
  reportingCurrency: string
  now: Date
}): CandidateIssue | null {
  const discretionaryEvents = input.events.filter(({ event }) => {
    if (event.direction !== "outflow" || event.isTransfer) {
      return false
    }

    return ![
      "subscription_charge",
      "emi_payment",
      "bill_payment",
      "refund",
      "transfer",
    ].includes(event.eventType)
  })

  const nowStart = normalizeDateStart(input.now)
  const recentCutoff = new Date(nowStart.getTime() - 14 * DAY_MS)
  const baselineCutoff = new Date(nowStart.getTime() - 74 * DAY_MS)

  const recent = discretionaryEvents.filter(
    ({ event }) => event.eventOccurredAt >= recentCutoff && event.eventOccurredAt <= input.now,
  )
  const baseline = discretionaryEvents.filter(
    ({ event }) => event.eventOccurredAt >= baselineCutoff && event.eventOccurredAt < recentCutoff,
  )

  if (recent.length < 3 || baseline.length < 6) {
    return null
  }

  const recentDaily = sum(recent.map(({ event }) => event.amountMinor)) / 14
  const baselineDaily = sum(baseline.map(({ event }) => event.amountMinor)) / 60

  if (baselineDaily <= 0 || recentDaily < baselineDaily * 1.35 || recentDaily - baselineDaily < 500) {
    return null
  }

  const merchantTotals = new Map<string, { merchantId: string | null; total: number }>()

  for (const row of recent) {
    const name = row.merchant?.displayName
    if (!name) {
      continue
    }

    const existing = merchantTotals.get(name) ?? {
      merchantId: row.merchant?.id ?? null,
      total: 0,
    }
    existing.total += row.event.amountMinor
    merchantTotals.set(name, existing)
  }

  const topMerchantEntry = [...merchantTotals.entries()].sort((left, right) => right[1].total - left[1].total)[0] ?? null
  const topMerchant = topMerchantEntry?.[0] ?? null
  const topMerchantId = topMerchantEntry?.[1].merchantId ?? null

  return {
    id: `discretionary_overspending:${formatDateKey(input.now)}:${Math.round(recentDaily)}`,
    issueType: "discretionary_overspending",
    priorityHint: recentDaily >= baselineDaily * 1.75 ? 1 : 2,
    dedupeSeed: `discretionary_overspending:${formatDateKey(input.now)}:${Math.round(recentDaily)}`,
    validFrom: input.now,
    validUntil: addDays(input.now, 7),
    relatedMerchantId: topMerchantId,
    relatedFinancialGoalId: null,
    payload: {
      reportingCurrency: input.reportingCurrency,
      recentDailyOutflowMinor: Math.round(recentDaily),
      recentDailyOutflowLabel: currencyAmount(
        Math.round(recentDaily),
        input.reportingCurrency,
      ),
      baselineDailyOutflowMinor: Math.round(baselineDaily),
      baselineDailyOutflowLabel: currencyAmount(
        Math.round(baselineDaily),
        input.reportingCurrency,
      ),
      recentWindowDays: 14,
      baselineWindowDays: 60,
      topMerchant,
      topMerchantId,
    },
    fallback: {
      title: "Discretionary spend is running hot",
      summary: "The last 14 days are tracking above your usual discretionary pace.",
      detail: topMerchant
        ? `Recent discretionary outflow is about ${currencyAmount(Math.round(recentDaily), input.reportingCurrency)} a day versus ${currencyAmount(Math.round(baselineDaily), input.reportingCurrency)} before that, with ${topMerchant} showing up prominently.`
        : `Recent discretionary outflow is about ${currencyAmount(Math.round(recentDaily), input.reportingCurrency)} a day versus ${currencyAmount(Math.round(baselineDaily), input.reportingCurrency)} before that.`,
      whyNow: "Your recent discretionary average is materially above the 60-day baseline.",
    },
    memoryMerchantHints: topMerchant ? [topMerchant] : undefined,
    allowedActionTypes: ["open_activity_filtered", "navigate"],
    fallbackAction: topMerchantId
      ? {
          type: "open_activity_filtered",
          label: "Review merchant activity",
          href: buildActivityHref({
            merchantIds: [topMerchantId],
          }),
          merchantIds: [topMerchantId],
        }
      : {
          type: "open_activity_filtered",
          label: "Review activity",
          href: "/activity?view=outflow",
          view: "outflow",
        },
  }
}

function buildReviewBacklogCandidate(input: {
  openReviewCount: number
  now: Date
}): CandidateIssue | null {
  if (input.openReviewCount < 5) {
    return null
  }

  return {
    id: `review_backlog:${formatDateKey(input.now)}:${input.openReviewCount >= 10 ? "high" : "medium"}`,
    issueType: "review_backlog",
    priorityHint: input.openReviewCount >= 10 ? 1 : 2,
    dedupeSeed: `review_backlog:${formatDateKey(input.now)}:${input.openReviewCount >= 10 ? "high" : "medium"}`,
    validFrom: input.now,
    validUntil: addDays(input.now, 3),
    relatedMerchantId: null,
    relatedFinancialGoalId: null,
    payload: {
      openReviewCount: input.openReviewCount,
    },
    fallback: {
      title: "Your review queue needs attention",
      summary: `${input.openReviewCount} items are still waiting for a decision.`,
      detail: "Clearing ambiguous events will make forecasting, recurring detection, and advice more dependable.",
      whyNow: "Open review items are piling up and lowering confidence elsewhere.",
    },
    allowedActionTypes: ["open_review_queue", "navigate"],
    fallbackAction: {
      type: "open_review_queue",
      label: "Open review queue",
      href: "/review",
    },
  }
}

async function buildGoalSnapshotsAndCandidates(input: {
  userId: string
  goals: Awaited<ReturnType<typeof listFinancialGoalsForUser>>
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  now: Date
}) {
  const candidates: CandidateIssue[] = []
  const todayKey = formatDateKey(input.now)

  for (const row of input.goals) {
    if (row.goal.status !== "active") {
      continue
    }

    const targetDate = parseDateKey(row.goal.targetDate)
    const snapshots =
      input.forecast?.snapshots.filter(
        (snapshot) => parseDateKey(snapshot.snapshotDate) <= targetDate,
      ) ?? []

    const projectedSurplusMinor = sum(
      snapshots.map((snapshot) =>
        Math.max(
          0,
          (snapshot.projectedIncomeMinor ?? 0) -
            (snapshot.projectedFixedOutflowMinor ?? 0) -
            (snapshot.projectedEmiOutflowMinor ?? 0) -
            (snapshot.projectedVariableOutflowMinor ?? 0),
        ),
      ),
    )

    const savedAmountMinor = row.goal.startingAmountMinor ?? 0
    const projectedAmountMinor = savedAmountMinor + projectedSurplusMinor
    const gapAmountMinor = Math.max(row.goal.targetAmountMinor - projectedAmountMinor, 0)
    const confidence =
      input.forecast?.run.runType === "anchored"
        ? 0.82
        : input.forecast
          ? 0.62
          : 0.35

    await upsertGoalContributionSnapshot({
      financialGoalId: row.goal.id,
      snapshotDate: todayKey,
      savedAmountMinor,
      projectedAmountMinor,
      gapAmountMinor,
      confidence,
    })

    const daysUntilTarget = daysBetween(normalizeDateStart(input.now), normalizeDateStart(targetDate))
    const gapRatio = gapAmountMinor / row.goal.targetAmountMinor
    if (gapAmountMinor <= 0 || daysUntilTarget < 0) {
      continue
    }

    if (daysUntilTarget > 365 || gapRatio < 0.08) {
      continue
    }

    candidates.push({
      id: `goal_slippage:${row.goal.id}:${todayKey}:${Math.round(gapAmountMinor / 100)}`,
      issueType: "goal_slippage",
      priorityHint: daysUntilTarget <= 90 || gapRatio >= 0.35 ? 1 : 2,
      dedupeSeed: `goal_slippage:${row.goal.id}:${todayKey}:${Math.round(gapAmountMinor / 100)}`,
      validFrom: input.now,
      validUntil: targetDate,
      relatedMerchantId: null,
      relatedFinancialGoalId: row.goal.id,
      payload: {
        financialGoalId: row.goal.id,
        goalName: row.goal.name,
        goalType: row.goal.goalType,
        targetDate: row.goal.targetDate,
        currency: row.goal.currency,
        targetAmountMinor: row.goal.targetAmountMinor,
        targetAmountLabel: currencyAmount(row.goal.targetAmountMinor, row.goal.currency),
        savedAmountMinor,
        savedAmountLabel: currencyAmount(savedAmountMinor, row.goal.currency),
        projectedAmountMinor,
        projectedAmountLabel: currencyAmount(projectedAmountMinor, row.goal.currency),
        gapAmountMinor,
        gapAmountLabel: currencyAmount(gapAmountMinor, row.goal.currency),
        confidence,
        daysUntilTarget,
      },
      fallback: {
        title: `${row.goal.name} is slipping behind`,
        summary: `You are still about ${currencyAmount(gapAmountMinor, row.goal.currency)} short of ${row.goal.name}.`,
        detail: `At the current forecast pace, this goal projects to ${currencyAmount(projectedAmountMinor, row.goal.currency)} by ${humanDate(row.goal.targetDate)} against a target of ${currencyAmount(row.goal.targetAmountMinor, row.goal.currency)}.`,
        whyNow: "The current projection misses the target by a visible gap.",
      },
      allowedActionTypes: ["open_goal", "navigate"],
      fallbackAction: {
        type: "open_goal",
        label: "Open goal",
        goalId: row.goal.id,
        href: buildGoalHref(row.goal.id),
      },
    })
  }

  return candidates
}

function validateAdviceAction(input: {
  action: GeneratedAdviceAction | null | undefined
  candidate: CandidateIssue
  context: ValidationContext
}) {
  const { action, candidate, context } = input
  if (!action) {
    return null
  }

  if (!candidate.allowedActionTypes.includes(action.type)) {
    return null
  }

  switch (action.type) {
    case "refresh_advice":
      return {
        type: "refresh_advice",
        label: action.label,
      } satisfies AdviceItemAction

    case "open_review_queue":
      if (context.openReviewCount <= 0) {
        return null
      }

      return {
        type: "open_review_queue",
        label: action.label,
        href: "/review",
      } satisfies AdviceItemAction

    case "open_accounts_baseline":
      return {
        type: "open_accounts_baseline",
        label: action.label,
        href: "/settings/accounts/baseline",
      } satisfies AdviceItemAction

    case "open_goal": {
      const goalId = action.goalId ?? candidate.relatedFinancialGoalId
      if (!goalId || !context.activeGoalIds.has(goalId)) {
        return null
      }

      return {
        type: "open_goal",
        label: action.label,
        goalId,
        href: buildGoalHref(goalId),
      } satisfies AdviceItemAction
    }

    case "open_settings_subpage": {
      const href = action.href ?? (action.subpage ? buildSettingsHref(action.subpage) : null)
      const subpage = action.subpage ?? (href ? href.replace(/^\/settings\/?/, "") : null)

      if (!href || !subpage || !context.availableNavigationHrefs.has(href)) {
        return null
      }

      return {
        type: "open_settings_subpage",
        label: action.label,
        href,
        subpage,
      } satisfies AdviceItemAction
    }

    case "open_activity_filtered": {
      const merchantIds = (action.merchantIds ?? []).filter((merchantId) =>
        context.merchantIds.has(merchantId),
      )
      const eventTypes = (action.eventTypes ?? []).filter((eventType) =>
        [
          "purchase",
          "income",
          "subscription_charge",
          "emi_payment",
          "bill_payment",
          "refund",
          "transfer",
        ].includes(eventType),
      )
      const href =
        action.href ??
        buildActivityHref({
          view: action.view ?? undefined,
          merchantIds,
          eventTypes,
        })

      const hasConcreteFilter =
        (action.view && action.view !== "all") ||
        merchantIds.length > 0 ||
        eventTypes.length > 0

      if (!hasConcreteFilter) {
        return null
      }

      return {
        type: "open_activity_filtered",
        label: action.label,
        href,
        view: action.view ?? undefined,
        merchantIds: merchantIds.length > 0 ? merchantIds : undefined,
        eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      } satisfies AdviceItemAction
    }

    case "navigate":
      if (!action.href || !context.availableNavigationHrefs.has(action.href)) {
        return null
      }

      return {
        type: "navigate",
        label: action.label,
        href: action.href,
      } satisfies AdviceItemAction

    default:
      return null
  }
}

function buildPersistableAdviceFromFallback(input: {
  candidate: CandidateIssue
  refreshReason: AdviceRefreshReason
}) {
  return {
    triggerType: input.candidate.issueType,
    priority: input.candidate.priorityHint,
    dedupeKey: input.candidate.dedupeSeed,
    validFrom: input.candidate.validFrom,
    validUntil: input.candidate.validUntil,
    relatedMerchantId: input.candidate.relatedMerchantId,
    relatedFinancialGoalId: input.candidate.relatedFinancialGoalId,
    title: input.candidate.fallback.title,
    summary: input.candidate.fallback.summary,
    detail: input.candidate.fallback.detail,
    evidenceJson: {
      candidateIssueId: input.candidate.id,
      issueType: input.candidate.issueType,
      whyNow: input.candidate.fallback.whyNow ?? null,
      refreshReason: input.refreshReason,
      payload: input.candidate.payload,
      fallback: true,
    },
    primaryActionJson: input.candidate.fallbackAction ?? null,
    secondaryActionJson: null,
  } satisfies PersistableAdvice
}

function buildPromptContext(input: {
  now: Date
  timeZone: string
  reportingCurrency: string
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  recurring: Awaited<ReturnType<typeof listRecurringObligationsForUser>>
  incomeStreams: Awaited<ReturnType<typeof listIncomeStreamsForUser>>
  events: Awaited<ReturnType<typeof listLedgerEventsForUser>>
  goals: Awaited<ReturnType<typeof listFinancialGoalsForUser>>
  openReviewCount: number
  candidateIssues: CandidateIssue[]
  currentOpenAdvice: Awaited<ReturnType<typeof listAdviceItemsForUser>>
  availableNavigationHrefs: Set<string>
}) {
  const recentOutflows = input.events
    .filter(({ event }) => event.direction === "outflow" && !event.isTransfer)
    .slice(0, 12)
    .map(({ event, merchant, category }) => ({
      eventId: event.id,
      occurredAt: event.eventOccurredAt.toISOString(),
      amountMinor: event.amountMinor,
      amountLabel: currencyAmount(event.amountMinor, event.currency),
      currency: event.currency,
      merchantName: merchant?.displayName ?? null,
      merchantId: merchant?.id ?? null,
      categoryName: category?.name ?? null,
      eventType: event.eventType,
    }))

  return {
    generatedAt: input.now.toISOString(),
    timeZone: input.timeZone,
    reportingCurrency: input.reportingCurrency,
    forecast: input.forecast
      ? {
          runId: input.forecast.run.id,
          runType: input.forecast.run.runType,
          status: input.forecast.run.status,
          horizonDays: input.forecast.run.horizonDays,
          upcomingSnapshots: input.forecast.snapshots.slice(0, 10).map((snapshot) => ({
            snapshotDate: snapshot.snapshotDate,
            projectedBalanceMinor: snapshot.projectedBalanceMinor,
            projectedBalanceLabel:
              snapshot.projectedBalanceMinor !== null
                ? currencyAmount(snapshot.projectedBalanceMinor, input.reportingCurrency)
                : null,
            safeToSpendMinor: snapshot.safeToSpendMinor,
            safeToSpendLabel:
              snapshot.safeToSpendMinor !== null
                ? currencyAmount(snapshot.safeToSpendMinor, input.reportingCurrency)
                : null,
            projectedIncomeMinor: snapshot.projectedIncomeMinor,
            projectedFixedOutflowMinor: snapshot.projectedFixedOutflowMinor,
            projectedVariableOutflowMinor: snapshot.projectedVariableOutflowMinor,
            projectedEmiOutflowMinor: snapshot.projectedEmiOutflowMinor,
          })),
        }
      : null,
    recurringSummary: {
      activeCount: input.recurring.filter((row) => row.obligation.status === "active").length,
      merchants: uniqueNonEmpty(input.recurring.map((row) => row.merchant?.displayName)).slice(0, 8),
    },
    incomeSummary: input.incomeStreams
      .filter((row) => row.incomeStream.status === "active")
      .slice(0, 8)
      .map((row) => ({
        incomeStreamId: row.incomeStream.id,
        name: row.incomeStream.name,
        nextExpectedAt: row.incomeStream.nextExpectedAt?.toISOString() ?? null,
        expectedAmountLabel:
          row.incomeStream.expectedAmountMinor !== null
            ? currencyAmount(
                row.incomeStream.expectedAmountMinor,
                row.incomeStream.currency ?? "INR",
              )
            : null,
      })),
    goalSummary: input.goals
      .filter((row) => row.goal.status === "active")
      .slice(0, 8)
      .map((row) => ({
        goalId: row.goal.id,
        name: row.goal.name,
        goalType: row.goal.goalType,
        targetDate: row.goal.targetDate,
        targetAmountLabel: currencyAmount(row.goal.targetAmountMinor, row.goal.currency),
      })),
    reviewBacklog: {
      openReviewCount: input.openReviewCount,
    },
    recentOutflows,
    candidateIssues: input.candidateIssues.map((candidate) => ({
      id: candidate.id,
      issueType: candidate.issueType,
      priorityHint: candidate.priorityHint,
      validUntil: candidate.validUntil?.toISOString() ?? null,
      relatedMerchantId: candidate.relatedMerchantId,
      relatedFinancialGoalId: candidate.relatedFinancialGoalId,
      payload: candidate.payload,
      fallbackTitle: candidate.fallback.title,
      fallbackSummary: candidate.fallback.summary,
      allowedActionTypes: candidate.allowedActionTypes,
      fallbackAction: candidate.fallbackAction ?? null,
    })),
    currentOpenAdvice: input.currentOpenAdvice.map(({ adviceItem, merchant, goal }) => ({
      adviceItemId: adviceItem.id,
      triggerType: adviceItem.triggerType,
      title: adviceItem.title,
      summary: adviceItem.summary,
      priority: adviceItem.priority,
      merchantName: merchant?.displayName ?? null,
      goalName: goal?.name ?? null,
    })),
    availableNavigationHrefs: [...input.availableNavigationHrefs].sort(),
  }
}

async function generatePersistableAdviceWithAi(input: {
  userId: string
  refreshReason: AdviceRefreshReason
  promptContext: Record<string, unknown>
  memorySummary: string[]
  candidateIssues: CandidateIssue[]
  validationContext: ValidationContext
}): Promise<{
  advice: PersistableAdvice[]
  sourceModelRunId: string | null
}> {
  const candidateIssueMap = new Map(input.candidateIssues.map((candidate) => [candidate.id, candidate]))
  let modelRunId: string | null = null

  try {
    const modelRun = await createModelRun({
      userId: input.userId,
      taskType: "advice_generation",
      provider: "ai-gateway",
      modelName: aiModels.financeAdviceGenerator,
      promptVersion: aiPromptVersions.financeAdviceGenerator,
      status: "running",
    })
    modelRunId = modelRun.id

    const generated = await generateAdviceDecisionsWithAi({
      promptContext: input.promptContext,
      memorySummary: input.memorySummary,
    })

    const persistedAdvice = generated.decision.adviceItems
      .filter((item) => item.shouldCreateAdvice)
      .map((item) => {
        const matchingCandidates = item.evidenceRefs
          .map((ref) => candidateIssueMap.get(ref))
          .filter((candidate): candidate is CandidateIssue => Boolean(candidate))
        const sameTypeCandidates = input.candidateIssues.filter(
          (candidate) => candidate.issueType === item.issueType,
        )

        if (matchingCandidates.length === 0 && sameTypeCandidates.length > 1) {
          return null
        }

        const primaryCandidate =
          matchingCandidates.find((candidate) => candidate.issueType === item.issueType) ??
          input.candidateIssues.find((candidate) => candidate.issueType === item.issueType)

        if (!primaryCandidate) {
          return null
        }

        const priority = clampPriority(item.priority)
        const primaryAction = validateAdviceAction({
          action: item.primaryAction,
          candidate: primaryCandidate,
          context: input.validationContext,
        })
        const secondaryAction = validateAdviceAction({
          action: item.secondaryAction,
          candidate: primaryCandidate,
          context: input.validationContext,
        })
        const normalizedHint = slugify(item.dedupeKeyHint)
        const semanticObjectId =
          primaryCandidate.relatedFinancialGoalId ??
          primaryCandidate.relatedMerchantId ??
          primaryCandidate.id

        return {
          triggerType: primaryCandidate.issueType,
          priority,
          dedupeKey: `${primaryCandidate.issueType}:${semanticObjectId}:${normalizedHint || "ai"}`,
          validFrom: primaryCandidate.validFrom,
          validUntil: primaryCandidate.validUntil,
          relatedMerchantId: primaryCandidate.relatedMerchantId,
          relatedFinancialGoalId: primaryCandidate.relatedFinancialGoalId,
          title: item.title,
          summary: item.summary,
          detail: item.detail,
          evidenceJson: {
            refreshReason: input.refreshReason,
            issueType: primaryCandidate.issueType,
            whyNow: item.whyNow ?? null,
            evidenceRefs: matchingCandidates.map((candidate) => candidate.id),
            reasonNoAction:
              !primaryAction && !secondaryAction ? (item.reasonNoAction ?? null) : null,
            candidates: matchingCandidates.map((candidate) => ({
              id: candidate.id,
              payload: candidate.payload,
            })),
          },
          primaryActionJson: primaryAction,
          secondaryActionJson: secondaryAction,
        } satisfies PersistableAdvice
      })
      .filter((item) => item !== null)
      .slice(0, MAX_AI_ADVICE_ITEMS)

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: generated.metadata.provider,
      modelName: generated.metadata.modelName,
      promptVersion: generated.metadata.promptVersion,
      inputTokens: generated.metadata.inputTokens,
      outputTokens: generated.metadata.outputTokens,
      latencyMs: generated.metadata.latencyMs,
      requestId: generated.metadata.requestId,
      resultJson: {
        recovery: generated.recovery,
        promptContextSummary: {
          candidateCount: input.candidateIssues.length,
          currentAdviceCount:
            Array.isArray(
              (input.promptContext as { currentOpenAdvice?: unknown[] }).currentOpenAdvice,
            )
              ? ((input.promptContext as { currentOpenAdvice?: unknown[] }).currentOpenAdvice?.length ??
                  0)
              : 0,
        },
        generatedAdvice: generated.decision.adviceItems,
        persistedAdvice,
      },
    })

    return {
      advice: persistedAdvice,
      sourceModelRunId: modelRun.id,
    }
  } catch (error) {
    if (modelRunId) {
      await updateModelRun(modelRunId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }

    logger.warn("AI advice generation failed; using deterministic fallback", {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      advice: input.candidateIssues
        .sort((left, right) => left.priorityHint - right.priorityHint)
        .slice(0, 3)
        .map((candidate) =>
          buildPersistableAdviceFromFallback({
            candidate,
            refreshReason: input.refreshReason,
          }),
        ),
      sourceModelRunId: null,
    }
  }
}

export async function refreshAdviceForUser(input: {
  userId: string
  reason: AdviceRefreshReason
}) {
  const now = new Date()
  const [settings, forecast, recurring, incomeStreams, events, openReviewCount, goals, currentOpenAdvice] =
    await Promise.all([
      getUserSettings(input.userId),
      getLatestForecastRunWithSnapshots(input.userId),
      listRecurringObligationsForUser({
        userId: input.userId,
        status: "active",
        limit: 40,
      }),
      listIncomeStreamsForUser({
        userId: input.userId,
        status: "active",
        limit: 20,
      }),
      listLedgerEventsForUser({
        userId: input.userId,
        dateFrom: addDays(now, -74),
        limit: 400,
      }),
      countOpenReviewQueueItemsForUser(input.userId),
      listFinancialGoalsForUser({
        userId: input.userId,
        statuses: ["active", "completed", "archived"],
        limit: 60,
      }),
      listAdviceItemsForUser({
        userId: input.userId,
        statuses: ["active"],
        limit: 20,
      }),
    ])

  const candidateIssues: CandidateIssue[] = []

  const lowCash = buildLowCashProjectionCandidate({
    forecast,
    reportingCurrency: settings.reportingCurrency,
    now,
  })
  if (lowCash) {
    candidateIssues.push(lowCash)
  }

  const recurringPressure = buildRecurringPressureCandidate({
    forecast,
    recurring,
    reportingCurrency: settings.reportingCurrency,
    now,
  })
  if (recurringPressure) {
    candidateIssues.push(recurringPressure)
  }

  candidateIssues.push(...buildDelayedIncomeCandidates({ incomeStreams, now }))

  const overspending = buildDiscretionaryOverspendingCandidate({
    events,
    reportingCurrency: settings.reportingCurrency,
    now,
  })
  if (overspending) {
    candidateIssues.push(overspending)
  }

  const reviewBacklog = buildReviewBacklogCandidate({ openReviewCount, now })
  if (reviewBacklog) {
    candidateIssues.push(reviewBacklog)
  }

  candidateIssues.push(
    ...(await buildGoalSnapshotsAndCandidates({
      userId: input.userId,
      goals,
      forecast,
      now,
    })),
  )

  const allMerchantHints = uniqueNonEmpty(
    candidateIssues.flatMap((candidate) => candidate.memoryMerchantHints ?? []),
  )
  const memory = await getMemoryBundleForUser({
    userId: input.userId,
    merchantHints: allMerchantHints,
  })

  const activeGoalIds = goals
    .filter((row) => row.goal.status === "active")
    .map((row) => row.goal.id)
  const merchantIds = uniqueNonEmpty([
    ...events.map(({ merchant }) => merchant?.id),
    ...recurring.map(({ merchant }) => merchant?.id),
    ...incomeStreams.map(({ merchant }) => merchant?.id),
  ])
  const availableNavigationHrefs = buildAvailableNavigationHrefs({
    activeGoalIds,
  })

  const promptContext = buildPromptContext({
    now,
    timeZone: settings.timeZone,
    reportingCurrency: settings.reportingCurrency,
    forecast,
    recurring,
    incomeStreams,
    events,
    goals,
    openReviewCount,
    candidateIssues,
    currentOpenAdvice,
    availableNavigationHrefs,
  })

  const generated = await generatePersistableAdviceWithAi({
    userId: input.userId,
    refreshReason: input.reason,
    promptContext,
    memorySummary: memory.summaryLines.slice(0, 12),
    candidateIssues,
    validationContext: {
      activeGoalIds: new Set(activeGoalIds),
      merchantIds: new Set(merchantIds),
      openReviewCount,
      availableNavigationHrefs,
    },
  })

  for (const advice of generated.advice) {
    await upsertAdviceItem({
      userId: input.userId,
      triggerType: advice.triggerType,
      status: "active",
      priority: advice.priority,
      dedupeKey: advice.dedupeKey,
      title: advice.title,
      summary: advice.summary,
      detail: advice.detail,
      primaryActionJson: advice.primaryActionJson,
      secondaryActionJson: advice.secondaryActionJson,
      relatedMerchantId: advice.relatedMerchantId,
      relatedFinancialGoalId: advice.relatedFinancialGoalId,
      evidenceJson: advice.evidenceJson,
      sourceModelRunId: generated.sourceModelRunId,
      validFrom: advice.validFrom,
      validUntil: advice.validUntil,
    })
  }

  const expired = await expireMissingAdviceItems({
    userId: input.userId,
    activeDedupeKeys: generated.advice.map((advice) => advice.dedupeKey),
  })

  return {
    userId: input.userId,
    adviceCount: generated.advice.length,
    candidateCount: candidateIssues.length,
    expiredCount: expired.length,
    reason: input.reason,
    forecastRunId: forecast?.run.id ?? null,
    activeGoalCount: goals.filter((row) => row.goal.status === "active").length,
    openReviewCount,
  }
}

function buildAdviceRankingPromptContext(input: {
  reportingCurrency: string
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  activeAdvice: ActiveAdviceRow[]
}) {
  return {
    reportingCurrency: input.reportingCurrency,
    forecast: input.forecast
      ? {
          runId: input.forecast.run.id,
          runType: input.forecast.run.runType,
          confidenceLabel:
            input.forecast.run.runType === "anchored" ? "higher" : "limited",
          topSnapshotDates: input.forecast.snapshots.slice(0, 5).map((snapshot) => ({
            snapshotDate: snapshot.snapshotDate,
            safeToSpendMinor: snapshot.safeToSpendMinor,
            projectedBalanceMinor: snapshot.projectedBalanceMinor,
          })),
        }
      : null,
    activeAdvice: input.activeAdvice.map(({ adviceItem, merchant, goal }) => ({
      adviceItemId: adviceItem.id,
      title: adviceItem.title,
      summary: adviceItem.summary,
      detail: adviceItem.detail,
      triggerType: adviceItem.triggerType,
      priority: adviceItem.priority,
      updatedAt: adviceItem.updatedAt.toISOString(),
      merchantName: merchant?.displayName ?? null,
      goalName: goal?.name ?? null,
      hasPrimaryAction: Boolean(adviceItem.primaryActionJson),
      hasSecondaryAction: Boolean(adviceItem.secondaryActionJson),
    })),
  }
}

export async function rankAdviceForUser(input: {
  userId: string
  reason: "hourly_rank" | "post_refresh_rank" | "manual_rank"
}) {
  const [settings, forecast, activeAdvice] = await Promise.all([
    getUserSettings(input.userId),
    getLatestForecastRunWithSnapshots(input.userId),
    listAdviceItemsForUser({
      userId: input.userId,
      statuses: ["active"],
      limit: 24,
    }),
  ])

  if (activeAdvice.length === 0) {
    await clearAdviceHomeRankingForUser(input.userId)
    return {
      userId: input.userId,
      reason: input.reason,
      rankedCount: 0,
      skipped: true,
      skipReason: "no_active_advice",
    }
  }

  const promptContext = buildAdviceRankingPromptContext({
    reportingCurrency: settings.reportingCurrency,
    forecast,
    activeAdvice,
  })

  let modelRunId: string | null = null

  try {
    const modelRun = await createModelRun({
      userId: input.userId,
      taskType: "advice_ranking",
      provider: "ai-gateway",
      modelName: aiModels.financeAdviceGenerator,
      promptVersion: `${aiPromptVersions.financeAdviceGenerator}-ranking-v1`,
      status: "running",
    })
    modelRunId = modelRun.id

    const ranking = await rankAdviceForHomeWithAi({
      promptContext,
    })

    const allowedIds = new Set(activeAdvice.map(({ adviceItem }) => adviceItem.id))
    const dedupedIds = new Set<string>()
    const normalizedRankings = ranking.ranking.rankedAdvice
      .filter((row) => allowedIds.has(row.adviceItemId))
      .filter((row) => {
        if (dedupedIds.has(row.adviceItemId)) {
          return false
        }
        dedupedIds.add(row.adviceItemId)
        return true
      })
      .sort((left, right) => left.position - right.position)
      .slice(0, MAX_HOME_RANKED_ADVICE_ITEMS)
      .map((row, index) => ({
        adviceItemId: row.adviceItemId,
        position: (index + 1) as 1 | 2 | 3,
        score: row.score,
      }))

    await applyAdviceHomeRanking({
      userId: input.userId,
      rankings: normalizedRankings,
      rankedAt: new Date(),
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: ranking.metadata.provider,
      modelName: ranking.metadata.modelName,
      promptVersion: ranking.metadata.promptVersion,
      inputTokens: ranking.metadata.inputTokens,
      outputTokens: ranking.metadata.outputTokens,
      latencyMs: ranking.metadata.latencyMs,
      requestId: ranking.metadata.requestId,
      resultJson: {
        recovery: ranking.recovery,
        activeAdviceCount: activeAdvice.length,
        rankedAdvice: ranking.ranking.rankedAdvice,
        appliedRankings: normalizedRankings,
      },
    })

    return {
      userId: input.userId,
      reason: input.reason,
      rankedCount: normalizedRankings.length,
      skipped: false,
    }
  } catch (error) {
    if (modelRunId) {
      await updateModelRun(modelRunId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }

    logger.warn("Advice ranking failed; clearing home ranking", {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    })

    await clearAdviceHomeRankingForUser(input.userId)

    return {
      userId: input.userId,
      reason: input.reason,
      rankedCount: 0,
      skipped: true,
      skipReason: "ranking_failed",
    }
  }
}
