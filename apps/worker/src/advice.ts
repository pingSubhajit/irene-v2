import {
  countOpenReviewQueueItemsForUser,
  createModelRun,
  expireMissingAdviceItems,
  getLatestForecastRunWithSnapshots,
  getMemoryBundleForUser,
  listFinancialGoalsForUser,
  listIncomeStreamsForUser,
  listLedgerEventsForUser,
  listRecurringObligationsForUser,
  updateModelRun,
  upsertAdviceItem,
  upsertGoalContributionSnapshot,
  type AdviceItemPriority,
  type AdviceItemTriggerType,
} from "@workspace/db"
import { aiModels, aiPromptVersions, phraseAdviceWithAi } from "@workspace/ai"
import { createLogger } from "@workspace/observability"

const logger = createLogger("worker.advice")

const DAY_MS = 24 * 60 * 60 * 1000

type AdviceRefreshReason =
  | "forecast_changed"
  | "goals_changed"
  | "manual_refresh"
  | "nightly_rebuild"
  | "startup_rebuild"
  | "manual_rebuild"
  | "logic_change"

type TriggerCandidate = {
  triggerType: AdviceItemTriggerType
  priority: AdviceItemPriority
  dedupeKey: string
  validFrom: Date
  validUntil: Date | null
  relatedMerchantId: string | null
  relatedFinancialGoalId: string | null
  payload: Record<string, unknown>
  fallback: {
    title: string
    summary: string
    detail: string
  }
  memoryMerchantHints?: string[]
}

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

function buildLowCashProjectionTrigger(input: {
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  now: Date
}): TriggerCandidate | null {
  if (!input.forecast || input.forecast.run.runType !== "anchored") {
    return null
  }

  const urgentSnapshot = input.forecast.snapshots.find((snapshot) => {
    const date = parseDateKey(snapshot.snapshotDate)
    const daysAhead = daysBetween(normalizeDateStart(input.now), normalizeDateStart(date))
    if (daysAhead < 0 || daysAhead > 14) {
      return false
    }

    return (
      (snapshot.safeToSpendMinor ?? 0) < 0 ||
      (snapshot.projectedBalanceMinor ?? Number.MAX_SAFE_INTEGER) < 0
    )
  })

  if (!urgentSnapshot) {
    return null
  }

  const priority: AdviceItemPriority =
    (urgentSnapshot.projectedBalanceMinor ?? 0) < 0 ||
    (urgentSnapshot.safeToSpendMinor ?? 0) < -5000
      ? 1
      : 2

  const negativeBalance =
    urgentSnapshot.projectedBalanceMinor !== null &&
    urgentSnapshot.projectedBalanceMinor < 0

  return {
    triggerType: "low_cash_projection",
    priority,
    dedupeKey: `low_cash_projection:${input.forecast.run.id}:${urgentSnapshot.snapshotDate}`,
    validFrom: input.now,
    validUntil: addDays(parseDateKey(urgentSnapshot.snapshotDate), 7),
    relatedMerchantId: null,
    relatedFinancialGoalId: null,
    payload: {
      runType: input.forecast.run.runType,
      forecastRunId: input.forecast.run.id,
      snapshotDate: urgentSnapshot.snapshotDate,
      projectedBalanceMinor: urgentSnapshot.projectedBalanceMinor,
      safeToSpendMinor: urgentSnapshot.safeToSpendMinor,
      projectedIncomeMinor: urgentSnapshot.projectedIncomeMinor,
      projectedFixedOutflowMinor: urgentSnapshot.projectedFixedOutflowMinor,
      projectedVariableOutflowMinor: urgentSnapshot.projectedVariableOutflowMinor,
      projectedEmiOutflowMinor: urgentSnapshot.projectedEmiOutflowMinor,
    },
    fallback: {
      title: negativeBalance
        ? "Projected cash turns negative soon"
        : "Safe-to-spend is already tight",
      summary: negativeBalance
        ? `Your projected balance could dip below zero around ${humanDate(urgentSnapshot.snapshotDate)}.`
        : `Safe-to-spend is already below zero for ${humanDate(urgentSnapshot.snapshotDate)}.`,
      detail: `The latest anchored forecast shows projected balance ${urgentSnapshot.projectedBalanceMinor !== null ? currencyAmount(urgentSnapshot.projectedBalanceMinor) : "still uncertain"} and safe-to-spend ${urgentSnapshot.safeToSpendMinor !== null ? currencyAmount(urgentSnapshot.safeToSpendMinor) : "still unclear"} by ${humanDate(urgentSnapshot.snapshotDate)}.`,
    },
  }
}

