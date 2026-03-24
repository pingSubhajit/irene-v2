import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getFinancialGoalById,
  listAdviceItemsForUser,
  listCategoriesForUser,
  listGoalContributionSnapshotsForGoal,
} from "@workspace/db"

import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Goal",
  description: "Goal detail in Irene.",
})

type GoalDetailPageProps = {
  params: Promise<{
    goalId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function formatCurrency(amountMinor: number, currency = "INR") {
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

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(status: string | null | undefined) {
  switch (status) {
    case "update":
      return "Goal updated."
    case "archive":
      return "Goal archived."
    case "complete":
      return "Goal marked complete."
    default:
      return null
  }
}

export default async function GoalDetailPage({
  params,
  searchParams,
}: GoalDetailPageProps) {
  const session = await requireSession()
  const { goalId } = await params
  const query = (await searchParams) ?? {}

  const [goalRow, categories, snapshots, adviceRows] = await Promise.all([
    getFinancialGoalById(goalId),
    listCategoriesForUser(session.user.id),
    listGoalContributionSnapshotsForGoal(goalId),
    listAdviceItemsForUser({
      userId: session.user.id,
      statuses: ["active", "dismissed", "done", "expired"],
      limit: 100,
    }),
  ])

  if (!goalRow || goalRow.goal.userId !== session.user.id) {
    notFound()
  }

  const latestSnapshot = snapshots[0] ?? null
  const relatedAdvice = adviceRows.filter(
    ({ adviceItem }) => adviceItem.relatedFinancialGoalId === goalId,
  )
  const message = getStatusMessage(asSingleValue(query.goals))

  return (
    <section className="grid gap-8">
      <div>
        <Link href="/goals" className="text-sm text-white/42 transition hover:text-white">
          Back to goals
        </Link>
        <p className="mt-6 neo-kicker">Goal detail</p>
        <h1 className="mt-4 max-w-[14ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
          {goalRow.goal.name}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
          Track the gap between where this goal stands now and what the forecast says is realistic by the target date.
        </p>
      </div>

      {message ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{message}</p>
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-white/[0.08] bg-[rgba(18,18,20,0.92)] p-6">
          <p className="neo-kicker">Progress</p>
          <div className="mt-5 grid gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/42">Target</span>
              <span className="text-sm text-white">
                {formatCurrency(goalRow.goal.targetAmountMinor, goalRow.goal.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/42">Saved now</span>
              <span className="text-sm text-white">
                {formatCurrency(
                  latestSnapshot?.savedAmountMinor ?? goalRow.goal.startingAmountMinor,
                  goalRow.goal.currency,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/42">Projected by target</span>
              <span className="text-sm text-white">
                {formatCurrency(
                  latestSnapshot?.projectedAmountMinor ?? goalRow.goal.startingAmountMinor,
                  goalRow.goal.currency,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/42">Remaining gap</span>
              <span className="text-sm text-white">
                {formatCurrency(
                  latestSnapshot?.gapAmountMinor ??
                    Math.max(
                      goalRow.goal.targetAmountMinor - goalRow.goal.startingAmountMinor,
                      0,
                    ),
                  goalRow.goal.currency,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/42">Target date</span>
              <span className="text-sm text-white">{goalRow.goal.targetDate}</span>
            </div>
          </div>

          {relatedAdvice.length > 0 ? (
            <div className="mt-8 border-t border-white/[0.06] pt-5">
              <p className="neo-kicker">Advice linked here</p>
              <div className="mt-4 grid gap-4">
                {relatedAdvice.map(({ adviceItem }) => (
                  <div key={adviceItem.id} className="border border-white/[0.06] px-4 py-4">
                    <p className="text-[16px] font-medium text-white">{adviceItem.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/46">{adviceItem.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border border-white/[0.08] bg-[rgba(18,18,20,0.92)] p-6">
          <p className="neo-kicker">Edit</p>
          <h2 className="mt-3 text-[22px] font-medium text-white">goal settings</h2>

          <form action="/api/goals" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="action" value="update" />
            <input type="hidden" name="goalId" value={goalRow.goal.id} />
            <input type="hidden" name="redirectTo" value={`/goals/${goalRow.goal.id}`} />

            <label className="grid gap-2">
              <span className="text-sm text-white/52">goal type</span>
              <select
                name="goalType"
                className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                defaultValue={goalRow.goal.goalType}
              >
                <option value="emergency_fund">Emergency fund</option>
                <option value="target_purchase">Target purchase</option>
                <option value="travel">Travel</option>
                <option value="debt_payoff">Debt payoff</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-white/52">name</span>
              <input
                name="name"
                defaultValue={goalRow.goal.name}
                className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-white/52">target amount</span>
                <input
                  name="targetAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(goalRow.goal.targetAmountMinor / 100).toFixed(2)}
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/52">starting amount</span>
                <input
                  name="startingAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(goalRow.goal.startingAmountMinor / 100).toFixed(2)}
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-white/52">target date</span>
                <input
                  name="targetDate"
                  type="date"
                  defaultValue={goalRow.goal.targetDate}
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/52">linked category</span>
                <select
                  name="linkedCategoryId"
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                  defaultValue={goalRow.goal.linkedCategoryId ?? ""}
                >
                  <option value="">No linked category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm text-white/52">notes</span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={goalRow.goal.notes ?? ""}
                className="min-h-32 border border-white/[0.08] bg-transparent px-4 py-3 text-white outline-none"
              />
            </label>
            <div className="border-t border-white/[0.06] pt-5">
              <button
                type="submit"
                className="border border-white/[0.1] px-4 py-2 text-sm text-white transition hover:border-white/[0.18]"
              >
                Save goal
              </button>
            </div>
          </form>

          <div className="mt-5 flex gap-4 border-t border-white/[0.06] pt-5">
            <form action="/api/goals" method="post">
              <input type="hidden" name="action" value="complete" />
              <input type="hidden" name="goalId" value={goalRow.goal.id} />
              <input type="hidden" name="redirectTo" value={`/goals/${goalRow.goal.id}`} />
              <button
                type="submit"
                className="text-sm text-[var(--neo-green)] transition hover:text-white"
              >
                Mark complete
              </button>
            </form>
            <form action="/api/goals" method="post">
              <input type="hidden" name="action" value="archive" />
              <input type="hidden" name="goalId" value={goalRow.goal.id} />
              <input type="hidden" name="redirectTo" value="/goals" />
              <button
                type="submit"
                className="text-sm text-white/42 transition hover:text-white"
              >
                Archive
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
