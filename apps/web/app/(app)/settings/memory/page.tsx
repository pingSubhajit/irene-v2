import Link from "next/link"

import { getUserSettings, listMemoryFactsForUser } from "@workspace/db"

import { MemoryToolbar } from "@/components/memory-toolbar"
import {
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import {
  getMemoryFamilyLabel,
  getMemoryStatusMessage,
  isExpiredMemoryFact,
  MemoryRow,
} from "@/components/settings-memory-shared"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type MemoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function asArrayValue(value: string | string[] | undefined) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)]
}

function resolveStatus(value: string | undefined) {
  switch (value) {
    case "active":
    case "disabled":
      return value
    default:
      return "all"
  }
}

function resolveSort(value: string | undefined) {
  switch (value) {
    case "oldest":
    case "confidence_desc":
    case "confidence_asc":
      return value
    default:
      return "recent"
  }
}

export default async function MemoryPage({ searchParams }: MemoryPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const query = asSingleValue(params.query) ?? ""
  const status = resolveStatus(asSingleValue(params.status))
  const sort = resolveSort(asSingleValue(params.sort))
  const selectedSources = dedupe(
    asArrayValue(params.source).filter((value) =>
      ["feedback", "review", "automation", "system_rebuild"].includes(value)
    ),
  ) as Array<"feedback" | "review" | "automation" | "system_rebuild">
  const selectedFamilies = dedupe(
    asArrayValue(params.family).filter((value) =>
      ["merchant", "instrument", "institution", "income", "other"].includes(value)
    ),
  ) as Array<"merchant" | "instrument" | "institution" | "income" | "other">
  const pinnedOnly = asSingleValue(params.pinned) === "true"
  const statusMessage = getMemoryStatusMessage(asSingleValue(params.memory))
  const [settings, memoryFacts] = await Promise.all([
    getUserSettings(session.user.id),
    listMemoryFactsForUser({
      userId: session.user.id,
      search: query,
      includeExpired: true,
      limit: 300,
    }),
  ])

  const visibleFacts = memoryFacts.filter((fact) => {
    const expired = isExpiredMemoryFact(fact)

    if (status === "active" && expired) return false
    if (status === "disabled" && !expired) return false
    if (pinnedOnly && !fact.isUserPinned) return false
    if (selectedSources.length > 0 && !selectedSources.includes(fact.source)) return false
    if (selectedFamilies.length > 0 && !selectedFamilies.includes(getMemoryFamilyLabel(fact.factType))) return false

    return true
  })

  const sortedFacts = [...visibleFacts].sort((left, right) => {
    if (sort === "oldest") {
      return left.updatedAt.getTime() - right.updatedAt.getTime()
    }

    if (sort === "confidence_desc") {
      return right.confidence - left.confidence
    }

    if (sort === "confidence_asc") {
      return left.confidence - right.confidence
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime()
  })

  const activeFacts = sortedFacts.filter((fact) => !isExpiredMemoryFact(fact))
  const disabledFacts = sortedFacts.filter((fact) => isExpiredMemoryFact(fact))
  const totalVisible = activeFacts.length + disabledFacts.length

  return (
    <SettingsSubpageShell
      title="memory & learning"
      description="Review what Irene has learned, keep what feels right, and teach it new patterns in plain language."
    >
      <MemoryToolbar
        key={JSON.stringify({
          query,
          status,
          selectedSources,
          selectedFamilies,
          pinnedOnly,
          sort,
        })}
        query={query}
        status={status}
        selectedSources={selectedSources}
        selectedFamilies={selectedFamilies}
        pinnedOnly={pinnedOnly}
        sort={sort}
      />

      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
        <div>
          <p className="text-sm leading-relaxed text-white/30">
            Irene keeps the internal logic behind the scenes so this area stays readable.
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/20">
            {totalVisible} shown · {disabledFacts.length} disabled
          </p>
        </div>
        <Link
          href="/settings/memory/new"
          className="shrink-0 border border-white/[0.08] px-4 py-2 text-sm text-white/72 transition hover:bg-white/[0.03]"
        >
          Teach Irene
        </Link>
      </div>

      <section className="border-t border-white/[0.06] pt-6">
        {visibleFacts.length === 0 ? (
          <div className="py-6 text-sm leading-relaxed text-white/36">
            No memory yet. Irene will start filling this area as you edit data, resolve reviews, and teach it patterns you care about.
          </div>
        ) : (
          <div className="grid gap-8">
            {activeFacts.length > 0 ? (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <p className="neo-kicker">Active</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/20">
                    {activeFacts.length}
                  </p>
                </div>
                <div className="mt-2 divide-y divide-white/[0.06]">
                  {activeFacts.map((fact) => (
                    <MemoryRow key={fact.id} fact={fact} timeZone={settings.timeZone} />
                  ))}
                </div>
              </section>
            ) : null}

            {disabledFacts.length > 0 ? (
              <section className={activeFacts.length > 0 ? "border-t border-white/[0.06] pt-6" : ""}>
                <div className="flex items-center justify-between gap-3">
                  <p className="neo-kicker">Disabled</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/20">
                    {disabledFacts.length}
                  </p>
                </div>
                <div className="mt-2 divide-y divide-white/[0.06]">
                  {disabledFacts.map((fact) => (
                    <MemoryRow key={fact.id} fact={fact} timeZone={settings.timeZone} />
                  ))}
                </div>
              </section>
            ) : null}

            {activeFacts.length === 0 && disabledFacts.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm leading-relaxed text-white/30">
                  No memory matches the current filters.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <SettingsFootnote>
        Pinned memory outranks learned memory. Disabled memory stays visible here so you can restore it later.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