function buildRecurringPressureTrigger(input: {
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  recurring: Awaited<ReturnType<typeof listRecurringObligationsForUser>>
  now: Date
}): TriggerCandidate | null {
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
    triggerType: "rising_recurring_obligations",
    priority: share !== null && share >= 0.55 ? 1 : 2,
    dedupeKey: `rising_recurring_obligations:${input.forecast.run.id}:${activeRecurring.length}:${fixedOutflowMinor}`,
    validFrom: input.now,
    validUntil: addDays(input.now, 14),
    relatedMerchantId: activeRecurring[0]?.merchant?.id ?? null,
    relatedFinancialGoalId: null,
    payload: {
      forecastRunId: input.forecast.run.id,
      activeRecurringCount: activeRecurring.length,
      recurringMerchants: merchants,
      upcoming30DayFixedOutflowMinor: fixedOutflowMinor,
      upcoming30DayIncomeMinor: projectedIncomeMinor,
      fixedOutflowShareOfIncome: share,
    },
    fallback: {
      title: "Recurring commitments are stacking up",
      summary: `About ${currencyAmount(fixedOutflowMinor)} in fixed obligations are expected over the next 30 days.`,
      detail:
        merchants.length > 0
          ? `Recurring outflows from ${merchants.join(", ")} are taking a larger share of the next month than usual.`
          : "Your active subscriptions, bills, and EMI obligations are taking a larger share of the next month.",
    },
    memoryMerchantHints: merchants,
  }
}

function buildDelayedIncomeTriggers(input: {
  incomeStreams: Awaited<ReturnType<typeof listIncomeStreamsForUser>>
  now: Date
}) {
  return input.incomeStreams
    .filter((row) => row.incomeStream.status === "active" && row.incomeStream.nextExpectedAt)
    .flatMap((row): TriggerCandidate[] => {
      const nextExpectedAt = row.incomeStream.nextExpectedAt
      if (!nextExpectedAt) {
        return []
      }

      const daysLate = daysBetween(normalizeDateStart(nextExpectedAt), normalizeDateStart(input.now))
      if (daysLate < 3) {
        return []
      }

      const priority: AdviceItemPriority = daysLate >= 7 ? 1 : 2
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
          triggerType: "delayed_income",
          priority,
          dedupeKey: `delayed_income:${row.incomeStream.id}:${formatDateKey(nextExpectedAt)}`,
          validFrom: input.now,
          validUntil: addDays(input.now, 7),
          relatedMerchantId: row.merchant?.id ?? null,
          relatedFinancialGoalId: null,
          payload: {
            incomeStreamId: row.incomeStream.id,
            incomeStreamName: streamName,
            expectedAmountMinor: row.incomeStream.expectedAmountMinor,
            currency: row.incomeStream.currency,
            nextExpectedAt: nextExpectedAt.toISOString(),
            daysLate,
            cadence: row.incomeStream.cadence,
          },
          fallback: {
            title: `${streamName} looks delayed`,
            summary: `${streamName} was expected around ${humanDate(nextExpectedAt)} and still has not clearly arrived.`,
            detail: `${amountLabel} from this income stream now looks ${daysLate} days late against the current schedule.`,
          },
          memoryMerchantHints: row.merchant?.displayName
            ? [row.merchant.displayName]
            : undefined,
        },
      ]
    })
}

