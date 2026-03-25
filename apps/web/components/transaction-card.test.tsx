import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CategoryBadge,
  resolveCategoryBadgeToneClassName,
} from "./category-badge"
import { TransactionCard } from "./transaction-card"

test("CategoryBadge resolves whitelisted color tokens and fallback tone", () => {
  assert.match(resolveCategoryBadgeToneClassName("blue"), /53b7ff/)
  assert.match(resolveCategoryBadgeToneClassName(null), /c7d2ff/)
})

test("CategoryBadge renders accessible category metadata", () => {
  const html = renderToStaticMarkup(
    <CategoryBadge
      categoryName="Subscriptions"
      iconName="repeat-line"
      colorToken="violet"
    />
  )

  assert.match(html, /Subscriptions category/)
  assert.match(html, /svg/)
})

test("TransactionCard renders category badge and merchant fallback initials", () => {
  const html = renderToStaticMarkup(
    <TransactionCard
      eventId="evt_123"
      merchant="Acme Labs"
      merchantLogoUrl={null}
      merchantId="mer_123"
      amount="₹899.00"
      occurredAt={new Date("2026-03-22T00:00:00.000Z")}
      categoryName="Healthcare"
      categoryId="cat_123"
      categoryIconName="stethoscope-line"
      categoryColorToken="coral"
      direction="outflow"
      eventType="purchase"
      needsReview={false}
      paymentInstrument={null}
      traceCount={0}
      timeZone="Asia/Kolkata"
    />
  )

  assert.match(html, /Healthcare category/)
  assert.match(html, />AL</)
  assert.match(html, /₹899.00/)
  assert.match(html, /\/activity\/merchants\/mer_123/)
  assert.match(html, /\/activity\/categories\/cat_123/)
})
