import { CategoryExplorerTile } from "@/components/category-explorer-tile"
import type { CategorySummaryItem } from "@/lib/category-summary"

export function HomeCategoryStrip({
  items,
  formatAmount,
  excludeCategoryId,
}: {
  items: CategorySummaryItem[]
  formatAmount: (amountMinor: number) => string
  excludeCategoryId?: string | null
}) {
  const visibleItems = items.filter((item) => item.id !== excludeCategoryId)

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <section className="mx-[calc(var(--page-gutter)*-1)] min-w-0 overflow-hidden py-3">
      <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-max snap-x snap-mandatory gap-5 px-[var(--page-gutter)] pb-1">
          {visibleItems.map((item) => (
            <CategoryExplorerTile
              key={item.id}
              href={`/activity/categories/${item.id}`}
              label={item.name}
              amountLabel={formatAmount(item.totalOutflowMinor)}
              iconName={item.iconName}
              colorToken={item.colorToken}
              variant="rail"
            />
          ))}
          <CategoryExplorerTile
            href="/activity/categories"
            label="All"
            variant="rail"
            isViewAll
          />
        </div>
      </div>
    </section>
  )
}
