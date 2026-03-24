import Link from "next/link"

import {
  ensureSystemCategories,
  getReviewQueueContext,
  getUserSettings,
  listReviewQueueItemsForUser,
} from "@workspace/db"

import { AppEmptyState } from "@/components/app-empty-state"
import { requireSession } from "@/lib/session"
import {
  asSingleValue,
  buildReviewEntry,
  buildReviewItemHref,
  formatStatusMessage,
} from "./review-view"

export const dynamic = "force-dynamic"

type ReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getListDateLabel(subtitle: string) {
  const segments = subtitle
    .split(" · ")
    .map((segment) => segment.trim())
    .filter(Boolean)

  return segments.at(-1) ?? subtitle
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const status = asSingleValue(params.status)
  const statusMessage = formatStatusMessage(status)

  await ensureSystemCategories(session.user.id)

  const [settings, items] = await Promise.all([
    getUserSettings(session.user.id),
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

  const entries = contexts.map((context) => buildReviewEntry(context, settings.timeZone))

  if (entries.length === 0) {
    return (
      <section className="mx-auto max-w-4xl">
        <header className="border-b border-white/[0.06] pb-6">
          <p className="text-[0.68rem] font-semibold tracking-[0.22em] text-white/28 uppercase">
            Review
          </p>
          <h1 className="mt-3 text-[1.7rem] font-semibold tracking-tight text-white">
            queue
          </h1>
        </header>

        <div className="mt-6">
          <AppEmptyState
            title="No open decisions"
            description="Everything in the queue is settled for now."
          />
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="border-b border-white/[0.06] pb-6">
        <p className="text-[0.68rem] font-semibold tracking-[0.22em] text-white/28 uppercase">
          Review
        </p>
        <h1 className="mt-3 text-[1.7rem] font-semibold tracking-tight text-white">
          review queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
          Open an item to review its context and decide what Irene should keep.
        </p>
      </header>

      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/66">{statusMessage}</p>
        </div>
      ) : null}

      <div className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4 py-3">
          <p className="text-[0.72rem] font-semibold tracking-[0.2em] text-white/28 uppercase">
            Items to review
          </p>
          <p className="text-sm text-white/38">{entries.length}</p>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {entries.map((detail) => {
            const dateLabel = getListDateLabel(detail.rawDocumentSubtitle)

            return (
              <Link
                key={detail.id}
                href={buildReviewItemHref(detail.id)}
                className="block transition hover:bg-white/[0.02]"
              >
                <div className="flex items-start gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-[15px] font-medium text-white">
                        {detail.title}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-white/34">
                      <span>{dateLabel}</span> · <span className="uppercase tracking-[0.16em]">{detail.itemType}</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
