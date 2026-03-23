import Link from "next/link"
import type { ElementType } from "react"
import { RiInboxArchiveLine } from "@remixicon/react"
import {
  Empty,
  EmptyDescription,
  EmptyFooter,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

type IconComponent = ElementType<{ className?: string }>

type AppEmptyStateProps = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
  icon?: IconComponent
  className?: string
  compact?: boolean
}

export function AppEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon: Icon = RiInboxArchiveLine,
  className,
  compact = false,
}: AppEmptyStateProps) {
  return (
    <Empty
      className={[
        "px-2",
        compact ? "py-8" : "py-12",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <EmptyHeader className={compact ? "gap-2.5" : "gap-3.5"}>
        <EmptyMedia>
          <div className="flex size-12 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02]">
            <Icon className="size-5 text-white/38" />
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-white">{title}</EmptyTitle>
        <EmptyDescription className="text-white/42">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      {actionHref && actionLabel ? (
        <EmptyFooter className="mt-5">
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center border border-white/[0.08] px-4 py-2 text-sm text-white/72 transition hover:bg-white/[0.03] hover:text-white"
          >
            {actionLabel}
          </Link>
        </EmptyFooter>
      ) : null}
    </Empty>
  )
}
