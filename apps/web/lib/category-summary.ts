import type { CategoryColorToken, CategoryIconName } from "@workspace/config"

type CategoryLike = {
  id: string
  name: string
  slug: string
  iconName: CategoryIconName | null
  colorToken: CategoryColorToken | null
}

type EventLike = {
  direction: string
  isTransfer: boolean
}

type CategoryActivityRow = {
  event: EventLike
  category: CategoryLike | null
  reportingAmountMinor: number | null
}

export type CategorySummaryItem = {
  id: string
  name: string
  slug: string
  iconName: CategoryIconName | null
  colorToken: CategoryColorToken | null
  totalOutflowMinor: number
  transactionCount: number
}

export function summarizeCategoryActivity(
  rows: CategoryActivityRow[],
): CategorySummaryItem[] {
  const summaries = new Map<string, CategorySummaryItem>()

  for (const row of rows) {
    if (
      row.reportingAmountMinor === null ||
      row.event.direction !== "outflow" ||
      row.event.isTransfer ||
      !row.category
    ) {
      continue
    }

    const existing = summaries.get(row.category.id)

    if (existing) {
      existing.totalOutflowMinor += row.reportingAmountMinor
      existing.transactionCount += 1
      continue
    }

    summaries.set(row.category.id, {
      id: row.category.id,
      name: row.category.name,
      slug: row.category.slug,
      iconName: row.category.iconName,
      colorToken: row.category.colorToken,
      totalOutflowMinor: row.reportingAmountMinor,
      transactionCount: 1,
    })
  }

  return [...summaries.values()].sort(
    (left, right) =>
      right.totalOutflowMinor - left.totalOutflowMinor ||
      right.transactionCount - left.transactionCount ||
      left.name.localeCompare(right.name),
  )
}
