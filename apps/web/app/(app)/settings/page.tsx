import type { Metadata } from "next"
import Link from "next/link"
import { RiArrowRightSLine } from "@remixicon/react"
import {
  getAuthUserProfile,
  getLatestForecastRunWithSnapshots,
  listMemoryFactsForUser,
  getUserSettings,
  listCashPaymentInstrumentsForUser,
  listDebitAndUpiPaymentInstrumentsForUser,
} from "@workspace/db"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { InboxSettingsRows } from "@/components/inbox-settings-rows"
import { PwaStatusCard } from "@/components/pwa-status-card"
import { PwaSnapshotHydrator } from "@/components/pwa-snapshot-hydrator"
import { ReportingCurrencyRow } from "@/components/reporting-currency-row"
import { SignOutRow } from "@/components/sign-out-row"
import { TimeZoneRow } from "@/components/time-zone-row"
import { formatInUserTimeZone } from "@/lib/date-format"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { createPrivateMetadata } from "@/lib/metadata"
import {
  PWA_SNAPSHOT_VERSION,
  type PwaRouteSnapshot,
} from "@/lib/pwa/contracts"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Settings",
  description: "Settings for Irene.",
})

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "connected":
      return "Gmail connected. Irene has started syncing your inbox."
    case "account-mismatch":
      return "The Gmail account you picked did not match your Irene owner account."
    case "invalid-state":
      return "The Gmail connection flow expired. Try connecting again."
    case "oauth-error":
      return "Google returned an OAuth error before the inbox could be connected."
    case "connect-failed":
      return "Irene could not finish the Gmail connection. Try again."
    case "updated":
      return "Reporting currency updated. Irene has started revaluing your historical events."
    case "invalid-currency":
      return "The selected reporting currency is not supported yet."
    case "save-failed":
      return "Irene could not save the new reporting currency."
    case "updated-time-zone":
      return "Time zone updated. Irene will render dates using your chosen zone."
    case "invalid-time-zone":
      return "The selected time zone is not supported."
    case "time-zone-save-failed":
      return "Irene could not save the new time zone."
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

