import { NextResponse } from "next/server"

import {
  getCategoryById,
  getEmiPlanByRecurringObligationId,
  getIncomeStreamById,
  getMerchantById,
  getPaymentInstrumentById,
  getRecurringObligationById,
  type IncomeStreamType,
  type RecurringCadence,
  type RecurringObligationType,
  updateIncomeStream,
  updateRecurringObligation,
  upsertEmiPlan,
} from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/activity", request.url)
  url.searchParams.set("status", status)
  return NextResponse.redirect(url, 303)
}

function parseAmountMinor(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function parseInteger(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseDateTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function isCadence(value: string): value is RecurringCadence {
  return ["weekly", "monthly", "quarterly", "yearly", "irregular"].includes(value)
}

function isRecurringType(value: string): value is RecurringObligationType {
  return ["subscription", "bill", "emi"].includes(value)
}

function isIncomeType(value: string): value is IncomeStreamType {
  return ["salary", "freelance", "reimbursement", "transfer_in", "other"].includes(value)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const modelType = String(formData.get("modelType") ?? "").trim()
  const targetId = String(formData.get("targetId") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/activity").trim()

  if (modelType === "recurring_obligation") {
    const previous = await getRecurringObligationById(targetId)
    if (!previous || previous.userId !== session.user.id) {
      return redirectToTarget(request, redirectTo, "recurring-invalid")
    }

    const name = String(formData.get("name") ?? "").trim()
    const status = String(formData.get("status") ?? "").trim()
    const obligationTypeValue = String(formData.get("obligationType") ?? "").trim()
    const cadenceValue = String(formData.get("cadence") ?? "").trim()
    const amountMinor = parseAmountMinor(formData.get("amount"))
    const dayOfMonth = parseInteger(formData.get("dayOfMonth"))
    const intervalCount = parseInteger(formData.get("intervalCount"))
    const nextDueAt = parseDateTime(formData.get("nextDueAt"))
    const categoryId = String(formData.get("categoryId") ?? "").trim()
    const merchantId = String(formData.get("merchantId") ?? "").trim()
    const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()

    if (amountMinor === null || dayOfMonth === null || intervalCount === null || nextDueAt === null) {
      return redirectToTarget(request, redirectTo, "recurring-invalid")
    }

    const update: Parameters<typeof updateRecurringObligation>[1] = {}
    if (name) update.name = name
    if (status === "suspected" || status === "active" || status === "paused" || status === "closed") {
      update.status = status
    }
    if (obligationTypeValue && isRecurringType(obligationTypeValue)) {
      update.obligationType = obligationTypeValue
    }
    if (cadenceValue && isCadence(cadenceValue)) {
      update.cadence = cadenceValue
    }
    if (typeof amountMinor === "number") update.amountMinor = amountMinor
    if (typeof dayOfMonth === "number") update.dayOfMonth = dayOfMonth
    if (typeof intervalCount === "number") update.intervalCount = intervalCount
    if (nextDueAt instanceof Date) update.nextDueAt = nextDueAt

    if (categoryId) {
      const category = await getCategoryById(session.user.id, categoryId)
      if (!category) return redirectToTarget(request, redirectTo, "recurring-invalid")
      update.categoryId = category.id
    } else if (formData.has("categoryId")) {
      update.categoryId = null
    }

    if (merchantId) {
      const merchant = await getMerchantById(merchantId)
      if (!merchant || merchant.userId !== session.user.id) {
        return redirectToTarget(request, redirectTo, "recurring-invalid")
      }
      update.merchantId = merchant.id
    } else if (formData.has("merchantId")) {
      update.merchantId = null
    }

    if (paymentInstrumentId) {
      const instrument = await getPaymentInstrumentById(paymentInstrumentId)
      if (!instrument || instrument.instrument.userId !== session.user.id) {
        return redirectToTarget(request, redirectTo, "recurring-invalid")
      }
      update.paymentInstrumentId = instrument.instrument.id
    } else if (formData.has("paymentInstrumentId")) {
      update.paymentInstrumentId = null
    }

    const recurring = await updateRecurringObligation(previous.id, update)
    if (!recurring) {
      return redirectToTarget(request, redirectTo, "recurring-invalid")
    }

    const previousEmi = await getEmiPlanByRecurringObligationId(previous.id)
    const emiStatus = String(formData.get("emiStatus") ?? "").trim()
    const installmentAmountMinor = parseAmountMinor(formData.get("installmentAmount"))
    const tenureMonths = parseInteger(formData.get("tenureMonths"))

    if (
      previousEmi &&
      (emiStatus ||
        typeof installmentAmountMinor === "number" ||
        typeof tenureMonths === "number" ||
        nextDueAt instanceof Date)
    ) {
      await upsertEmiPlan({
        recurringObligationId: previous.id,
        values: {
          ...previousEmi,
          status:
            emiStatus === "suspected" ||
            emiStatus === "active" ||
            emiStatus === "completed" ||
            emiStatus === "cancelled"
              ? emiStatus
              : previousEmi.status,
          installmentAmountMinor:
            typeof installmentAmountMinor === "number"
              ? installmentAmountMinor
              : previousEmi.installmentAmountMinor,
          tenureMonths:
            typeof tenureMonths === "number" ? tenureMonths : previousEmi.tenureMonths,
          nextDueAt: nextDueAt instanceof Date ? nextDueAt : previousEmi.nextDueAt,
          updatedAt: new Date(),
        },
      })
    }

    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "recurring_obligation",
      targetId: recurring.id,
      correctionType: "update_recurring_obligation",
      sourceSurface: "activity_recurring",
      previousValue: {
        name: previous.name,
        status: previous.status,
        obligationType: previous.obligationType,
        amountMinor: previous.amountMinor,
        cadence: previous.cadence,
        nextDueAt: previous.nextDueAt?.toISOString() ?? null,
      },
      newValue: {
        name: recurring.name,
        status: recurring.status,
        obligationType: recurring.obligationType,
        amountMinor: recurring.amountMinor,
        cadence: recurring.cadence,
        nextDueAt: recurring.nextDueAt?.toISOString() ?? null,
      },
    })

    await triggerUserForecastRefresh({
      userId: session.user.id,
      reason: "manual_refresh",
    })

    return redirectToTarget(request, redirectTo, "recurring-updated")
  }

  if (modelType === "income_stream") {
    const previous = await getIncomeStreamById(targetId)
    if (!previous || previous.userId !== session.user.id) {
      return redirectToTarget(request, redirectTo, "income-invalid")
    }

    const name = String(formData.get("name") ?? "").trim()
    const status = String(formData.get("status") ?? "").trim()
    const incomeTypeValue = String(formData.get("incomeType") ?? "").trim()
    const cadenceValue = String(formData.get("cadence") ?? "").trim()
    const expectedAmountMinor = parseAmountMinor(formData.get("expectedAmount"))
    const expectedDayOfMonth = parseInteger(formData.get("expectedDayOfMonth"))
    const secondaryDayOfMonth = parseInteger(formData.get("secondaryDayOfMonth"))
    const intervalCount = parseInteger(formData.get("intervalCount"))
    const nextExpectedAt = parseDateTime(formData.get("nextExpectedAt"))
    const merchantId = String(formData.get("merchantId") ?? "").trim()
    const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()

    if (
      expectedAmountMinor === null ||
      expectedDayOfMonth === null ||
      secondaryDayOfMonth === null ||
      intervalCount === null ||
      nextExpectedAt === null
    ) {
      return redirectToTarget(request, redirectTo, "income-invalid")
    }

    const update: Parameters<typeof updateIncomeStream>[1] = {}
    if (name) update.name = name
    if (status === "suspected" || status === "active" || status === "inactive") {
      update.status = status
    }
    if (incomeTypeValue && isIncomeType(incomeTypeValue)) {
      update.incomeType = incomeTypeValue
    }
    if (cadenceValue && isCadence(cadenceValue)) {
      update.cadence = cadenceValue
    }
    if (typeof expectedAmountMinor === "number") update.expectedAmountMinor = expectedAmountMinor
    if (typeof expectedDayOfMonth === "number") update.expectedDayOfMonth = expectedDayOfMonth
    if (typeof secondaryDayOfMonth === "number") update.secondaryDayOfMonth = secondaryDayOfMonth
    if (typeof intervalCount === "number") update.intervalCount = intervalCount
    if (nextExpectedAt instanceof Date) update.nextExpectedAt = nextExpectedAt

    if (merchantId) {
      const merchant = await getMerchantById(merchantId)
      if (!merchant || merchant.userId !== session.user.id) {
        return redirectToTarget(request, redirectTo, "income-invalid")
      }
      update.sourceMerchantId = merchant.id
    } else if (formData.has("merchantId")) {
      update.sourceMerchantId = null
    }

    if (paymentInstrumentId) {
      const instrument = await getPaymentInstrumentById(paymentInstrumentId)
      if (!instrument || instrument.instrument.userId !== session.user.id) {
        return redirectToTarget(request, redirectTo, "income-invalid")
      }
      update.paymentInstrumentId = instrument.instrument.id
    } else if (formData.has("paymentInstrumentId")) {
      update.paymentInstrumentId = null
    }

    const incomeStream = await updateIncomeStream(previous.id, update)
    if (!incomeStream) {
      return redirectToTarget(request, redirectTo, "income-invalid")
    }

    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "income_stream",
      targetId: incomeStream.id,
      correctionType: "update_income_stream",
      sourceSurface: "activity_recurring",
      previousValue: {
        name: previous.name,
        status: previous.status,
        incomeType: previous.incomeType,
        expectedAmountMinor: previous.expectedAmountMinor,
        cadence: previous.cadence,
        nextExpectedAt: previous.nextExpectedAt?.toISOString() ?? null,
      },
      newValue: {
        name: incomeStream.name,
        status: incomeStream.status,
        incomeType: incomeStream.incomeType,
        expectedAmountMinor: incomeStream.expectedAmountMinor,
        cadence: incomeStream.cadence,
        nextExpectedAt: incomeStream.nextExpectedAt?.toISOString() ?? null,
      },
    })

    await triggerUserForecastRefresh({
      userId: session.user.id,
      reason: "manual_refresh",
    })

    return redirectToTarget(request, redirectTo, "income-updated")
  }

  return redirectToTarget(request, redirectTo, "recurring-invalid")
}