function buildDiscretionaryOverspendingTrigger(input: {
  events: Awaited<ReturnType<typeof listLedgerEventsForUser>>
  now: Date
}): TriggerCandidate | null {
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

  const topMerchant = recent
    .map((row) => row.merchant?.displayName)
    .filter((value): value is string => Boolean(value))
    .sort((left: string, right: string) => {
      const total = (name: string) =>
        recent
          .filter((row) => row.merchant?.displayName === name)
          .reduce((sumValue, row) => sumValue + row.event.amountMinor, 0)

      return total(right) - total(left)
    })[0] ?? null

  return {
    triggerType: "discretionary_overspending",
    priority: recentDaily >= baselineDaily * 1.75 ? 1 : 2,
    dedupeKey: `discretionary_overspending:${formatDateKey(input.now)}:${Math.round(recentDaily)}`,
    validFrom: input.now,
    validUntil: addDays(input.now, 7),
    relatedMerchantId:
      recent.find((row) => row.merchant?.displayName === topMerchant)?.merchant?.id ?? null,
    relatedFinancialGoalId: null,
    payload: {
      recentDailyOutflowMinor: Math.round(recentDaily),
      baselineDailyOutflowMinor: Math.round(baselineDaily),
      recentWindowDays: 14,
      baselineWindowDays: 60,
      topMerchant,
    },
    fallback: {
      title: "Discretionary spend is running hot",
      summary: `The last 14 days are tracking above your usual discretionary pace.`,
      detail: topMerchant
        ? `Recent discretionary outflow is about ${currencyAmount(Math.round(recentDaily))} a day versus ${currencyAmount(Math.round(baselineDaily))} before that, with ${topMerchant} showing up prominently.`
        : `Recent discretionary outflow is about ${currencyAmount(Math.round(recentDaily))} a day versus ${currencyAmount(Math.round(baselineDaily))} before that.`,
    },
    memoryMerchantHints: topMerchant ? [topMerchant] : undefined,
  }
}

function buildReviewBacklogTrigger(input: {
  openReviewCount: number
  now: Date
}): TriggerCandidate | null {
  if (input.openReviewCount < 5) {
    return null
  }

  return {
    triggerType: "review_backlog",
    priority: input.openReviewCount >= 10 ? 1 : 2,
    dedupeKey: `review_backlog:${formatDateKey(input.now)}:${input.openReviewCount >= 10 ? "high" : "medium"}`,
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
    },
  }
}

async function buildGoalSnapshotsAndTriggers(input: {
  userId: string
  goals: Awaited<ReturnType<typeof listFinancialGoalsForUser>>
  forecast: Awaited<ReturnType<typeof getLatestForecastRunWithSnapshots>>
  now: Date
}) {
  const triggers: TriggerCandidate[] = []
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

    triggers.push({
      triggerType: "goal_slippage",
      priority: daysUntilTarget <= 90 || gapRatio >= 0.35 ? 1 : 2,
      dedupeKey: `goal_slippage:${row.goal.id}:${todayKey}:${Math.round(gapAmountMinor / 100)}`,
      validFrom: input.now,
      validUntil: targetDate,
      relatedMerchantId: null,
      relatedFinancialGoalId: row.goal.id,
      payload: {
        financialGoalId: row.goal.id,
        goalName: row.goal.name,
        goalType: row.goal.goalType,
        targetDate: row.goal.targetDate,
        targetAmountMinor: row.goal.targetAmountMinor,
        savedAmountMinor,
        projectedAmountMinor,
        gapAmountMinor,
        confidence,
        daysUntilTarget,
      },
      fallback: {
        title: `${row.goal.name} is slipping behind`,
        summary: `You are still about ${currencyAmount(gapAmountMinor, row.goal.currency)} short of ${row.goal.name}.`,
        detail: `At the current forecast pace, this goal projects to ${currencyAmount(projectedAmountMinor, row.goal.currency)} by ${humanDate(row.goal.targetDate)} against a target of ${currencyAmount(row.goal.targetAmountMinor, row.goal.currency)}.`,
      },
    })
  }

  return triggers
}

