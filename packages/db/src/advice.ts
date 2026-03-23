import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm"

import { db } from "./client"
import {
  adviceItems,
  categories,
  financialGoals,
  forecastRuns,
  goalContributionSnapshots,
  merchants,
  type AdviceItemInsert,
  type AdviceItemSelect,
  type FinancialGoalInsert,
  type FinancialGoalSelect,
  type GoalContributionSnapshotInsert,
} from "./schema"

export async function createFinancialGoal(input: FinancialGoalInsert) {
  const [row] = await db.insert(financialGoals).values(input).returning()

  if (!row) {
    throw new Error("Failed to create financial goal")
  }

  return row
}

export async function updateFinancialGoal(
  financialGoalId: string,
  input: Partial<FinancialGoalInsert>,
) {
  const [row] = await db
    .update(financialGoals)
    .set({
      goalType: input.goalType ?? undefined,
      status: input.status ?? undefined,
      name: input.name ?? undefined,
      targetAmountMinor: input.targetAmountMinor ?? undefined,
      startingAmountMinor: input.startingAmountMinor ?? undefined,
      currency: input.currency ?? undefined,
      targetDate: input.targetDate ?? undefined,
      linkedCategoryId:
        input.linkedCategoryId === null ? null : (input.linkedCategoryId ?? undefined),
      contributionRuleJson: input.contributionRuleJson ?? undefined,
      notes: input.notes === null ? null : (input.notes ?? undefined),
      completedAt: input.completedAt === null ? null : (input.completedAt ?? undefined),
      archivedAt: input.archivedAt === null ? null : (input.archivedAt ?? undefined),
      updatedAt: new Date(),
    })
    .where(eq(financialGoals.id, financialGoalId))
    .returning()

  return row ?? null
}

export async function getFinancialGoalById(financialGoalId: string) {
  const [row] = await db
    .select({
      goal: financialGoals,
      category: categories,
    })
    .from(financialGoals)
    .leftJoin(categories, eq(financialGoals.linkedCategoryId, categories.id))
    .where(eq(financialGoals.id, financialGoalId))
    .limit(1)

  return row ?? null
}

export async function listFinancialGoalsForUser(input: {
  userId: string
  status?: FinancialGoalSelect["status"]
  statuses?: FinancialGoalSelect["status"][]
  limit?: number
}) {
  const conditions = [eq(financialGoals.userId, input.userId)]

  if (input.status) {
    conditions.push(eq(financialGoals.status, input.status))
  }

  if (input.statuses?.length) {
    conditions.push(inArray(financialGoals.status, input.statuses))
  }

  return db
    .select({
      goal: financialGoals,
      category: categories,
    })
    .from(financialGoals)
    .leftJoin(categories, eq(financialGoals.linkedCategoryId, categories.id))
    .where(and(...conditions))
    .orderBy(
      asc(financialGoals.status),
      asc(financialGoals.targetDate),
      desc(financialGoals.updatedAt),
    )
    .limit(input.limit ?? 100)
}

