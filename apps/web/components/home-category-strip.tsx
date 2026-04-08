import { CategoryExplorerTile } from "@/components/category-explorer-tile"
import type { CategorySummaryItem } from "@/lib/category-summary"
import {
  appendGlobalTimeframeToHref,
  type GlobalTimeframe,
} from "@/lib/global-timeframe"

export function HomeCategoryStrip({
  items,
  formatAmount,
  excludeCategoryId,
  timeframe,
}: {
  items: CategorySummaryItem[]
  formatAmount: (amountMinor: number) => string
  excludeCategoryId?: string | null
  timeframe: GlobalTimeframe
}) {
  const visibleItems = items.filter((item) => item.id !== excludeCategoryId)

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <section className="mx-[calc(var(--page-gutter)*-1)] min-w-0 overflow-hidden py-3">
      <div className="w-full touch-pan-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-max snap-x snap-mandatory gap-5 px-[var(--page-gutter)] pb-1">
          {visibleItems.map((item) => (
            <CategoryExplorerTile
              key={item.id}
              href={appendGlobalTimeframeToHref(
                `/activity/categories/${item.id}`,
                timeframe
              )}
              label={item.name}
              amountLabel={formatAmount(item.totalOutflowMinor)}
              iconName={item.iconName}
              colorToken={item.colorToken}
              variant="rail"
            />
          ))}
          <CategoryExplorerTile
            href={appendGlobalTimeframeToHref(
              "/activity/categories",
              timeframe
            )}
            label="All"
            variant="rail"
            isViewAll
          />
        </div>
      </div>
    </section>
  )
}