function formatMemberSince(value: Date | null | undefined, timeZone: string) {
  if (!value) return "recently"

  return formatInUserTimeZone(value, timeZone, {
    month: "short",
    year: "numeric",
  })
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join("") || "I"
  )
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [
    gmailState,
    settings,
    authUser,
    cashAccounts,
    cardLikeInstruments,
    latestForecast,
    memoryFacts,
  ] = await Promise.all([
    getGmailIntegrationState(session.user.id),
    getUserSettings(session.user.id),
    getAuthUserProfile(session.user.id),
    listCashPaymentInstrumentsForUser(session.user.id),
    listDebitAndUpiPaymentInstrumentsForUser(session.user.id),
    getLatestForecastRunWithSnapshots(session.user.id),
    listMemoryFactsForUser({
      userId: session.user.id,
      includeExpired: false,
      limit: 200,
    }),
  ])

  const statusMessage =
    getStatusMessage(asSingleValue(params.gmail)) ??
    getStatusMessage(asSingleValue(params.fx)) ??
    getStatusMessage(asSingleValue(params.balances)) ??
    (() => {
      const timeZoneStatus = asSingleValue(params.tz)

      if (timeZoneStatus === "updated")
        return getStatusMessage("updated-time-zone")
      if (timeZoneStatus === "invalid-time-zone")
        return getStatusMessage("invalid-time-zone")
      if (timeZoneStatus === "save-failed")
        return getStatusMessage("time-zone-save-failed")
      return null
    })() ??
    getStatusMessage(asSingleValue(params.memory))
  const backfillState = gmailState.cursor?.backfillCompletedAt
    ? "ready"
    : gmailState.cursor?.backfillStartedAt
      ? "in progress"
      : "not started"
  const displayName = session.user.name
  const displayImage = session.user.image
  const memberSince = formatMemberSince(
    authUser?.createdAt ?? null,
    settings.timeZone
  )
  const lastSyncValue = gmailState.connection?.lastSuccessfulSyncAt
    ? formatInUserTimeZone(
        gmailState.connection.lastSuccessfulSyncAt,
        settings.timeZone,
        {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }
      )
    : "not yet"
  const gmailConnected = Boolean(
    gmailState.connection && gmailState.connection.status !== "revoked"
  )
  const inboxLabel = gmailConnected
    ? (gmailState.connection?.providerAccountEmail ?? "connected")
    : gmailState.connection
      ? "reconnect required"
      : "not linked"
  const linkedInstrumentCount = cardLikeInstruments.filter((instrument) =>
    Boolean(instrument.backingPaymentInstrumentId)
  ).length
  const capturedDate = new Date()
  const capturedAt = capturedDate.toISOString()
  const staleAt = new Date(
    capturedDate.getTime() + 12 * 60 * 60 * 1000
  ).toISOString()
  const pwaSnapshot = {
    routeKey: "settings" as const,
    capturedAt,
    staleAt,
    userId: session.user.id,
    version: PWA_SNAPSHOT_VERSION,
    payload: {
      user: {
        userId: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: displayImage ?? null,
      },
      memberSinceLabel: memberSince,
      inboxLabel,
      reportingCurrency: settings.reportingCurrency,
      timeZone: settings.timeZone,
      lastSyncLabel: lastSyncValue,
      backfillState,
      cashAccountsCount: cashAccounts.length,
      linkedInstrumentSummary: `${linkedInstrumentCount}/${cardLikeInstruments.length}`,
      memoryFactsCount: memoryFacts.length,
      gmailConnected,
    },
  } satisfies PwaRouteSnapshot<"settings">

  return (
    <section className="mx-auto max-w-lg">
      <PwaSnapshotHydrator snapshot={pwaSnapshot} />
      {/* Profile */}
      <div className="flex items-center gap-4 py-8">
        <Avatar className="size-14 rounded-full">
          {displayImage ? (
            <AvatarImage src={displayImage} alt={displayName} />
          ) : (
            <AvatarFallback className="text-base">
              {getInitials(displayName)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold tracking-tight text-white">
            {displayName}
          </p>
          <p className="mt-0.5 text-sm text-white/36">
            member since {memberSince}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/44">{session.user.email}</p>

      {/* Status toast */}
      {statusMessage && (
        <div className="mt-5 border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">
            {statusMessage}
          </p>
        </div>
      )}

      <PwaStatusCard />

      {/* Quick stats */}
      <div className="mt-10 divide-y divide-white/[0.06]">
        <InfoRow label="inbox" value={inboxLabel} />
        <InfoRow
          label="reporting currency"
          value={settings.reportingCurrency}
        />
        <InfoRow label="time zone" value={settings.timeZone} />
        <InfoRow label="last sync" value={lastSyncValue} />
        <InfoRow label="backfill" value={backfillState} />
      </div>

      {/* Inbox */}
      <SectionHeader>Inbox</SectionHeader>
      <InboxSettingsRows
        userId={session.user.id}
        connected={gmailConnected}
      />

      {/* Preferences */}
      <SectionHeader>Preferences</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <ReportingCurrencyRow currentCurrency={settings.reportingCurrency} />
        <TimeZoneRow currentTimeZone={settings.timeZone} />
      </div>

      <SectionHeader>Accounts & balances</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <NavRow
          href="/settings/accounts/baseline"
          label="forecast baseline"
          value={
            latestForecast
              ? latestForecast.run.runType.replace("_", " ")
              : "set up"
          }
        />
        <NavRow
          href="/settings/accounts/cash"
          label="cash accounts"
          value={`${cashAccounts.length}`}
        />
        <NavRow
          href="/settings/accounts/links"
          label="linked instruments"
          value={`${linkedInstrumentCount}/${cardLikeInstruments.length}`}
        />
      </div>

      <SectionHeader>Memory & learning</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <NavRow
          href="/settings/memory"
          label="memory & learning"
          value={`${memoryFacts.length}`}
        />
      </div>

      <SectionHeader>Recovery</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <NavRow
          href="/settings/recovery"
          label="recovery"
          description="retry failed processing, rebuild stale advice or forecast, and resync recent mail"
        />
      </div>

      {/* Data management */}
      <SectionHeader>Data management</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <NavRow
          href="/settings/data"
          label="reset & rebuild"
          description="wipe ingested data or reset database state"
        />
      </div>

      {/* Sign out */}
      <div className="mt-12 border-t border-white/[0.06] pt-2">
        <SignOutRow />
      </div>
    </section>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 mb-1 text-[0.68rem] font-semibold tracking-[0.22em] text-white/28 uppercase">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-4">
      <span className="text-[15px] text-white/56">{label}</span>
      <span className="text-[15px] text-white/36">{value}</span>
    </div>
  )
}

function NavRow({
  href,
  label,
  description,
  value,
}: {
  href: string
  label: string
  description?: string
  value?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between py-4 transition hover:bg-white/[0.02]"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[15px] text-white">{label}</span>
        {description && (
          <p className="mt-0.5 text-sm text-white/28">{description}</p>
        )}
      </div>
      <div className="ml-4 flex items-center gap-2">
        {value ? (
          <span className="text-[15px] text-white/36">{value}</span>
        ) : null}
        <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
      </div>
    </Link>
  )
}