async function phraseTriggerWithAi(input: {
  userId: string
  trigger: TriggerCandidate
  memorySummary: string[]
}) {
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

    const phrased = await phraseAdviceWithAi({
      triggerType: input.trigger.triggerType,
      payload: input.trigger.payload,
      memorySummary: input.memorySummary,
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: phrased.metadata.provider,
      modelName: phrased.metadata.modelName,
      promptVersion: phrased.metadata.promptVersion,
      inputTokens: phrased.metadata.inputTokens,
      outputTokens: phrased.metadata.outputTokens,
      latencyMs: phrased.metadata.latencyMs,
      requestId: phrased.metadata.requestId,
      resultJson: {
        recovery: phrased.recovery,
        triggerType: input.trigger.triggerType,
        payload: input.trigger.payload,
      },
    })

    return {
      title: phrased.phrase.title,
      summary: phrased.phrase.summary,
      detail: phrased.phrase.nextStep
        ? `${phrased.phrase.detail}\n\nNext step: ${phrased.phrase.nextStep}`
        : phrased.phrase.detail,
      sourceModelRunId: modelRun.id,
    }
  } catch (error) {
    if (modelRunId) {
      await updateModelRun(modelRunId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }

    logger.warn("Advice phrasing failed; using deterministic fallback", {
      userId: input.userId,
      triggerType: input.trigger.triggerType,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      ...input.trigger.fallback,
      sourceModelRunId: null,
    }
  }
}

export async function refreshAdviceForUser(input: {
  userId: string
  reason: AdviceRefreshReason
}) {
  const now = new Date()
  const [forecast, recurring, incomeStreams, events, openReviewCount, goals] = await Promise.all([
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
  ])

  const triggers: TriggerCandidate[] = []

  const lowCash = buildLowCashProjectionTrigger({ forecast, now })
  if (lowCash) {
    triggers.push(lowCash)
  }

  const recurringPressure = buildRecurringPressureTrigger({
    forecast,
    recurring,
    now,
  })
  if (recurringPressure) {
    triggers.push(recurringPressure)
  }

  triggers.push(...buildDelayedIncomeTriggers({ incomeStreams, now }))

  const overspending = buildDiscretionaryOverspendingTrigger({ events, now })
  if (overspending) {
    triggers.push(overspending)
  }

  const reviewBacklog = buildReviewBacklogTrigger({ openReviewCount, now })
  if (reviewBacklog) {
    triggers.push(reviewBacklog)
  }

  const goalTriggers = await buildGoalSnapshotsAndTriggers({
    userId: input.userId,
    goals,
    forecast,
    now,
  })
  triggers.push(...goalTriggers)

  const allMerchantHints = uniqueNonEmpty(triggers.flatMap((trigger) => trigger.memoryMerchantHints ?? []))
  const memory = await getMemoryBundleForUser({
    userId: input.userId,
    merchantHints: allMerchantHints,
  })

  for (const trigger of triggers) {
    const phrased = await phraseTriggerWithAi({
      userId: input.userId,
      trigger,
      memorySummary: memory.summaryLines.slice(0, 10),
    })

    await upsertAdviceItem({
      userId: input.userId,
      triggerType: trigger.triggerType,
      status: "active",
      priority: trigger.priority,
      dedupeKey: trigger.dedupeKey,
      title: phrased.title,
      summary: phrased.summary,
      detail: phrased.detail,
      relatedMerchantId: trigger.relatedMerchantId,
      relatedFinancialGoalId: trigger.relatedFinancialGoalId,
      evidenceJson: {
        ...trigger.payload,
        refreshReason: input.reason,
      },
      sourceModelRunId: phrased.sourceModelRunId,
      validFrom: trigger.validFrom,
      validUntil: trigger.validUntil,
    })
  }

  const expired = await expireMissingAdviceItems({
    userId: input.userId,
    activeDedupeKeys: triggers.map((trigger) => trigger.dedupeKey),
  })

  return {
    userId: input.userId,
    triggerCount: triggers.length,
    expiredCount: expired.length,
    reason: input.reason,
    forecastRunId: forecast?.run.id ?? null,
    activeGoalCount: goals.filter((row) => row.goal.status === "active").length,
    openReviewCount,
  }
}
