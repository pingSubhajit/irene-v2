import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { RiPushpin2Fill } from "@remixicon/react"

import { getMemoryFactById, getUserSettings } from "@workspace/db"

import {
  MetaRow,
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import {
  describeMemorySource,
  getMemoryDisplayDetail,
  getMemoryDisplaySummary,
  getMemoryStatusMessage,
  getMemoryStatusLabel,
  isExpiredMemoryFact,
} from "@/components/settings-memory-shared"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Memory detail",
  description: "Memory detail in Irene.",
})

type MemoryDetailPageProps = {
  params: Promise<{ memoryId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function MemoryDetailPage({
  params,
  searchParams,
}: MemoryDetailPageProps) {
  const session = await requireSession()
  const { memoryId } = await params
  const query = (await searchParams) ?? {}
  const statusMessage = getMemoryStatusMessage(asSingleValue(query.memory))
  const [settings, fact] = await Promise.all([
    getUserSettings(session.user.id),
    getMemoryFactById(memoryId),
  ])

  if (!fact || fact.userId !== session.user.id) {
    notFound()
  }

  const expired = isExpiredMemoryFact(fact)
  const statusLabel = fact.isUserPinned ? null : getMemoryStatusLabel(fact)

  return (
    <SettingsSubpageShell
      backHref="/settings/memory"
      title="memory detail"
      description="A single memory Irene can reuse when future finance emails and decisions look similar."
    >
      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      <section className="border-t border-white/[0.06] pt-6">
        {statusLabel ? (
          <p className="neo-kicker mb-3">{statusLabel}</p>
        ) : null}
        <div className="max-w-[34ch]">
          <div className="flex items-start gap-2">
            <p className="text-[1.05rem] leading-7 text-white">{getMemoryDisplaySummary(fact)}</p>
            {fact.isUserPinned ? (
              <RiPushpin2Fill className="mt-1 size-3.5 shrink-0 text-white/34" />
            ) : null}
          </div>
          {getMemoryDisplayDetail(fact) ? (
            <p className="mt-3 text-sm leading-relaxed text-white/34">{getMemoryDisplayDetail(fact)}</p>
          ) : null}
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <MetaRow label="Source" value={describeMemorySource(fact.source)} />
        <MetaRow
          label="Last confirmed"
          value={new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            timeZone: settings.timeZone,
          }).format(fact.lastConfirmedAt ?? fact.updatedAt)}
        />
        <MetaRow label="Confidence" value={fact.confidence.toFixed(2)} />
        {fact.authoredText ? (
          <MetaRow label="Your note" value="saved" description={fact.authoredText} />
        ) : null}
      </section>

      <section className="border-t border-white/[0.06] pt-6">
        <p className="neo-kicker">Actions</p>
        <div className="mt-3 divide-y divide-white/[0.06]">
          <Link
            href={`/settings/memory/${fact.id}/edit`}
            className="flex items-center justify-between gap-4 py-5 text-left transition hover:bg-white/[0.02]"
          >
            <div>
              <p className="text-[15px] text-white">Edit wording</p>
              <p className="mt-1 text-sm leading-6 text-white/30">
                Rewrite this memory in plain language.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.18em] text-white/20">open</span>
          </Link>

          <form action="/api/settings/memory" method="post" className="py-5">
            <input type="hidden" name="action" value={fact.isUserPinned ? "unpin" : "pin"} />
            <input type="hidden" name="memoryFactId" value={fact.id} />
            <input type="hidden" name="returnTo" value={`/settings/memory/${fact.id}`} />
            <button type="submit" className="w-full text-left">
              <p className="text-[15px] text-white">{fact.isUserPinned ? "Unpin" : "Pin"}</p>
              <p className="mt-1 text-sm leading-6 text-white/30">
                {fact.isUserPinned
                  ? "Let Irene weigh this against other evidence again."
                  : "Keep preferring this memory over learned patterns."}
              </p>
            </button>
          </form>

          <form action="/api/settings/memory" method="post" className="py-5">
            <input type="hidden" name="action" value={expired ? "restore" : "expire"} />
            <input type="hidden" name="memoryFactId" value={fact.id} />
            <input type="hidden" name="returnTo" value={`/settings/memory/${fact.id}`} />
            <button type="submit" className="w-full text-left">
              <p className={expired ? "text-[15px] text-white" : "text-[15px] text-[#ff8268]"}>
                {expired ? "Restore" : "Disable"}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/30">
                {expired
                  ? "Bring this memory back into Irene's retrieval flow."
                  : "Keep it visible here but stop Irene from reusing it."}
              </p>
            </button>
          </form>
        </div>
      </section>

      <SettingsFootnote>
        Disabled memory stays out of Irene&apos;s retrieval path until you restore it.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
