import Link from "next/link"

import { Card } from "@workspace/ui/components/card"

type GoalSnapshotItem = {
  id: string
  name: string
  status: string
  targetAmountLabel: string
  projectedAmountLabel: string
  gapAmountLabel: string
  targetDateLabel: string
  progressRatio: number
  riskLabel: string
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, value))
}

export function GoalSnapshotPanel({
  goals,
}: {
  goals: GoalSnapshotItem[]
}) {
  return (
    <Card className="border-white/8 bg-[rgba(18,18,20,0.92)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="neo-kicker">Goals</p>
          <h2 className="mt-3 font-display text-3xl leading-none text-white">
            planning view
          </h2>
        </div>
        <Link href="/goals" className="text-sm text-white/52 transition hover:text-white">
          Open goals
        </Link>
      </div>

      {goals.length === 0 ? (
        <div className="mt-6 border border-dashed border-white/[0.08] px-4 py-4">
          <p className="text-sm leading-6 text-white/42">
            Set a goal to track how current savings and forecast surplus are pacing against it.
          </p>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-white/[0.06]">
          {goals.map((goal) => (
            <Link
              key={goal.id}
              href={`/goals/${goal.id}`}
              className="block py-4 first:pt-0 last:pb-0 transition hover:bg-white/[0.02]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-medium text-white">{goal.name}</p>
                  <p className="mt-2 text-sm text-white/36">
                    {goal.projectedAmountLabel} projected by {goal.targetDateLabel}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[var(--neo-yellow)]"
                      style={{ width: `${Math.round(clampRatio(goal.progressRatio) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-white/22">
                    {goal.riskLabel}
                  </p>
                  <p className="mt-2 text-sm text-white/52">{goal.gapAmountLabel} gap</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
