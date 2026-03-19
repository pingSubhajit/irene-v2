import {
  countOpenReviewQueueItemsForUser,
  ensureSystemCategories,
  getReviewQueueContext,
  listCategoriesForUser,
  listReviewQueueItemsForUser,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

import { ReviewDecisionCard } from "@/components/review-decision-card"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type ReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type ProposedResolution = {
  action?: "create" | "merge"
  matchedEventIds?: string[]
  matchedRecurringModelIds?: string[]
  matchedPaymentInstrumentIds?: string[]
  kind?:
    | "event"
    | "recurring_obligation"
    | "emi_plan"
    | "income_stream"
    | "payment_instrument_resolution"
    | "merchant_resolution"
    | "category_resolution"
  recurringType?: "subscription" | "bill" | "emi"
  incomeType?: "salary" | "freelance" | "reimbursement" | "transfer_in" | "other"
  canonicalInstitutionName?: string | null
  canonicalInstrumentType?: string | null
  canonicalMerchantName?: string | null
  canonicalProcessorName?: string | null
  categorySlug?: string | null
  categoryReason?: string | null
  matchedMerchantIds?: string[]
  matchedProcessorIds?: string[]
  eventDraft?: {
    eventType?: string
    amountMinor?: number
    currency?: string
  }
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatAmount(amountMinor: number | undefined, currency: string | undefined) {
  if (typeof amountMinor !== "number" || !currency) {
    return "Amount unclear"
  }

  const amount = amountMinor / 100

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatStatusMessage(value: string | undefined) {
  switch (value) {
    case "resolved":
      return "Resolution saved. Irene updated the ledger."
    case "merged":
      return "Resolution merged into an existing event."
    case "ignored":
      return "Signal ignored."
    case "already-reconciled":
      return "This item was already reconciled earlier."
    default:
      return null
  }
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const statusMessage = formatStatusMessage(asSingleValue(params.status))

  await ensureSystemCategories(session.user.id)

  const [openCount, categories, items] = await Promise.all([
    countOpenReviewQueueItemsForUser(session.user.id),
    listCategoriesForUser(session.user.id),
    listReviewQueueItemsForUser({
      userId: session.user.id,
      status: "open",
      limit: 40,
    }),
  ])

  const contexts = (await Promise.all(items.map((item) => getReviewQueueContext(item.id)))).filter(
    (context): context is NonNullable<Awaited<ReturnType<typeof getReviewQueueContext>>> =>
      context !== null,
  )

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="neo-kicker">Review</p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
            resolve what
            <br />
            Irene is unsure
            <br />
            about.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            These are the moments where the system saw a plausible money event but
            wants your final word before treating it as truth.
          </p>
        </div>

        <div className="grid gap-4 self-start">
          <Card className="p-5">
            <p className="neo-kicker">Open queue</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-[3rem] leading-none text-white">
                  {openCount}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/56">
                  Items still need a decision before they can become canonical ledger
                  events.
                </p>
              </div>
              <Badge variant={openCount > 0 ? "warning" : "success"}>
                {openCount > 0 ? "Needs attention" : "Clear"}
              </Badge>
            </div>
          </Card>

          {statusMessage ? (
            <Card className="border-[var(--neo-green)]/25 bg-[rgba(114,255,194,0.06)] p-5">
              <p className="neo-kicker text-[var(--neo-green)]">Latest change</p>
              <p className="mt-3 text-sm leading-6 text-white/76">{statusMessage}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4">
        {contexts.length > 0 ? (
          contexts.map((context) => {
            const proposal = (context.item.proposedResolutionJson ?? {}) as ProposedResolution
            const confidence = Number(
              context.signal?.confidence ??
                (typeof context.item.proposedResolutionJson?.confidence === "number"
                  ? context.item.proposedResolutionJson.confidence
                  : 0),
            ).toFixed(2)
            const rawDocumentTitle =
              context.rawDocument?.subject ??
              context.event?.description ??
              "Supporting context unavailable"
            const rawDocumentSubtitle = [
              context.rawDocument?.fromAddress ?? "Unknown sender",
              context.rawDocument?.messageTimestamp
                ? new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(context.rawDocument.messageTimestamp)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
            const reviewKind = proposal.kind ?? "event"
            const proposedType =
              reviewKind === "payment_instrument_resolution"
                ? `${proposal.canonicalInstitutionName ?? "Unknown issuer"} · ${
                    proposal.canonicalInstrumentType ?? "unknown"
                  }`
                : reviewKind === "merchant_resolution" || reviewKind === "category_resolution"
                ? [
                    proposal.canonicalMerchantName ?? "Unknown merchant",
                    proposal.canonicalProcessorName
                      ? `via ${proposal.canonicalProcessorName}`
                      : null,
                    proposal.categorySlug ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : reviewKind === "income_stream"
                ? proposal.incomeType ?? "income stream"
                : reviewKind === "recurring_obligation" || reviewKind === "emi_plan"
                  ? proposal.recurringType ?? "recurring model"
                  : proposal.eventDraft?.eventType ?? "generic_finance"
            const matchedIds =
              proposal.matchedProcessorIds ??
              proposal.matchedMerchantIds ??
              proposal.matchedPaymentInstrumentIds ??
              proposal.matchedRecurringModelIds ??
              proposal.matchedEventIds ??
              []

            return (
              <ReviewDecisionCard
                key={context.item.id}
                reviewItemId={context.item.id}
                reviewKind={reviewKind}
                itemType={context.item.itemType.replaceAll("_", " ")}
                title={context.item.title}
                explanation={context.item.explanation}
                rawDocumentTitle={rawDocumentTitle}
                rawDocumentSubtitle={rawDocumentSubtitle}
                signalType={context.signal?.signalType ?? "signal unavailable"}
                candidateEventType={context.signal?.candidateEventType ?? "untyped"}
                confidenceLabel={`confidence ${confidence}`}
                proposedAction={proposal.action ?? "review"}
                proposedType={proposedType}
                proposedAmount={formatAmount(
                  proposal.eventDraft?.amountMinor,
                  proposal.eventDraft?.currency,
                )}
                matchedIds={matchedIds}
                categories={categories}
              />
            )
          })
        ) : (
          <Card className="p-6 md:p-8">
            <p className="neo-kicker">All clear</p>
            <h2 className="mt-4 font-display text-[2.2rem] leading-none text-white">
              no open decisions.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/58">
              Irene can reconcile the current activity without your input right now.
              When something becomes ambiguous, it will appear here as a quick decision
              instead of a hidden system conflict.
            </p>
          </Card>
        )}
      </div>
    </section>
  )
}
