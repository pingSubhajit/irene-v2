import {
  countOpenReviewQueueItemsForUser,
  ensureSystemCategories,
  listCategoriesForUser,
  listReviewQueueItemsForUser,
  getReviewQueueContext,
} from "@workspace/db"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type ReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type ProposedResolution = {
  action?: "create" | "merge"
  matchedEventIds?: string[]
  eventDraft?: {
    eventType?: string
    amountMinor?: number
    currency?: string
    description?: string | null
  }
  reasonCode?: string
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatAmount(amountMinor: number | undefined, currency: string | undefined) {
  if (typeof amountMinor !== "number" || !currency) {
    return "Unknown amount"
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

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const statusMessage = asSingleValue(params.status)

  await ensureSystemCategories(session.user.id)

  const [openCount, categories, items] = await Promise.all([
    countOpenReviewQueueItemsForUser(session.user.id),
    listCategoriesForUser(session.user.id),
    listReviewQueueItemsForUser({
      userId: session.user.id,
      status: "open",
      limit: 50,
    }),
  ])

  const contexts = await Promise.all(items.map((item) => getReviewQueueContext(item.id)))
  const validContexts = contexts.filter((context) => Boolean(context))

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Phase 4
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          Canonical ledger creation uses a balanced auto-apply policy. Anything that
          looks plausible but not trustworthy enough to auto-merge lands here for an
          explicit owner decision.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Open review items</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
            {openCount}
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Resolution status</p>
          <p className="mt-3 text-sm text-zinc-600">{statusMessage ?? "No recent action"}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {validContexts.length > 0 ? (
          validContexts.map((context) => {
            if (!context) {
              return null
            }

            const proposal = (context.item.proposedResolutionJson ?? {}) as ProposedResolution

            return (
              <article
                key={context.item.id}
                className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-zinc-950">{context.item.title}</p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                      {context.item.explanation}
                    </p>
                  </div>
                  <div className="rounded-full bg-amber-50 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-amber-700">
                    {context.item.itemType}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <ContextCard
                    title="Raw document"
                    lines={[
                      context.rawDocument?.subject ?? "No raw document",
                      context.rawDocument?.fromAddress ?? "",
                      context.rawDocument?.snippet ?? "",
                    ]}
                  />
                  <ContextCard
                    title="Extracted signal"
                    lines={[
                      context.signal?.signalType ?? "No signal",
                      context.signal?.candidateEventType ?? "No candidate event type",
                      `Confidence ${Number(context.signal?.confidence ?? 0).toFixed(2)}`,
                    ]}
                  />
                  <ContextCard
                    title="Proposed resolution"
                    lines={[
                      proposal.action ?? "No proposed action",
                      proposal.eventDraft?.eventType ?? "No event type",
                      formatAmount(proposal.eventDraft?.amountMinor, proposal.eventDraft?.currency),
                    ]}
                  />
                </div>

                {proposal.matchedEventIds && proposal.matchedEventIds.length > 0 ? (
                  <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-950">Matched candidate events</p>
                    <p className="mt-2 break-all">{proposal.matchedEventIds.join(", ")}</p>
                  </div>
                ) : null}

                <form
                  action="/api/review/resolve"
                  method="post"
                  className="mt-6 grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5"
                >
                  <input type="hidden" name="reviewItemId" value={context.item.id} />

                  <div className="grid gap-4 lg:grid-cols-4">
                    <label className="grid gap-2 text-sm text-zinc-700">
                      <span className="font-medium text-zinc-950">Resolution</span>
                      <select
                        name="resolution"
                        defaultValue={proposal.action === "merge" ? "merge" : "approve"}
                        className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
                      >
                        <option value="approve">Approve proposed event</option>
                        <option value="merge">Merge into existing event</option>
                        <option value="ignore">Ignore signal</option>
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm text-zinc-700">
                      <span className="font-medium text-zinc-950">Merge target event ID</span>
                      <input
                        type="text"
                        name="targetEventId"
                        defaultValue={proposal.matchedEventIds?.[0] ?? ""}
                        placeholder="Only needed for merge"
                        className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-zinc-700">
                      <span className="font-medium text-zinc-950">Override merchant</span>
                      <input
                        type="text"
                        name="overrideMerchant"
                        placeholder="Optional merchant override"
                        className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-zinc-700">
                      <span className="font-medium text-zinc-950">Override event type</span>
                      <select
                        name="overrideEventType"
                        defaultValue=""
                        className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
                      >
                        <option value="">Use proposed type</option>
                        <option value="purchase">Purchase</option>
                        <option value="income">Income</option>
                        <option value="subscription_charge">Subscription</option>
                        <option value="emi_payment">EMI</option>
                        <option value="bill_payment">Bill</option>
                        <option value="refund">Refund</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm text-zinc-700 lg:max-w-sm">
                    <span className="font-medium text-zinc-950">Override category</span>
                    <select
                      name="overrideCategoryId"
                      defaultValue=""
                      className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
                    >
                      <option value="">Use proposed category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      Apply resolution
                    </button>
                  </div>
                </form>
              </article>
            )
          })
        ) : (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-sm text-zinc-600">
            No open review items right now.
          </div>
        )}
      </div>
    </section>
  )
}

function ContextCard(props: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-950">{props.title}</p>
      <div className="mt-3 space-y-2 text-sm text-zinc-700">
        {props.lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}
