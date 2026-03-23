import { CategoryExplorerTile } from "@/components/category-explorer-tile"
import type { CategorySummaryItem } from "@/lib/category-summary"

export function HomeCategoryStrip({
  items,
  formatAmount,
}: {
  items: CategorySummaryItem[]
  formatAmount: (amountMinor: number) => string
}) {
  return (
    <section className="w-full min-w-0 py-3">
      <div className="mr-[-1rem] w-auto overflow-x-auto overscroll-x-contain md:mr-[-1.5rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full snap-x snap-mandatory gap-5 pb-1 pr-4 md:pr-6">
          {items.map((item) => (
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
