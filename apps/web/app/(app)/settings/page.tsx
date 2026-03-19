import Link from "next/link"
import { RiArrowRightSLine } from "@remixicon/react"
import { getAuthUserProfile, getUserSettings } from "@workspace/db"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { InboxSettingsRows } from "@/components/inbox-settings-rows"
import { ReportingCurrencyRow } from "@/components/reporting-currency-row"
import { SignOutRow } from "@/components/sign-out-row"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "connected":
      return "Gmail connected. Irene has started syncing and backfilling your inbox."
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
    default:
      return null
  }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "not yet"

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(value)
}

function formatMemberSince(value: Date | null | undefined) {
  if (!value) return "recently"

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
  }).format(value)
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
  const [gmailState, settings, authUser] = await Promise.all([
    getGmailIntegrationState(session.user.id),
    getUserSettings(session.user.id),
    getAuthUserProfile(session.user.id),
  ])

  const statusMessage =
    getStatusMessage(asSingleValue(params.gmail)) ??
    getStatusMessage(asSingleValue(params.fx))
  const backfillState = gmailState.cursor?.backfillCompletedAt
    ? "ready"
    : gmailState.cursor?.backfillStartedAt
      ? "in progress"
      : "not started"
  const displayName = session.user.name
  const displayImage = session.user.image
  const memberSince = formatMemberSince(authUser?.createdAt ?? null)

  return (
    <section className="mx-auto max-w-lg">
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

      {/* Quick stats */}
      <div className="mt-10 divide-y divide-white/[0.06]">
        <InfoRow
          label="inbox"
          value={
            gmailState.connection
              ? gmailState.connection.providerAccountEmail ?? "connected"
              : "not linked"
          }
        />
        <InfoRow
          label="reporting currency"
          value={settings.reportingCurrency}
        />
        <InfoRow
          label="last sync"
          value={formatDateTime(
            gmailState.connection?.lastSuccessfulSyncAt,
          )}
        />
        <InfoRow label="backfill" value={backfillState} />
      </div>

      {/* Inbox */}
      <SectionHeader>Inbox</SectionHeader>
      <InboxSettingsRows connected={Boolean(gmailState.connection)} />

      {/* Preferences */}
      <SectionHeader>Preferences</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <ReportingCurrencyRow
          currentCurrency={settings.reportingCurrency}
        />
      </div>

      {/* Diagnostics */}
      <SectionHeader>Diagnostics</SectionHeader>
      <div className="divide-y divide-white/[0.06]">
        <NavRow href="/settings/logs" label="unified debug log" />
        <NavRow href="/ops/extraction" label="extraction ops" />
        <NavRow href="/ops/queues" label="queue ops" />
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
    <p className="mb-1 mt-10 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28">
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
}: {
  href: string
  label: string
  description?: string
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
      <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
    </Link>
  )
}
