import Link from "next/link"
import { RiArrowRightSLine, RiPushpin2Fill } from "@remixicon/react"

import type { MemoryFactSelect } from "@workspace/db"

import { formatDateTime, settingsRowClassName } from "@/components/settings-accounts-shared"

export function getMemoryStatusMessage(value: string | undefined) {
  switch (value) {
    case "created":
      return "Memory saved. Irene can start using it right away."
    case "updated":
      return "Memory updated."
    case "pinned":
      return "Memory pinned. Irene will keep preferring it over learned facts."
    case "unpinned":
      return "Memory unpinned."
    case "expired":
      return "Memory disabled."
    case "restored":
      return "Memory restored."
    case "invalid":
      return "That memory action could not be applied."
    default:
      return null
  }
}

export function describeMemorySource(source: string) {
  switch (source) {
    case "feedback":
      return "from your edits"
    case "review":
      return "from review"
    case "automation":
      return "learned"
    case "system_rebuild":
      return "rebuilt"
    default:
      return source
  }
}

export function isExpiredMemoryFact(fact: Pick<MemoryFactSelect, "expiresAt" | "updatedAt">) {
  return fact.expiresAt ? fact.expiresAt.getTime() <= fact.updatedAt.getTime() : false
}

function titleCase(input: string | null | undefined) {
  if (!input) return null

  return input
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function getMemoryFamilyLabel(factType: string) {
  if (factType.startsWith("merchant_")) return "merchant"
  if (factType.startsWith("instrument_")) return "instrument"
  if (factType === "sender_institution_alias") return "institution"
  if (factType === "income_timing_expectation") return "income"
  return "other"
}

export function getMemoryDisplaySummary(fact: Pick<MemoryFactSelect, "summaryText" | "factType" | "key" | "valueJson">) {
  if (fact.summaryText?.trim()) {
    return fact.summaryText.trim()
  }

  const value = fact.valueJson ?? {}

  switch (fact.factType) {
    case "merchant_category_default": {
      const merchantName = asString(value.merchantName) ?? titleCase(fact.key) ?? "This merchant"
      const categoryName = asString(value.categoryName) ?? "the right category"
      return `${merchantName} usually belongs in ${categoryName}.`
    }
    case "merchant_alias": {
      const alias = asString(value.alias) ?? titleCase(fact.key) ?? "This alias"
      const merchantName = asString(value.merchantName) ?? "the same merchant"
      return `${alias} refers to ${merchantName}.`
    }
    case "merchant_recurring_hint": {
      const merchantName = asString(value.merchantName) ?? titleCase(fact.key) ?? "This merchant"
      return `${merchantName} is usually a recurring charge.`
    }
    case "merchant_preferred_processor": {
      const merchantName = asString(value.merchantName) ?? titleCase(fact.key) ?? "This merchant"
      const processorName = asString(value.processorName) ?? "the same processor"
      return `${merchantName} usually comes through ${processorName}.`
    }
    case "merchant_preferred_event_type": {
      const merchantName = asString(value.merchantName) ?? titleCase(fact.key) ?? "This merchant"
      const eventType = titleCase(asString(value.eventType)) ?? "the same event type"
      return `${merchantName} is usually treated as ${eventType.toLowerCase()}.`
    }
    case "sender_institution_alias": {
      const alias = asString(value.alias) ?? fact.key
      const institutionName = asString(value.institutionName) ?? "the same institution"
      return `Emails from ${alias} refer to ${institutionName}.`
    }
    case "instrument_type_preference": {
      const displayName = asString(value.displayName) ?? asString(value.maskedIdentifier) ?? titleCase(fact.key) ?? "This instrument"
      const instrumentType = titleCase(asString(value.instrumentType)) ?? "the current type"
      return `${displayName} should be treated as ${instrumentType.toLowerCase()}.`
    }
    case "instrument_backing_account_link": {
      const displayName = asString(value.displayName) ?? asString(value.maskedIdentifier) ?? titleCase(fact.key) ?? "This instrument"
      const backingDisplayName = asString(value.backingDisplayName) ?? asString(value.backingMaskedIdentifier) ?? "its linked cash account"
      return `${displayName} is usually linked to ${backingDisplayName}.`
    }
    case "income_timing_expectation": {
      const name = asString(value.name) ?? titleCase(fact.key) ?? "This income"
      const cadence = titleCase(asString(value.cadence)) ?? "its usual cadence"
      const expectedDay = asNumber(value.expectedDayOfMonth)
      return expectedDay
        ? `${name} usually arrives ${cadence.toLowerCase()} around day ${expectedDay}.`
        : `${name} usually arrives ${cadence.toLowerCase()}.`
    }
    default:
      return titleCase(fact.key) ?? "Memory"
  }
}

export function getMemoryDisplayDetail(fact: Pick<MemoryFactSelect, "detailText" | "factType" | "valueJson">) {
  if (fact.detailText?.trim()) {
    return fact.detailText.trim()
  }

  const value = fact.valueJson ?? {}

  switch (fact.factType) {
    case "merchant_category_default":
    case "merchant_preferred_processor":
    case "merchant_preferred_event_type": {
      const sampleCount = asNumber(value.sampleCount)
      return sampleCount ? `Learned from ${sampleCount} matching examples.` : null
    }
    case "merchant_recurring_hint": {
      const obligationType = titleCase(asString(value.obligationType))
      return obligationType ? `Stored as a ${obligationType.toLowerCase()} pattern.` : null
    }
    default:
      return null
  }
}

export function getMemoryStatusLabel(fact: MemoryFactSelect) {
  const expired = isExpiredMemoryFact(fact)

  if (expired) {
    return "disabled"
  }

  if (fact.source === "feedback" || fact.source === "review") {
    return describeMemorySource(fact.source)
  }

  return null
}

export function MemoryStatusLabel({ fact }: { fact: MemoryFactSelect }) {
  const label = getMemoryStatusLabel(fact)

  if (!label) {
    return null
  }

  return <span className="text-[11px] uppercase tracking-[0.18em] text-white/28">{label}</span>
}

function MemoryAdornment({ fact }: { fact: MemoryFactSelect }) {
  if (fact.isUserPinned) {
    return <RiPushpin2Fill className="mt-1 size-3.5 shrink-0 text-white/34" />
  }

  const label = getMemoryStatusLabel(fact)
  if (!label) {
    return null
  }

  return <span className="text-[11px] uppercase tracking-[0.18em] text-white/28">{label}</span>
}

export function MemoryRow({
  fact,
  timeZone,
}: {
  fact: MemoryFactSelect
  timeZone: string
}) {
  const detail = getMemoryDisplayDetail(fact)
  const timestamp = formatDateTime(fact.lastConfirmedAt ?? fact.updatedAt, timeZone)
  const meta =
    fact.source === "automation"
      ? timestamp
      : `${describeMemorySource(fact.source)} · ${timestamp}`

  return (
    <Link
      href={`/settings/memory/${fact.id}`}
      className={`${settingsRowClassName} gap-4 border-t border-white/[0.06] first:border-t-0`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-6 text-white">{getMemoryDisplaySummary(fact)}</p>
            {detail ? (
              <p className="mt-1 text-sm leading-6 text-white/30">{detail}</p>
            ) : null}
          </div>
          <MemoryAdornment fact={fact} />
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/20">{meta}</p>
      </div>
      <RiArrowRightSLine className="size-4 shrink-0 text-white/24" />
    </Link>
  )
}
