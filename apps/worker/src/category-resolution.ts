import type { CategoryResolutionResult } from "@workspace/ai"
import type {
  CategoryKind,
  CategorySelect,
  FinancialEventType,
} from "@workspace/db"
import {
  deriveCategoryKindForEventType,
  normalizeCategorySlug,
} from "@workspace/db"

export type CategoryResolutionAction =
  | {
      type: "link_existing_category"
      categorySlug: string
      reason: string
    }
  | {
      type: "create_custom_category"
      name: string
      slug: string
      kind: CategoryKind
      iconName: NonNullable<CategorySelect["iconName"]>
      colorToken: NonNullable<CategorySelect["colorToken"]>
      reason: string
    }
  | {
      type: "fallback_uncategorized"
      categorySlug: "uncategorized"
      reason: string
    }

export function selectCategoryResolutionAction(input: {
  decision: CategoryResolutionResult
  existingCategories: Array<Pick<CategorySelect, "slug">>
  eventType: FinancialEventType
  recoveryMode: "strict" | "coerced" | "fallback"
  minimumCreateConfidence?: number
}) {
  const minimumCreateConfidence = input.minimumCreateConfidence ?? 0.8
  const existingSlugSet = new Set(
    input.existingCategories
      .map((category) => normalizeCategorySlug(category.slug))
      .filter((slug): slug is string => Boolean(slug))
  )

  if (input.decision.decision === "link_existing_category") {
    const existingCategorySlug = normalizeCategorySlug(
      input.decision.existingCategorySlug
    )

    if (existingCategorySlug && existingSlugSet.has(existingCategorySlug)) {
      return {
        type: "link_existing_category",
        categorySlug: existingCategorySlug,
        reason: input.decision.reason,
      } satisfies CategoryResolutionAction
    }

    return {
      type: "fallback_uncategorized",
      categorySlug: "uncategorized",
      reason: input.decision.reason,
    } satisfies CategoryResolutionAction
  }

  if (
    input.recoveryMode !== "strict" ||
    input.decision.confidence < minimumCreateConfidence
  ) {
    return {
      type: "fallback_uncategorized",
      categorySlug: "uncategorized",
      reason: input.decision.reason,
    } satisfies CategoryResolutionAction
  }

  const slug = normalizeCategorySlug(input.decision.customCategoryName)
  const iconName = input.decision.iconName
  const colorToken = input.decision.colorToken

  if (!slug || !iconName || !colorToken) {
    return {
      type: "fallback_uncategorized",
      categorySlug: "uncategorized",
      reason: input.decision.reason,
    } satisfies CategoryResolutionAction
  }

  if (existingSlugSet.has(slug)) {
    return {
      type: "link_existing_category",
      categorySlug: slug,
      reason: input.decision.reason,
    } satisfies CategoryResolutionAction
  }

  return {
    type: "create_custom_category",
    name: input.decision.customCategoryName ?? "Uncategorized",
    slug,
    kind: deriveCategoryKindForEventType(input.eventType),
    iconName,
    colorToken,
    reason: input.decision.reason,
  } satisfies CategoryResolutionAction
}
