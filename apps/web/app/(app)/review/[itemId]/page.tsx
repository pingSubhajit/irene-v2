import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  countOpenReviewQueueItemsForUser,
  ensureSystemCategories,
  getReviewQueueContext,
  getUserSettings,
  listCategoriesForUser,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"

import { ReviewDecisionCard } from "@/components/review-decision-card"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"
import { buildReviewEntry } from "../review-view"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Review item",
  description: "Review one Irene item.",
})

type ReviewItemPageProps = {
  params: Promise<{ itemId: string }>
}

export default async function ReviewItemPage({ params }: ReviewItemPageProps) {
  const session = await requireSession()
  const { itemId } = await params

  await ensureSystemCategories(session.user.id)

  const [settings, categories, openCount, context] = await Promise.all([
    getUserSettings(session.user.id),
    listCategoriesForUser(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    getReviewQueueContext(itemId),
  ])

  if (!context || context.item.userId !== session.user.id || context.item.status !== "open") {
    notFound()
  }

  const detail = buildReviewEntry(context, settings.timeZone)

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="border-b border-white/[0.06] pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/review"
              className="text-[0.72rem] font-semibold tracking-[0.18em] text-white/32 uppercase transition hover:text-white/56"
            >
              Review queue
            </Link>
            <h1 className="mt-3 text-[1.7rem] font-semibold tracking-tight text-white">
              review item
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Confirm the extracted context or correct it before Irene commits it.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[0.68rem] font-semibold tracking-[0.22em] text-white/28 uppercase">
                Open queue
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {openCount}
              </p>
            </div>
            <Badge variant="warning">Needs review</Badge>
          </div>
        </div>
      </header>

      <ReviewDecisionCard
        reviewItemId={detail.id}
        reviewKind={detail.reviewKind}
        itemType={detail.itemType}
        title={detail.title}
        explanation={detail.explanation}
        rawDocumentTitle={detail.rawDocumentTitle}
        rawDocumentSubtitle={detail.rawDocumentSubtitle}
        signalType={detail.signalType}
        candidateEventType={detail.candidateEventType}
        confidenceLabel={detail.confidenceLabel}
        proposedAction={detail.proposedAction}
        proposedType={detail.proposedType}
        proposedAmount={detail.proposedAmount}
        matchedIds={detail.matchedIds}
        categories={categories}
        returnPath="/review"
      />
    </section>
  )
}
