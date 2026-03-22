import Link from "next/link"

import {
  listCategoriesForUser,
  listFinancialGoalsForUser,
  listLatestGoalContributionSnapshotsForGoalIds,
} from "@workspace/db"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type GoalsPageProps = {
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
    case "created":
      return "Goal created."
    case "update":
      return "Goal updated."
    case "archive":
      return "Goal archived."
    case "complete":
      return "Goal marked complete."
    case "missing":
      return "Goal not found."
    default:
      return null
  }
}

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [goals, categories] = await Promise.all([
    listFinancialGoalsForUser({
      userId: session.user.id,
      statuses: ["active", "completed", "archived"],
      limit: 100,
    }),
    listCategoriesForUser(session.user.id),
  ])

  const snapshots = await listLatestGoalContributionSnapshotsForGoalIds(
    goals.map((row) => row.goal.id),
  )
  const snapshotsByGoalId = new Map(
    snapshots.map((row) => [row.snapshot.financialGoalId, row.snapshot]),
  )

  const message = getStatusMessage(asSingleValue(params.goals))
  const active = goals.filter((row) => row.goal.status === "active")
  const closed = goals.filter((row) => row.goal.status !== "active")

  return (
    <section className="grid gap-8">
      <div>
        <p className="neo-kicker">Goals</p>
        <h1 className="mt-4 max-w-[14ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
          savings and
          <br />
          planning.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
          Set concrete targets and let Irene compare them with current savings and forecast surplus.
        </p>
      </div>

      {message ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{message}</p>
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-white/[0.08] bg-[rgba(18,18,20,0.92)] p-6">
          <p className="neo-kicker">Create</p>
          <h2 className="mt-3 text-[22px] font-medium text-white">new goal</h2>

          <form action="/api/goals" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="action" value="create" />
            <input type="hidden" name="redirectTo" value="/goals" />

            <label className="grid gap-2">
              <span className="text-sm text-white/52">goal type</span>
              <select
                name="goalType"
                className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                defaultValue="emergency_fund"
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
                placeholder="Emergency reserve"
                className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none placeholder:text-white/16"
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
                  placeholder="50000"
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none placeholder:text-white/16"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/52">starting amount</span>
                <input
                  name="startingAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none placeholder:text-white/16"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-white/52">target date</span>
                <input
                  name="targetDate"
                  type="date"
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/52">linked category</span>
                <select
                  name="linkedCategoryId"
                  className="h-12 border border-white/[0.08] bg-transparent px-4 text-white outline-none"
                  defaultValue=""
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
                rows={3}
                placeholder="Optional context for this goal"
                className="min-h-28 border border-white/[0.08] bg-transparent px-4 py-3 text-white outline-none placeholder:text-white/16"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                className="border border-white/[0.1] px-4 py-2 text-sm text-white transition hover:border-white/[0.18]"
              >
                Save goal
              </button>
            </div>
          </form>
        </div>

        <div className="grid gap-8">
          <div>
            <div className="flex items-center justify-between">
              <p className="neo-kicker">Active</p>
              <span className="text-sm text-white/24">{active.length}</span>
            </div>
            <div className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {active.map(({ goal }) => {
                const snapshot = snapshotsByGoalId.get(goal.id)
                const projectedAmountMinor =
                  snapshot?.projectedAmountMinor ?? goal.startingAmountMinor
                const gapAmountMinor =
                  snapshot?.gapAmountMinor ??
                  Math.max(goal.targetAmountMinor - projectedAmountMinor, 0)

                return (
                  <Link
                    key={goal.id}
                    href={`/goals/${goal.id}`}
                    className="block py-5 transition hover:bg-white/[0.02]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[18px] font-medium text-white">{goal.name}</p>
                        <p className="mt-2 text-sm leading-6 text-white/46">
                          {formatCurrency(projectedAmountMinor, goal.currency)} projected by {goal.targetDate}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white/34">
                          {formatCurrency(gapAmountMinor, goal.currency)} gap
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="neo-kicker">Closed</p>
              <span className="text-sm text-white/24">{closed.length}</span>
            </div>
            <div className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {closed.map(({ goal }) => (
                <Link
                  key={goal.id}
                  href={`/goals/${goal.id}`}
                  className="block py-5 transition hover:bg-white/[0.02]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[18px] font-medium text-white">{goal.name}</p>
                      <p className="mt-2 text-sm leading-6 text-white/46">
                        {goal.status.replace("_", " ")} · target {goal.targetDate}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