export async function upsertGoalContributionSnapshot(input: GoalContributionSnapshotInsert) {
  const [row] = await db
    .insert(goalContributionSnapshots)
    .values(input)
    .onConflictDoUpdate({
      target: [
        goalContributionSnapshots.financialGoalId,
        goalContributionSnapshots.snapshotDate,
      ],
      set: {
        savedAmountMinor: input.savedAmountMinor,
        projectedAmountMinor: input.projectedAmountMinor,
        gapAmountMinor: input.gapAmountMinor,
        confidence: input.confidence,
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to upsert goal contribution snapshot")
  }

  return row
}

export async function listGoalContributionSnapshotsForGoal(financialGoalId: string) {
  return db
    .select()
    .from(goalContributionSnapshots)
    .where(eq(goalContributionSnapshots.financialGoalId, financialGoalId))
    .orderBy(desc(goalContributionSnapshots.snapshotDate), desc(goalContributionSnapshots.createdAt))
}

export async function listLatestGoalContributionSnapshotsForGoalIds(financialGoalIds: string[]) {
  if (financialGoalIds.length === 0) {
    return []
  }

  const latestSnapshotDates = db
    .select({
      financialGoalId: goalContributionSnapshots.financialGoalId,
      snapshotDate: sql<string>`max(${goalContributionSnapshots.snapshotDate})`.as("snapshot_date"),
    })
    .from(goalContributionSnapshots)
    .where(inArray(goalContributionSnapshots.financialGoalId, financialGoalIds))
    .groupBy(goalContributionSnapshots.financialGoalId)
    .as("latest_goal_snapshot_dates")

  return db
    .select({
      snapshot: goalContributionSnapshots,
    })
    .from(goalContributionSnapshots)
    .innerJoin(
      latestSnapshotDates,
      and(
        eq(
          goalContributionSnapshots.financialGoalId,
          latestSnapshotDates.financialGoalId,
        ),
        eq(goalContributionSnapshots.snapshotDate, latestSnapshotDates.snapshotDate),
      ),
    )
}

export async function getAdviceItemById(adviceItemId: string) {
  const [row] = await db
    .select({
      adviceItem: adviceItems,
      merchant: merchants,
      goal: financialGoals,
    })
    .from(adviceItems)
    .leftJoin(merchants, eq(adviceItems.relatedMerchantId, merchants.id))
    .leftJoin(financialGoals, eq(adviceItems.relatedFinancialGoalId, financialGoals.id))
    .where(eq(adviceItems.id, adviceItemId))
    .limit(1)

  return row ?? null
}

export async function listAdviceItemsForUser(input: {
  userId: string
  statuses?: AdviceItemSelect["status"][]
  limit?: number
}) {
  const conditions = [eq(adviceItems.userId, input.userId)]

  if (input.statuses?.length) {
    conditions.push(inArray(adviceItems.status, input.statuses))
  }

  return db
    .select({
      adviceItem: adviceItems,
      merchant: merchants,
      goal: financialGoals,
    })
    .from(adviceItems)
    .leftJoin(merchants, eq(adviceItems.relatedMerchantId, merchants.id))
    .leftJoin(financialGoals, eq(adviceItems.relatedFinancialGoalId, financialGoals.id))
    .where(and(...conditions))
    .orderBy(
      asc(adviceItems.status),
      asc(adviceItems.priority),
      desc(adviceItems.updatedAt),
    )
    .limit(input.limit ?? 100)
}

export async function upsertAdviceItem(input: AdviceItemInsert) {
  const [existing] = await db
    .select()
    .from(adviceItems)
    .where(
      and(
        eq(adviceItems.userId, input.userId),
        eq(adviceItems.dedupeKey, input.dedupeKey),
      ),
    )
    .limit(1)

  if (!existing) {
    const [row] = await db.insert(adviceItems).values(input).returning()

    if (!row) {
      throw new Error("Failed to create advice item")
    }

    return row
  }

  const preserveDismissed = existing.status === "dismissed"
  const preserveDone = existing.status === "done"
  const nextStatus = preserveDismissed ? "dismissed" : preserveDone ? "done" : "active"
  const shouldClearHomeRank = nextStatus !== "active"

  const [row] = await db
    .update(adviceItems)
    .set({
      triggerType: input.triggerType,
      priority: input.priority,
      title: input.title,
      summary: input.summary,
      detail: input.detail,
      primaryActionJson:
        input.primaryActionJson === null
          ? null
          : (input.primaryActionJson ?? undefined),
      secondaryActionJson:
        input.secondaryActionJson === null
          ? null
          : (input.secondaryActionJson ?? undefined),
      homeRankScore:
        shouldClearHomeRank
          ? null
          : input.homeRankScore === null
            ? null
            : (input.homeRankScore ?? undefined),
      homeRankPosition:
        shouldClearHomeRank
          ? null
          : input.homeRankPosition === null
            ? null
            : (input.homeRankPosition ?? undefined),
      rankedAt:
        shouldClearHomeRank
          ? null
          : input.rankedAt === null
            ? null
            : (input.rankedAt ?? undefined),
      relatedMerchantId:
        input.relatedMerchantId === null
          ? null
          : (input.relatedMerchantId ?? undefined),
      relatedFinancialGoalId:
        input.relatedFinancialGoalId === null
          ? null
          : (input.relatedFinancialGoalId ?? undefined),
      evidenceJson: input.evidenceJson,
      sourceModelRunId:
        input.sourceModelRunId === null
          ? null
          : (input.sourceModelRunId ?? undefined),
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null,
      status: nextStatus,
      dismissedAt: preserveDismissed ? existing.dismissedAt : null,
      doneAt: preserveDone ? existing.doneAt : null,
      updatedAt: new Date(),
    })
    .where(eq(adviceItems.id, existing.id))
    .returning()

  if (!row) {
    throw new Error("Failed to update advice item")
  }

  return row
}

export async function updateAdviceItem(
  adviceItemId: string,
  input: Partial<AdviceItemInsert> & {
    status?: AdviceItemSelect["status"]
    dismissedAt?: Date | null
    doneAt?: Date | null
  },
) {
  const [row] = await db
    .update(adviceItems)
    .set({
      triggerType: input.triggerType ?? undefined,
      status: input.status ?? undefined,
      priority: input.priority ?? undefined,
      dedupeKey: input.dedupeKey ?? undefined,
      title: input.title ?? undefined,
      summary: input.summary ?? undefined,
      detail: input.detail ?? undefined,
      primaryActionJson:
        input.primaryActionJson === null
          ? null
          : (input.primaryActionJson ?? undefined),
      secondaryActionJson:
        input.secondaryActionJson === null
          ? null
          : (input.secondaryActionJson ?? undefined),
      homeRankScore:
        input.homeRankScore === null ? null : (input.homeRankScore ?? undefined),
      homeRankPosition:
        input.homeRankPosition === null ? null : (input.homeRankPosition ?? undefined),
      rankedAt: input.rankedAt === null ? null : (input.rankedAt ?? undefined),
      relatedMerchantId:
        input.relatedMerchantId === null
          ? null
          : (input.relatedMerchantId ?? undefined),
      relatedFinancialGoalId:
        input.relatedFinancialGoalId === null
          ? null
          : (input.relatedFinancialGoalId ?? undefined),
      evidenceJson: input.evidenceJson ?? undefined,
      sourceModelRunId:
        input.sourceModelRunId === null
          ? null
          : (input.sourceModelRunId ?? undefined),
      validFrom: input.validFrom ?? undefined,
      validUntil: input.validUntil === null ? null : (input.validUntil ?? undefined),
      dismissedAt:
        input.dismissedAt === null ? null : (input.dismissedAt ?? undefined),
      doneAt: input.doneAt === null ? null : (input.doneAt ?? undefined),
      updatedAt: new Date(),
    })
    .where(eq(adviceItems.id, adviceItemId))
    .returning()

  return row ?? null
}

export async function expireMissingAdviceItems(input: {
  userId: string
  activeDedupeKeys: string[]
}) {
  const conditions = [
    eq(adviceItems.userId, input.userId),
    eq(adviceItems.status, "active"),
  ]

  if (input.activeDedupeKeys.length > 0) {
    conditions.push(notInArray(adviceItems.dedupeKey, input.activeDedupeKeys))
  }

  return db
    .update(adviceItems)
    .set({
      status: "expired",
      validUntil: new Date(),
      homeRankScore: null,
      homeRankPosition: null,
      rankedAt: null,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning()
}

export async function listUserIdsForAdvice() {
  const [goalRows, forecastRows, adviceRows] = await Promise.all([
    db.selectDistinct({ userId: financialGoals.userId }).from(financialGoals),
    db.selectDistinct({ userId: forecastRuns.userId }).from(forecastRuns),
    db.selectDistinct({ userId: adviceItems.userId }).from(adviceItems),
  ])

  return [...new Set([...goalRows, ...forecastRows, ...adviceRows].map((row) => row.userId))]
}

export async function listUserIdsWithActiveAdvice() {
  const rows = await db
    .selectDistinct({ userId: adviceItems.userId })
    .from(adviceItems)
    .where(eq(adviceItems.status, "active"))

  return rows.map((row) => row.userId)
}

export async function listHomeRankedAdviceItemsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select({
      adviceItem: adviceItems,
      merchant: merchants,
      goal: financialGoals,
    })
    .from(adviceItems)
    .leftJoin(merchants, eq(adviceItems.relatedMerchantId, merchants.id))
    .leftJoin(financialGoals, eq(adviceItems.relatedFinancialGoalId, financialGoals.id))
    .where(
      and(
        eq(adviceItems.userId, input.userId),
        eq(adviceItems.status, "active"),
        sql`${adviceItems.homeRankPosition} IS NOT NULL`,
      ),
    )
    .orderBy(asc(adviceItems.homeRankPosition), desc(adviceItems.rankedAt))
    .limit(input.limit ?? 3)
}

export async function clearAdviceHomeRankingForUser(userId: string) {
  return db
    .update(adviceItems)
    .set({
      homeRankScore: null,
      homeRankPosition: null,
      rankedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(adviceItems.userId, userId))
}

export async function applyAdviceHomeRanking(input: {
  userId: string
  rankings: Array<{
    adviceItemId: string
    position: 1 | 2 | 3
    score: number
  }>
  rankedAt: Date
}) {
  await clearAdviceHomeRankingForUser(input.userId)

  if (input.rankings.length === 0) {
    return []
  }

  const updates = input.rankings.map((ranking) =>
    db
      .update(adviceItems)
      .set({
        homeRankPosition: ranking.position,
        homeRankScore: ranking.score,
        rankedAt: input.rankedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adviceItems.userId, input.userId),
          eq(adviceItems.id, ranking.adviceItemId),
          eq(adviceItems.status, "active"),
        ),
      )
      .returning(),
  )

  const rows = await Promise.all(updates)
  return rows.flat()
}
