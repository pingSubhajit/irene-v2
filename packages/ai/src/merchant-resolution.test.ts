import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCategoryResolutionPrompt,
  coerceCategoryResolutionResult,
} from "./merchant-resolution"

test("coerceCategoryResolutionResult accepts valid existing-category links", () => {
  const result = coerceCategoryResolutionResult({
    decision: "link_existing_category",
    existingCategorySlug: "subscriptions",
    confidence: 0.94,
    reason:
      "The existing subscriptions category already fits this recurring charge.",
  })

  assert.deepEqual(result, {
    decision: "link_existing_category",
    existingCategorySlug: "subscriptions",
    customCategoryName: null,
    iconName: null,
    colorToken: null,
    confidence: 0.94,
    reason:
      "The existing subscriptions category already fits this recurring charge.",
  })
})

test("coerceCategoryResolutionResult accepts valid custom-category creates", () => {
  const result = coerceCategoryResolutionResult({
    decision: "create_custom_category",
    customCategoryName: "Healthcare",
    iconName: "stethoscope-line",
    colorToken: "coral",
    confidence: 0.87,
    reason: "This medical spend does not fit the existing category list.",
  })

  assert.deepEqual(result, {
    decision: "create_custom_category",
    existingCategorySlug: null,
    customCategoryName: "Healthcare",
    iconName: "stethoscope-line",
    colorToken: "coral",
    confidence: 0.87,
    reason: "This medical spend does not fit the existing category list.",
  })
})

test("coerceCategoryResolutionResult rejects invalid icon and color values", () => {
  const result = coerceCategoryResolutionResult({
    decision: "create_custom_category",
    customCategoryName: "Streaming",
    iconName: "netflix-line",
    colorToken: "purple",
    confidence: 0.88,
    reason: "Invalid presentation metadata should not pass coercion.",
  })

  assert.equal(result, null)
})

test("buildCategoryResolutionPrompt includes categories and whitelist guidance", () => {
  const prompt = buildCategoryResolutionPrompt({
    merchantName: "Apollo Clinic",
    processorName: null,
    eventType: "purchase",
    description: "Consultation fee",
    notes: null,
    evidenceSnippets: ["Doctor consultation completed and payment received."],
    categories: [
      {
        slug: "shopping",
        name: "Shopping",
        kind: "expense",
        isSystem: true,
        iconName: "shopping-bag-4-line",
        colorToken: "blue",
      },
      {
        slug: "subscriptions",
        name: "Subscriptions",
        kind: "expense",
        isSystem: true,
        iconName: "repeat-line",
        colorToken: "violet",
      },
    ],
  })

  assert.match(prompt, /Allowed iconName values:/)
  assert.match(prompt, /Allowed colorToken values:/)
  assert.match(prompt, /Existing user categories:/)
  assert.match(prompt, /create_custom_category/)
})
