import assert from "node:assert/strict"
import test from "node:test"

import {
  CATEGORY_COLOR_TOKEN_SCHEMA,
  CATEGORY_ICON_NAME_SCHEMA,
  DEFAULT_CATEGORY_COLOR_TOKEN,
  DEFAULT_CATEGORY_ICON_NAME,
  SYSTEM_CATEGORY_PRESENTATION,
} from "./category-presentation"

test("category presentation schemas accept whitelisted values", () => {
  assert.equal(
    CATEGORY_ICON_NAME_SCHEMA.parse("wallet-3-line"),
    "wallet-3-line"
  )
  assert.equal(CATEGORY_COLOR_TOKEN_SCHEMA.parse("violet"), "violet")
})

test("category presentation schemas reject unknown values", () => {
  assert.equal(
    CATEGORY_ICON_NAME_SCHEMA.safeParse("netflix-line").success,
    false
  )
  assert.equal(CATEGORY_COLOR_TOKEN_SCHEMA.safeParse("magenta").success, false)
})

test("system category presentation map keeps uncategorized fallback values", () => {
  assert.deepEqual(SYSTEM_CATEGORY_PRESENTATION.uncategorized, {
    iconName: DEFAULT_CATEGORY_ICON_NAME,
    colorToken: DEFAULT_CATEGORY_COLOR_TOKEN,
  })
})
