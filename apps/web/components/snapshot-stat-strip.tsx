import { Card } from "@workspace/ui/components/card"

type SnapshotStat = {
  label: string
  value: string
  tone?: "default" | "positive" | "violet"
}

export function SnapshotStatStrip({ stats }: { stats: SnapshotStat[] }) {
  return (
    <div className="neo-scrollbar mx-[calc(var(--page-gutter)*-1)] flex w-auto gap-3 overflow-x-auto px-[var(--page-gutter)] pb-1">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="min-w-[146px] shrink-0 border-white/8 bg-[rgba(18,18,20,0.9)] p-4"
        >
          <p className="neo-kicker">{stat.label}</p>
          <p
            className={[
              "mt-3 text-xl font-semibold tracking-tight tabular-nums",
              stat.tone === "positive"
                ? "text-[var(--neo-green)]"
                : stat.tone === "violet"
                  ? "text-[#bdafff]"
                  : "text-white",
            ].join(" ")}
          >
            {stat.value}
          </p>
        </Card>
      ))}
    </div>
  )
}
