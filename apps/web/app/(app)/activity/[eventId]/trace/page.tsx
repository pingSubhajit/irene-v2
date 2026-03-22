import Link from "next/link"
import { notFound } from "next/navigation"
import {
  RiArrowLeftLine,
  RiArrowRightSLine,
} from "@remixicon/react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Badge } from "@workspace/ui/components/badge"
import { downloadPrivateObject } from "@workspace/integrations"
import {
  getFinancialEventTraceForUser,
  listActivityMerchantsForUser,
  listActivityPaymentInstrumentsForUser,
  listCategoriesForUser,
  getUserSettings,
} from "@workspace/db"

import { ActivityEventActions } from "@/components/activity-event-actions"
import { ModelRunList } from "@/components/model-run-list"
import { MerchantLogoPicker } from "@/components/merchant-logo-picker"
import { formatInUserTimeZone } from "@/lib/date-format"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type EventTracePageProps = {
  params: Promise<{
    eventId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function formatCurrency(amountMinor: number, currency: string) {
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

function formatDateTime(
  value: Date | null | undefined,
  timeZone: string,
) {
  if (!value) return "not available"

  return formatInUserTimeZone(value, timeZone, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatShortDate(
  value: Date | null | undefined,
  timeZone: string,
) {
  if (!value) return ""

  return formatInUserTimeZone(value, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default async function EventTracePage({
  params,
  searchParams,
}: EventTracePageProps) {
  const session = await requireSession()
  const { eventId } = await params
  const routeSearchParams = (await searchParams) ?? {}
  const statusParam = Array.isArray(routeSearchParams.status)
    ? routeSearchParams.status[0]
    : routeSearchParams.status
  const [settings, trace, categories, merchants, paymentInstruments] = await Promise.all([
    getUserSettings(session.user.id),
    getFinancialEventTraceForUser({
      userId: session.user.id,
      eventId,
    }),
    listCategoriesForUser(session.user.id),
    listActivityMerchantsForUser({
      userId: session.user.id,
      limit: 300,
    }),
    listActivityPaymentInstrumentsForUser({
      userId: session.user.id,
      limit: 300,
    }),
  ])

  if (!trace) {
    notFound()
  }

  const htmlEntries = await Promise.all(
    trace.traces.map(async (entry) => {
      const storageKey = entry.rawDocument?.bodyHtmlStorageKey

      if (!storageKey) {
        return [entry.source.id, null] as const
      }

      try {
        const buffer = await downloadPrivateObject(storageKey)
        return [entry.source.id, buffer.toString("utf8")] as const
      } catch {
        return [entry.source.id, null] as const
      }
    }),
  )

  const htmlByTraceId = new Map(htmlEntries)
  const merchantName =
    trace.merchant?.displayName ??
    trace.event.description ??
    trace.event.merchantDescriptorRaw ??
    "Unmapped event"
  const processorLine = trace.paymentProcessor?.displayName
    ? `via ${trace.paymentProcessor.displayName}`
    : null
  const issuerLine = trace.paymentInstrument?.displayName ?? null
  const secondaryLine = [processorLine, issuerLine].filter(Boolean).join(" · ")
  const statusMessage = getStatusMessage(statusParam)

  return (
    <section className="mx-auto max-w-2xl">
      {/* Back */}
      <Link
        href="/activity"
        className="inline-flex py-6 text-white/50 transition hover:text-white"
      >
        <RiArrowLeftLine className="size-5" />
      </Link>

      {/* Event header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {trace.merchant?.id ? (
            <MerchantLogoPicker
              merchantId={trace.merchant.id}
              merchantName={merchantName}
              currentLogoUrl={trace.merchant.logoUrl ?? null}
            />
          ) : null}
          <h1 className="min-w-0 text-[1.65rem] font-semibold tracking-tight text-white">
            {merchantName}
          </h1>
        </div>
        <ActivityEventActions
          redirectTo={`/activity/${trace.event.id}/trace`}
          event={{
            id: trace.event.id,
            status: trace.event.status,
            amountMinor: trace.event.amountMinor,
            eventType: trace.event.eventType,
            merchantId: trace.event.merchantId,
            categoryId: trace.event.categoryId,
            paymentInstrumentId: trace.event.paymentInstrumentId,
            description: trace.event.description,
            notes: trace.event.notes,
          }}
          merchant={
            trace.merchant
              ? {
                  id: trace.merchant.id,
                  displayName: trace.merchant.displayName,
                  defaultCategory: trace.merchant.defaultCategory,
                }
              : null
          }
          paymentInstrument={
            trace.paymentInstrument
              ? {
                  id: trace.paymentInstrument.id,
                  displayName: trace.paymentInstrument.displayName,
                  instrumentType: trace.paymentInstrument.instrumentType,
                  status: trace.paymentInstrument.status,
                  creditLimitMinor: trace.paymentInstrument.creditLimitMinor,
                }
              : null
          }
          merchants={merchants.map((merchant) => ({
            id: merchant.id,
            displayName: merchant.displayName,
          }))}
          categories={categories.map((category) => ({
            id: category.id,
            displayName: category.name,
          }))}
          paymentInstruments={paymentInstruments.map((instrument) => ({
            id: instrument.id,
            displayName: instrument.displayName,
            subtitle: instrument.maskedIdentifier
              ? `${instrument.instrumentType.replace("_", " ")} • ${instrument.maskedIdentifier}`
              : instrument.instrumentType.replace("_", " "),
          }))}
        />
      </div>
      {secondaryLine ? (
        <p className="mt-1 text-sm text-white/48">{secondaryLine}</p>
      ) : null}
      <p className="mt-1 text-sm text-white/36">
        {formatCurrency(trace.event.amountMinor, trace.event.currency)} ·{" "}
        {formatShortDate(trace.event.eventOccurredAt, settings.timeZone)} ·{" "}
        {trace.event.eventType}
      </p>
      {statusMessage ? (
        <div className="mt-5 border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      {/* Event summary */}
      <div className="mt-8 divide-y divide-white/[0.06]">
        <InfoRow label="amount" value={formatCurrency(trace.event.amountMinor, trace.event.currency)} />
        <InfoRow label="direction" value={trace.event.direction} />
        <InfoRow label="date" value={formatDateTime(trace.event.eventOccurredAt, settings.timeZone)} />
        <InfoRow label="type" value={trace.event.eventType} />
        <InfoRow label="status" value={trace.event.status} />
        <InfoRow label="processor" value={trace.paymentProcessor?.displayName ?? "unlinked"} />
        <InfoRow label="instrument" value={trace.paymentInstrument?.displayName ?? "unlinked"} />
        <InfoRow
          label="descriptor"
          value={trace.event.merchantDescriptorRaw ?? "unavailable"}
        />
        <InfoRow
          label="trace paths"
          value={`${trace.traces.length} ${trace.traces.length === 1 ? "path" : "paths"}`}
        />
      </div>

      {trace.eventModelRuns.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Event model runs</SectionLabel>
          <ModelRunList modelRuns={trace.eventModelRuns} />
        </div>
      )}

      {/* Trace paths */}
      {trace.traces.length > 0 ? (
        <div className="mt-10">
          <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28">
            Provenance
          </p>

          <Accordion
            type="single"
            collapsible
            className="gap-0 divide-y divide-white/[0.06]"
          >
            {trace.traces.map((entry, index) => {
              const emailHtml =
                htmlByTraceId.get(entry.source.id) ?? null

              return (
                <AccordionItem
                  key={entry.source.id}
                  value={entry.source.id}
                  className="border-0 bg-transparent"
                >
                  <AccordionTrigger className="px-0 [&>span:last-child]:border-0 [&>span:last-child]:bg-transparent">
                    <div className="grid gap-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/28">
                          path {index + 1}
                        </span>
                        {entry.extractedSignal?.signalType && (
                          <Badge variant="violet" className="text-[0.6rem]">
                            {entry.extractedSignal.signalType}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[15px] font-medium text-white">
                        {entry.rawDocument?.subject ??
                          "No subject on source email"}
                      </p>
                      <p className="text-sm text-white/32">
                        {entry.rawDocument?.fromAddress ??
                          "Unknown sender"}{" "}
                        ·{" "}
                        {formatDateTime(
                          entry.rawDocument?.messageTimestamp,
                          settings.timeZone,
                        )}
                      </p>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="grid gap-8 border-t-0 px-0 pb-6">
                    {/* Source email */}
                    <div>
                      <SectionLabel>Source email</SectionLabel>
                      <div className="divide-y divide-white/[0.06]">
                        <InfoRow
                          label="sender"
                          value={
                            entry.rawDocument?.fromAddress ??
                            "Unknown"
                          }
                        />
                        <InfoRow
                          label="recipient"
                          value={
                            entry.rawDocument?.toAddress ?? "Unknown"
                          }
                        />
                        <InfoRow
                          label="subject"
                          value={
                            entry.rawDocument?.subject ??
                            "(no subject)"
                          }
                        />
                        <InfoRow
                          label="time"
                          value={formatDateTime(
                            entry.rawDocument?.messageTimestamp,
                            settings.timeZone,
                          )}
                        />
                        <InfoRow
                          label="provider id"
                          value={
                            entry.rawDocument?.providerMessageId ??
                            "unavailable"
                          }
                        />
                        <InfoRow
                          label="thread"
                          value={
                            entry.rawDocument?.threadId ??
                            "unavailable"
                          }
                        />
                      </div>
                    </div>

                    {/* Signal */}
                    <div>
                      <SectionLabel>Signal</SectionLabel>
                      <div className="divide-y divide-white/[0.06]">
                        <InfoRow
                          label="candidate"
                          value={
                            entry.extractedSignal
                              ?.candidateEventType ??
                            "no candidate"
                          }
                        />
                        <InfoRow
                          label="confidence"
                          value={
                            entry.extractedSignal
                              ? `${Math.round(Number(entry.extractedSignal.confidence) * 100)}%`
                              : "unavailable"
                          }
                        />
                        <InfoRow
                          label="event date"
                          value={
                            entry.extractedSignal?.eventDate ??
                            "unavailable"
                          }
                        />
                        <InfoRow
                          label="merchant hint"
                          value={
                            entry.extractedSignal?.merchantNameCandidate ??
                            entry.extractedSignal?.merchantHint ??
                            entry.extractedSignal?.merchantRaw ??
                            "unavailable"
                          }
                        />
                        <InfoRow
                          label="processor hint"
                          value={
                            entry.extractedSignal?.processorNameCandidate ?? "unavailable"
                          }
                        />
                        <InfoRow
                          label="issuer hint"
                          value={entry.extractedSignal?.issuerNameHint ?? "unavailable"}
                        />
                        <InfoRow
                          label="descriptor"
                          value={
                            entry.extractedSignal?.merchantDescriptorRaw ?? "unavailable"
                          }
                        />
                        <InfoRow
                          label="link reason"
                          value={entry.source.linkReason}
                        />
                      </div>
                    </div>

                    {/* Model runs */}
                    {entry.modelRuns.length > 0 && (
                      <div>
                        <SectionLabel>Model runs</SectionLabel>
                        <ModelRunList modelRuns={entry.modelRuns} />
                      </div>
                    )}

                    {/* Email body */}
                    <div>
                      <SectionLabel>Email body</SectionLabel>
                      {emailHtml ? (
                        <iframe
                          title={
                            entry.rawDocument?.subject ??
                            `trace-${index + 1}`
                          }
                          sandbox=""
                          srcDoc={emailHtml}
                          className="mt-2 min-h-[400px] w-full border border-white/8 bg-white"
                        />
                      ) : (
                        <p className="mt-2 text-sm leading-7 whitespace-pre-wrap text-white/44">
                          {entry.rawDocument?.bodyText ??
                            entry.rawDocument?.snippet ??
                            "No stored email body available."}
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      ) : (
        <div className="mt-10 py-12 text-center">
          <p className="text-sm text-white/32">
            no provenance rows attached to this event yet.
          </p>
        </div>
      )}

      {/* Footer link */}
      <div className="mt-8 border-t border-white/[0.06] pt-4 pb-8">
        <Link
          href="/settings/logs"
          className="flex items-center justify-between py-3 text-sm text-white/40 transition hover:text-white/60"
        >
          <span>debug timeline</span>
          <RiArrowRightSLine className="size-4" />
        </Link>
      </div>
    </section>
  )
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "event-updated":
      return "Event updated. Irene will now treat the canonical event using your corrected values."
    case "event-ignored":
      return "Event ignored. It will stay traceable, but it drops out of normal activity views."
    case "event-restored":
      return "Event restored."
    case "merchant-updated":
      return "Merchant updated."
    case "merchant-merged":
      return "Merchant merged into the selected canonical merchant."
    case "instrument-updated":
      return "Instrument updated."
    default:
      return null
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="shrink-0 text-sm text-white/40">{label}</span>
      <span className="text-right text-sm text-white/64">{value}</span>
    </div>
  )
}
