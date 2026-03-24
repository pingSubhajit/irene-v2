"use client"

import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Select } from "@workspace/ui/components/select"

type ReviewDecisionCardProps = {
  reviewItemId: string
  reviewKind:
    | "event"
    | "recurring_obligation"
    | "emi_plan"
    | "income_stream"
    | "payment_instrument_resolution"
    | "merchant_resolution"
    | "category_resolution"
  itemType: string
  title: string
  explanation: string
  rawDocumentTitle: string
  rawDocumentSubtitle: string
  signalType: string
  candidateEventType: string
  confidenceLabel: string
  proposedAction: string
  proposedType: string
  proposedAmount: string
  matchedIds: string[]
  categories: Array<{ id: string; name: string }>
  returnPath?: string
}

export function ReviewDecisionCard({
  reviewItemId,
  reviewKind,
  itemType,
  title,
  explanation,
  rawDocumentTitle,
  rawDocumentSubtitle,
  signalType,
  candidateEventType,
  confidenceLabel,
  proposedAction,
  proposedType,
  proposedAmount,
  matchedIds,
  categories,
  returnPath = "/review",
}: ReviewDecisionCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const isRecurring =
    reviewKind === "recurring_obligation" ||
    reviewKind === "emi_plan" ||
    reviewKind === "income_stream"
  const isInstrumentResolution = reviewKind === "payment_instrument_resolution"
  const isMerchantResolution =
    reviewKind === "merchant_resolution" || reviewKind === "category_resolution"
  const canOverrideCategory =
    reviewKind === "event" ||
    reviewKind === "recurring_obligation" ||
    reviewKind === "emi_plan" ||
    isMerchantResolution

  return (
    <div className="grid gap-6 lg:sticky lg:top-24">
      <div className="border-b border-white/[0.06] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-white/34">
              <span className="uppercase tracking-[0.18em]">{itemType}</span>
              <span>·</span>
              <span>{signalType}</span>
            </div>
            <h2 className="mt-4 max-w-[16ch] font-display text-[2.4rem] leading-[0.94] text-white md:text-[3.2rem]">
              {title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">{explanation}</p>
          </div>
          <Badge variant="warning">Needs review</Badge>
        </div>
      </div>

      <div className="grid gap-4 border-y border-white/[0.06] py-4 md:grid-cols-3 md:divide-x md:divide-white/[0.06] md:py-0">
        <DetailRail
          eyebrow="Raw document"
          title={rawDocumentTitle}
          detail={rawDocumentSubtitle}
        />
        <DetailRail
          eyebrow="Extracted signal"
          title={signalType}
          detail={`${candidateEventType} · ${confidenceLabel}`}
        />
        <DetailRail
          eyebrow="Proposed outcome"
          title={proposedType}
          detail={`${proposedAction} · ${proposedAmount}`}
          emphasize
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/api/review/resolve" method="post">
          <input type="hidden" name="reviewItemId" value={reviewItemId} />
          <input type="hidden" name="resolution" value="approve" />
          <input type="hidden" name="returnPath" value={returnPath} />
          <Button variant="secondary">Approve</Button>
        </form>

        <Button variant="outline" onClick={() => setAdvancedOpen((open) => !open)}>
          {advancedOpen ? "Hide fixes" : "Fix details"}
        </Button>

        <form action="/api/review/resolve" method="post">
          <input type="hidden" name="reviewItemId" value={reviewItemId} />
          <input type="hidden" name="resolution" value="ignore" />
          <input type="hidden" name="returnPath" value={returnPath} />
          <Button variant="ghost">Ignore</Button>
        </form>
      </div>

      {advancedOpen ? (
        <form action="/api/review/resolve" method="post" className="grid gap-6">
          <input type="hidden" name="reviewItemId" value={reviewItemId} />
          <input type="hidden" name="returnPath" value={returnPath} />

          <div className="border-y border-white/[0.06]">
            <div className="grid gap-3 py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-4">
              <p className="text-[0.72rem] font-semibold tracking-[0.18em] text-white/28 uppercase">
                Resolution
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Decision">
                  <Select
                    name="resolution"
                    defaultValue={matchedIds.length > 0 ? "merge" : "approve"}
                  >
                    <option value="approve">
                      {isInstrumentResolution
                        ? "Approve instrument resolution"
                        : isMerchantResolution
                          ? "Approve merchant resolution"
                          : isRecurring
                            ? "Confirm recurring model"
                            : "Approve proposed event"}
                    </option>
                    <option value="merge">
                      {isInstrumentResolution
                        ? "Merge into existing instrument"
                        : isMerchantResolution
                          ? "Merge into existing merchant"
                          : isRecurring
                            ? "Merge into existing recurring model"
                            : "Merge into existing event"}
                    </option>
                    <option value="ignore">
                      {isInstrumentResolution
                        ? "Ignore instrument observations"
                        : isMerchantResolution
                          ? "Ignore merchant observations"
                          : isRecurring
                            ? "Ignore recurring hypothesis"
                            : "Ignore signal"}
                    </option>
                  </Select>
                </Field>

                <Field
                  label={
                    isInstrumentResolution
                      ? "Merge target instrument ID"
                      : isMerchantResolution
                        ? "Merge target merchant ID"
                        : isRecurring
                          ? "Merge target recurring model ID"
                          : "Merge target event ID"
                  }
                >
                  <Input
                    name={
                      isInstrumentResolution
                        ? "targetPaymentInstrumentId"
                        : isMerchantResolution
                          ? "targetMerchantId"
                          : isRecurring
                            ? "targetRecurringModelId"
                            : "targetEventId"
                    }
                    defaultValue={matchedIds[0] ?? ""}
                    placeholder="Only needed for merge"
                  />
                </Field>

                {isMerchantResolution ? (
                  <Field label="Target processor ID">
                    <Input
                      name="targetProcessorId"
                      placeholder="Optional existing processor"
                    />
                  </Field>
                ) : null}

                <Field
                  label={isInstrumentResolution ? "Override institution" : "Override merchant"}
                >
                  <Input
                    name={isInstrumentResolution ? "overrideInstitution" : "overrideMerchant"}
                    placeholder={
                      isInstrumentResolution
                        ? "Optional institution override"
                        : "Optional merchant override"
                    }
                  />
                </Field>

                {isMerchantResolution ? (
                  <Field label="Override processor">
                    <Input
                      name="overrideProcessor"
                      placeholder="Optional processor override"
                    />
                  </Field>
                ) : null}

                {reviewKind === "event" ? (
                  <Field label="Override event type">
                    <Select name="overrideEventType" defaultValue="">
                      <option value="">Use proposed type</option>
                      <option value="purchase">Purchase</option>
                      <option value="income">Income</option>
                      <option value="subscription_charge">Subscription</option>
                      <option value="emi_payment">EMI</option>
                      <option value="bill_payment">Bill</option>
                      <option value="refund">Refund</option>
                      <option value="transfer">Transfer</option>
                    </Select>
                  </Field>
                ) : reviewKind === "payment_instrument_resolution" ? (
                  <Field label="Override instrument type">
                    <Select name="overrideInstrumentType" defaultValue="">
                      <option value="">Use proposed type</option>
                      <option value="credit_card">Credit card</option>
                      <option value="debit_card">Debit card</option>
                      <option value="bank_account">Bank account</option>
                      <option value="upi">UPI</option>
                      <option value="wallet">Wallet</option>
                      <option value="unknown">Unknown</option>
                    </Select>
                  </Field>
                ) : reviewKind === "recurring_obligation" || reviewKind === "emi_plan" ? (
                  <Field label="Override recurring type">
                    <Select name="overrideRecurringType" defaultValue="">
                      <option value="">Use proposed type</option>
                      <option value="subscription">Subscription</option>
                      <option value="bill">Bill</option>
                      <option value="emi">EMI</option>
                    </Select>
                  </Field>
                ) : null}
              </div>
            </div>

            {canOverrideCategory ? (
              <div className="grid gap-3 border-t border-white/[0.06] py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-4">
                <p className="text-[0.72rem] font-semibold tracking-[0.18em] text-white/28 uppercase">
                  Classification
                </p>
                <div className="grid gap-4 md:max-w-md">
                  <Field label="Override category">
                    <Select name="overrideCategoryId" defaultValue="">
                      <option value="">Use proposed category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            ) : null}

            {matchedIds.length > 0 ? (
              <div className="grid gap-3 border-t border-white/[0.06] py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-4">
                <p className="text-[0.72rem] font-semibold tracking-[0.18em] text-white/28 uppercase">
                  Candidate IDs
                </p>
                <p className="break-all text-sm leading-6 text-white/52">
                  {matchedIds.join(", ")}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" type="submit">
              Apply resolution
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdvancedOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function DetailRail({
  eyebrow,
  title,
  detail,
  emphasize = false,
}: {
  eyebrow: string
  title: string
  detail: string
  emphasize?: boolean
}) {
  return (
    <div className="px-0 py-1 md:px-5 md:py-4">
      <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-white/26 uppercase">
        {eyebrow}
      </p>
      <p
        className={`mt-3 text-base font-medium ${
          emphasize ? "text-white" : "text-white/88"
        }`}
      >
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-white/46">{detail}</p>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-2 text-sm text-white/68">
      <span className="font-medium text-white/92">{label}</span>
      {children}
    </label>
  )
}
