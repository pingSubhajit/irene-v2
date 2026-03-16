import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

type ActionTileProps = {
  href: string
  eyebrow: string
  title: string
  description: string
  badge?: string
  badgeVariant?: "default" | "success" | "warning" | "danger" | "cream" | "violet"
}

export function ActionTile({
  href,
  eyebrow,
  title,
  description,
  badge,
  badgeVariant = "default",
}: ActionTileProps) {
  return (
    <Link href={href}>
      <Card className="h-full border-white/8 bg-[rgba(18,18,20,0.92)] p-5 transition hover:-translate-y-0.5 hover:border-white/16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="neo-kicker">{eyebrow}</p>
            <h2 className="mt-3 font-display text-3xl leading-none text-white">{title}</h2>
          </div>
          {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
        </div>
        <p className="mt-4 text-sm leading-6 text-white/62">{description}</p>
      </Card>
    </Link>
  )
}
