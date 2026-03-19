"use client"

import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
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
    <>
      <Card className="border-white/8 bg-[rgba(18,18,20,0.94)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="neo-kicker">{itemType}</p>
            <h2 className="mt-3 font-display text-[2rem] leading-none text-white">{title}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/64">{explanation}</p>
          </div>
          <Badge variant="warning">Needs review</Badge>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <ContextBlock title="Raw document" primary={rawDocumentTitle} secondary={rawDocumentSubtitle} />
          <ContextBlock title="Extracted signal" primary={signalType} secondary={`${candidateEventType} · ${confidenceLabel}`} />
          <ContextBlock title="Proposal" primary={proposedType} secondary={`${proposedAction} · ${proposedAmount}`} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <form action="/api/review/resolve" method="post">
            <input type="hidden" name="reviewItemId" value={reviewItemId} />
            <input type="hidden" name="resolution" value="approve" />
            <Button variant="secondary">Approve</Button>
          </form>
          <Button variant="outline" onClick={() => setAdvancedOpen(true)}>
            Fix details
          </Button>
          <form action="/api/review/resolve" method="post">
            <input type="hidden" name="reviewItemId" value={reviewItemId} />
            <input type="hidden" name="resolution" value="ignore" />
            <Button variant="ghost">Ignore</Button>
          </form>
        </div>
      </Card>

      {advancedOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-0 pt-10 backdrop-blur-sm md:items-center md:p-6">
          <div className="w-full max-w-2xl border border-white/10 bg-[rgba(15,15,16,0.98)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.65)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="neo-kicker">Advanced resolution</p>
                <h3 className="mt-3 font-display text-[2rem] leading-none text-white">
                  Refine this event
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen(false)}>
                Close
              </Button>
            </div>

            <form action="/api/review/resolve" method="post" className="mt-6 grid gap-4">
              <input type="hidden" name="reviewItemId" value={reviewItemId} />

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-white/72">
                  <span className="font-medium text-white">Resolution</span>
                  <Select name="resolution" defaultValue={matchedIds.length > 0 ? "merge" : "approve"}>
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
                </label>

                <label className="grid gap-2 text-sm text-white/72">
                  <span className="font-medium text-white">
                    {isInstrumentResolution
                      ? "Merge target instrument ID"
                      : isMerchantResolution
                        ? "Merge target merchant ID"
                      : isRecurring
                        ? "Merge target recurring model ID"
                        : "Merge target event ID"}
                  </span>
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
                    placeholder={isRecurring ? "Only needed for merge" : "Only needed for merge"}
                  />
                </label>

                {isMerchantResolution ? (
                  <label className="grid gap-2 text-sm text-white/72">
                    <span className="font-medium text-white">Target processor ID</span>
                    <Input
                      name="targetProcessorId"
                      placeholder="Optional existing processor"
                    />
                  </label>
                ) : null}

                <label className="grid gap-2 text-sm text-white/72">
                  <span className="font-medium text-white">
                    {isInstrumentResolution ? "Override institution" : "Override merchant"}
                  </span>
                  <Input
                    name={isInstrumentResolution ? "overrideInstitution" : "overrideMerchant"}
                    placeholder={
                      isInstrumentResolution
                        ? "Optional institution override"
                        : "Optional merchant override"
                    }
                  />
                </label>

                {isMerchantResolution ? (
                  <label className="grid gap-2 text-sm text-white/72">
                    <span className="font-medium text-white">Override processor</span>
                    <Input
                      name="overrideProcessor"
                      placeholder="Optional processor override"
                    />
                  </label>
                ) : null}

                {reviewKind === "event" ? (
                  <label className="grid gap-2 text-sm text-white/72">
                    <span className="font-medium text-white">Override event type</span>
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
                  </label>
                ) : reviewKind === "payment_instrument_resolution" ? (
                  <label className="grid gap-2 text-sm text-white/72">
                    <span className="font-medium text-white">Override instrument type</span>
                    <Select name="overrideInstrumentType" defaultValue="">
                      <option value="">Use proposed type</option>
                      <option value="credit_card">Credit card</option>
                      <option value="debit_card">Debit card</option>
                      <option value="bank_account">Bank account</option>
                      <option value="upi">UPI</option>
                      <option value="wallet">Wallet</option>
                      <option value="unknown">Unknown</option>
                    </Select>
                  </label>
                ) : isMerchantResolution ? (
                  <div className="hidden md:block" />
                ) : reviewKind === "recurring_obligation" || reviewKind === "emi_plan" ? (
                  <label className="grid gap-2 text-sm text-white/72">
                    <span className="font-medium text-white">Override recurring type</span>
                    <Select name="overrideRecurringType" defaultValue="">
                      <option value="">Use proposed type</option>
                      <option value="subscription">Subscription</option>
                      <option value="bill">Bill</option>
                      <option value="emi">EMI</option>
                    </Select>
                  </label>
                ) : (
                  <div className="hidden md:block" />
                )}
              </div>

              {canOverrideCategory ? (
                <label className="grid gap-2 text-sm text-white/72">
                  <span className="font-medium text-white">Override category</span>
                  <Select name="overrideCategoryId" defaultValue="">
                    <option value="">Use proposed category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}

              {matchedIds.length > 0 ? (
                <div className="border border-white/8 bg-black/20 p-4">
                  <p className="neo-kicker">
                    {isInstrumentResolution
                      ? "Candidate instruments"
                      : isMerchantResolution
                        ? "Candidate merchants / processors"
                      : isRecurring
                        ? "Candidate recurring models"
                        : "Candidate events"}
                  </p>
                  <p className="mt-3 break-all text-sm text-white/66">
                    {matchedIds.join(", ")}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="secondary" type="submit">
                  Apply resolution
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdvancedOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ContextBlock(props: { title: string; primary: string; secondary: string }) {
  return (
    <div className="border border-white/8 bg-black/16 p-4">
      <p className="neo-kicker">{props.title}</p>
      <p className="mt-3 text-base font-semibold text-white">{props.primary}</p>
      <p className="mt-2 text-sm leading-6 text-white/56">{props.secondary}</p>
    </div>
  )
}
