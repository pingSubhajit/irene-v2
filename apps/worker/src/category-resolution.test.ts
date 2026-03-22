import assert from "node:assert/strict"
import test from "node:test"

import { selectCategoryResolutionAction } from "./category-resolution"

test("selectCategoryResolutionAction returns custom category creation for valid strict decisions", () => {
  const result = selectCategoryResolutionAction({
    decision: {
      decision: "create_custom_category",
      existingCategorySlug: null,
      customCategoryName: "Healthcare",
      iconName: "stethoscope-line",
      colorToken: "coral",
      confidence: 0.91,
      reason: "No existing category fits medical spend cleanly.",
    },
    existingCategories: [{ slug: "shopping" }, { slug: "uncategorized" }],
    eventType: "purchase",
    recoveryMode: "strict",
  })

  assert.deepEqual(result, {
    type: "create_custom_category",
    name: "Healthcare",
    slug: "healthcare",
    kind: "expense",
    iconName: "stethoscope-line",
    colorToken: "coral",
    reason: "No existing category fits medical spend cleanly.",
  })
})

test("selectCategoryResolutionAction links existing category when custom slug collides", () => {
  const result = selectCategoryResolutionAction({
    decision: {
      decision: "create_custom_category",
      existingCategorySlug: null,
      customCategoryName: "Digital Goods",
      iconName: "download-cloud-2-line",
      colorToken: "blue",
      confidence: 0.93,
      reason: "The name collides with an existing slug.",
    },
    existingCategories: [{ slug: "digital_goods" }, { slug: "uncategorized" }],
    eventType: "purchase",
    recoveryMode: "strict",
  })

  assert.deepEqual(result, {
    type: "link_existing_category",
    categorySlug: "digital_goods",
    reason: "The name collides with an existing slug.",
  })
})

test("selectCategoryResolutionAction falls back for low-confidence create decisions", () => {
  const result = selectCategoryResolutionAction({
    decision: {
      decision: "create_custom_category",
      existingCategorySlug: null,
      customCategoryName: "Healthcare",
      iconName: "stethoscope-line",
      colorToken: "coral",
      confidence: 0.61,
      reason: "Confidence is too low to auto-create.",
    },
    existingCategories: [{ slug: "uncategorized" }],
    eventType: "purchase",
    recoveryMode: "strict",
  })

  assert.deepEqual(result, {
    type: "fallback_uncategorized",
    categorySlug: "uncategorized",
    reason: "Confidence is too low to auto-create.",
  })
})

test("selectCategoryResolutionAction falls back for degraded create decisions", () => {
  const result = selectCategoryResolutionAction({
    decision: {
      decision: "create_custom_category",
      existingCategorySlug: null,
      customCategoryName: "Healthcare",
      iconName: "stethoscope-line",
      colorToken: "coral",
      confidence: 0.94,
      reason: "Recovered output must not create new categories.",
    },
    existingCategories: [{ slug: "uncategorized" }],
    eventType: "purchase",
    recoveryMode: "coerced",
  })

  assert.deepEqual(result, {
    type: "fallback_uncategorized",
    categorySlug: "uncategorized",
    reason: "Recovered output must not create new categories.",
  })
})
