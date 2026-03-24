import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { RiArrowLeftLine } from "@remixicon/react"
import {
  getEmiPlanByRecurringObligationId,
  getIncomeStreamById,
  getRecurringObligationById,
  listActivityMerchantsForUser,
  listActivityPaymentInstrumentsForUser,
  listCategoriesForUser,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Recurring model",
  description: "Recurring model detail in Irene.",
})

type RecurringDetailPageProps = {
  params: Promise<{
    modelType: string
    modelId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatMajorValue(amountMinor: number | null | undefined) {
  if (typeof amountMinor !== "number") return ""
  return (amountMinor / 100).toFixed(2)
}

function toLocalDateTimeValue(value: Date | null | undefined) {
  if (!value) return ""

  const offset = value.getTimezoneOffset()
  const local = new Date(value.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "recurring-updated":
      return "Recurring model updated."
    case "income-updated":
      return "Income stream updated."
    case "recurring-invalid":
      return "The recurring model update could not be saved."
    case "income-invalid":
      return "The income stream update could not be saved."
    default:
      return null
  }
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  emptyLabel,
}: {
  label: string
  name: string
  defaultValue: string
  options: Array<{ id: string; label: string }>
  emptyLabel?: string
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-white">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-12 w-full border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] outline-none"
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default async function RecurringDetailPage({
  params,
  searchParams,
}: RecurringDetailPageProps) {
  const session = await requireSession()
  const { modelId, modelType } = await params
  const routeSearchParams = (await searchParams) ?? {}
  const statusMessage = getStatusMessage(asSingleValue(routeSearchParams.status))

  const [categories, merchants, paymentInstruments] = await Promise.all([
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

  if (modelType === "obligation") {
    const obligation = await getRecurringObligationById(modelId)
    if (!obligation || obligation.userId !== session.user.id) {
      notFound()
    }

    const emiPlan =
      obligation.obligationType === "emi"
        ? await getEmiPlanByRecurringObligationId(obligation.id)
        : null
    const backHref =
      obligation.obligationType === "subscription"
        ? "/activity?view=subscriptions"
        : obligation.obligationType === "emi"
          ? "/activity?view=emis"
          : "/activity"

    return (
      <section className="mx-auto max-w-lg">
        <Link href={backHref} className="inline-flex py-6 text-white/50 transition hover:text-white">
          <RiArrowLeftLine className="size-5" />
        </Link>

        <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">recurring model</h1>
        <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-white/36">
          correct cadence, status, amount, and linked entities without changing the source evidence
        </p>

        {statusMessage ? (
          <div className="mt-8 border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
            <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
          </div>
        ) : null}

        <form action="/api/activity/recurring" method="post" className="mt-8 grid gap-4">
          <input type="hidden" name="modelType" value="recurring_obligation" />
          <input type="hidden" name="targetId" value={obligation.id} />
          <input type="hidden" name="redirectTo" value={`/activity/recurring/obligation/${obligation.id}`} />

          <label className="grid gap-2 text-sm font-medium text-white">
            <span>name</span>
            <Input name="name" defaultValue={obligation.name} />
          </label>
          <SelectField
            label="status"
            name="status"
            defaultValue={obligation.status}
            options={[
              { id: "suspected", label: "suspected" },
              { id: "active", label: "active" },
              { id: "paused", label: "paused" },
              { id: "closed", label: "closed" },
            ]}
          />
          <SelectField
            label="type"
            name="obligationType"
            defaultValue={obligation.obligationType}
            options={[
              { id: "subscription", label: "subscription" },
              { id: "bill", label: "bill" },
              { id: "emi", label: "emi" },
            ]}
          />
          <SelectField
            label="merchant"
            name="merchantId"
            defaultValue={obligation.merchantId ?? ""}
            emptyLabel="No linked merchant"
            options={merchants.map((merchant) => ({
              id: merchant.id,
              label: merchant.displayName,
            }))}
          />
          <SelectField
            label="category"
            name="categoryId"
            defaultValue={obligation.categoryId ?? ""}
            emptyLabel="No category"
            options={categories.map((category) => ({
              id: category.id,
              label: category.name,
            }))}
          />
          <SelectField
            label="instrument"
            name="paymentInstrumentId"
            defaultValue={obligation.paymentInstrumentId ?? ""}
            emptyLabel="No linked instrument"
            options={paymentInstruments.map((instrument) => ({
              id: instrument.id,
              label: instrument.displayName,
            }))}
          />
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>amount</span>
            <Input name="amount" type="number" step="0.01" min="0" defaultValue={formatMajorValue(obligation.amountMinor)} />
          </label>
          <SelectField
            label="cadence"
            name="cadence"
            defaultValue={obligation.cadence}
            options={[
              { id: "weekly", label: "weekly" },
              { id: "monthly", label: "monthly" },
              { id: "quarterly", label: "quarterly" },
              { id: "yearly", label: "yearly" },
              { id: "irregular", label: "irregular" },
            ]}
          />
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>interval count</span>
            <Input name="intervalCount" type="number" min="1" defaultValue={String(obligation.intervalCount)} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>day of month</span>
            <Input name="dayOfMonth" type="number" min="1" max="31" defaultValue={obligation.dayOfMonth ?? ""} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>next due</span>
            <Input name="nextDueAt" type="datetime-local" defaultValue={toLocalDateTimeValue(obligation.nextDueAt)} />
          </label>

          {emiPlan ? (
            <>
              <SelectField
                label="EMI status"
                name="emiStatus"
                defaultValue={emiPlan.status}
                options={[
                  { id: "suspected", label: "suspected" },
                  { id: "active", label: "active" },
                  { id: "completed", label: "completed" },
                  { id: "cancelled", label: "cancelled" },
                ]}
              />
              <label className="grid gap-2 text-sm font-medium text-white">
                <span>installment amount</span>
                <Input
                  name="installmentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={formatMajorValue(emiPlan.installmentAmountMinor)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-white">
                <span>tenure months</span>
                <Input name="tenureMonths" type="number" min="1" defaultValue={emiPlan.tenureMonths ?? ""} />
              </label>
            </>
          ) : null}

          <Button type="submit">Save recurring model</Button>
        </form>
      </section>
    )
  }

  if (modelType === "income") {
    const incomeStream = await getIncomeStreamById(modelId)
    if (!incomeStream || incomeStream.userId !== session.user.id) {
      notFound()
    }

    return (
      <section className="mx-auto max-w-lg">
        <Link href="/activity?view=income" className="inline-flex py-6 text-white/50 transition hover:text-white">
          <RiArrowLeftLine className="size-5" />
        </Link>

        <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">income stream</h1>
        <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-white/36">
          confirm or adjust expected cadence, amount, source, and destination instrument
        </p>

        {statusMessage ? (
          <div className="mt-8 border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
            <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
          </div>
        ) : null}

        <form action="/api/activity/recurring" method="post" className="mt-8 grid gap-4">
          <input type="hidden" name="modelType" value="income_stream" />
          <input type="hidden" name="targetId" value={incomeStream.id} />
          <input type="hidden" name="redirectTo" value={`/activity/recurring/income/${incomeStream.id}`} />

          <label className="grid gap-2 text-sm font-medium text-white">
            <span>name</span>
            <Input name="name" defaultValue={incomeStream.name} />
          </label>
          <SelectField
            label="status"
            name="status"
            defaultValue={incomeStream.status}
            options={[
              { id: "suspected", label: "suspected" },
              { id: "active", label: "active" },
              { id: "inactive", label: "inactive" },
            ]}
          />
          <SelectField
            label="income type"
            name="incomeType"
            defaultValue={incomeStream.incomeType}
            options={[
              { id: "salary", label: "salary" },
              { id: "freelance", label: "freelance" },
              { id: "reimbursement", label: "reimbursement" },
              { id: "transfer_in", label: "transfer in" },
              { id: "other", label: "other" },
            ]}
          />
          <SelectField
            label="source merchant"
            name="merchantId"
            defaultValue={incomeStream.sourceMerchantId ?? ""}
            emptyLabel="No linked source"
            options={merchants.map((merchant) => ({
              id: merchant.id,
              label: merchant.displayName,
            }))}
          />
          <SelectField
            label="destination instrument"
            name="paymentInstrumentId"
            defaultValue={incomeStream.paymentInstrumentId ?? ""}
            emptyLabel="No linked instrument"
            options={paymentInstruments.map((instrument) => ({
              id: instrument.id,
              label: instrument.displayName,
            }))}
          />
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>expected amount</span>
            <Input
              name="expectedAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={formatMajorValue(incomeStream.expectedAmountMinor)}
            />
          </label>
          <SelectField
            label="cadence"
            name="cadence"
            defaultValue={incomeStream.cadence}
            options={[
              { id: "weekly", label: "weekly" },
              { id: "monthly", label: "monthly" },
              { id: "quarterly", label: "quarterly" },
              { id: "yearly", label: "yearly" },
              { id: "irregular", label: "irregular" },
            ]}
          />
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>interval count</span>
            <Input name="intervalCount" type="number" min="1" defaultValue={String(incomeStream.intervalCount)} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>expected day of month</span>
            <Input name="expectedDayOfMonth" type="number" min="1" max="31" defaultValue={incomeStream.expectedDayOfMonth ?? ""} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>secondary day of month</span>
            <Input name="secondaryDayOfMonth" type="number" min="1" max="31" defaultValue={incomeStream.secondaryDayOfMonth ?? ""} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>next expected</span>
            <Input name="nextExpectedAt" type="datetime-local" defaultValue={toLocalDateTimeValue(incomeStream.nextExpectedAt)} />
          </label>

          <Button type="submit">Save income stream</Button>
        </form>
      </section>
    )
  }

  notFound()
}
