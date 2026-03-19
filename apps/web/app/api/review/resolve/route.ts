import { NextResponse } from "next/server"

import {
  createFinancialEvent,
  createFinancialEventSource,
  ensureJobRun,
  findExistingCanonicalPaymentInstrument,
  getCategoryBySlug,
  getOrCreateFinancialInstitution,
  getOrCreatePaymentProcessor,
  getMerchantById,
  getPaymentInstrumentById,
  getPaymentProcessorById,
  getEmiPlanByRecurringObligationId,
  getDirectionForEventType,
  getFinancialEventById,
  getFinancialEventSourceByExtractedSignal,
  getIncomeStreamById,
  getOrCreateMerchantForAlias,
  getRecurringObligationById,
  getReviewQueueContext,
  refreshFinancialEventSourceCount,
  updateMerchantObservationStatus,
  updatePaymentInstrument,
  createPaymentInstrument,
  updatePaymentInstrumentObservationStatus,
  updateIncomeStream,
  updateExtractedSignalStatus,
  updateFinancialEvent,
  updateRecurringObligation,
  updateReviewQueueItem,
  upsertEmiPlan,
  upsertFinancialInstitutionAliases,
  upsertMerchantAliases,
  upsertPaymentProcessorAliases,
  type FinancialEventType,
  type PaymentInstrumentType,
} from "@workspace/db"
import {
  enqueueEventExtractInstrumentObservation,
  enqueueIncomeStreamDetection,
  enqueueRecurringObligationDetection,
  ENTITY_RESOLUTION_QUEUE_NAME,
  EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME,
  EVENT_DETECT_INCOME_STREAM_JOB_NAME,
  EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME,
  RECURRING_DETECTION_QUEUE_NAME,
} from "@workspace/workflows"

import { triggerFinancialEventValuationRefresh } from "@/lib/fx-valuation"
import { getServerSession } from "@/lib/session"

function redirectToReview(request: Request, status: string) {
  const url = new URL("/review", request.url)
  url.searchParams.set("status", status)
  return NextResponse.redirect(url, 303)
}

function isFinancialEventType(value: string | null): value is FinancialEventType {
  return (
    value === "purchase" ||
    value === "income" ||
    value === "subscription_charge" ||
    value === "emi_payment" ||
    value === "bill_payment" ||
    value === "refund" ||
    value === "transfer"
  )
}

type ProposedResolution = {
  action?: "create" | "merge"
  matchedEventIds?: string[]
  matchedPaymentInstrumentIds?: string[]
  matchedMerchantIds?: string[]
  matchedProcessorIds?: string[]
  kind?:
    | "event"
    | "recurring_obligation"
    | "emi_plan"
    | "income_stream"
    | "payment_instrument_resolution"
    | "merchant_resolution"
    | "category_resolution"
  recurringObligationId?: string
  incomeStreamId?: string
  recurringType?: "subscription" | "bill" | "emi"
  incomeType?: "salary" | "freelance" | "reimbursement" | "transfer_in" | "other"
  canonicalInstitutionName?: string | null
  canonicalInstrumentType?: PaymentInstrumentType
  targetPaymentInstrumentId?: string | null
  canonicalMerchantName?: string | null
  canonicalProcessorName?: string | null
  targetMerchantId?: string | null
  targetProcessorId?: string | null
  maskedIdentifier?: string | null
  supportingObservationIds?: string[]
  categorySlug?: string | null
  categoryConfidence?: number | null
  categoryReason?: string | null
  eventDraft?: {
    userId: string
    eventType: FinancialEventType
    direction: "inflow" | "outflow" | "neutral"
    amountMinor: number
    currency: string
    eventOccurredAt: string
    postedAt?: string | null
    merchantId?: string | null
    paymentInstrumentId?: string | null
    categoryId?: string | null
    description?: string | null
    notes?: string | null
    confidence: number
    needsReview?: boolean
    isRecurringCandidate?: boolean
    isTransfer?: boolean
    status?: "confirmed" | "needs_review" | "ignored" | "reversed"
    sourceCount?: number
  }
}

async function enqueueRecurringDetectionForEvent(input: {
  userId: string
  financialEventId: string
}) {
  const correlationId = crypto.randomUUID()

  const obligationJobKey = `${EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME}:${input.financialEventId}`
  const obligationJobRun = await ensureJobRun({
    queueName: RECURRING_DETECTION_QUEUE_NAME,
    jobName: EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME,
    jobKey: obligationJobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "web",
    },
  })

  await enqueueRecurringObligationDetection({
    correlationId,
    jobRunId: obligationJobRun.id,
    jobKey: obligationJobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "web",
  })

  const incomeJobKey = `${EVENT_DETECT_INCOME_STREAM_JOB_NAME}:${input.financialEventId}`
  const incomeJobRun = await ensureJobRun({
    queueName: RECURRING_DETECTION_QUEUE_NAME,
    jobName: EVENT_DETECT_INCOME_STREAM_JOB_NAME,
    jobKey: incomeJobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "web",
    },
  })

  await enqueueIncomeStreamDetection({
    correlationId,
    jobRunId: incomeJobRun.id,
    jobKey: incomeJobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "web",
  })
}

async function enqueueInstrumentResolutionForEvent(input: {
  userId: string
  financialEventId: string
}) {
  const correlationId = crypto.randomUUID()
  const jobKey = `${EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME}:${input.financialEventId}:${correlationId}`
  const jobRun = await ensureJobRun({
    queueName: ENTITY_RESOLUTION_QUEUE_NAME,
    jobName: EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "web",
    },
  })

  await enqueueEventExtractInstrumentObservation({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "web",
  })
}

function buildInstrumentDisplayName(input: {
  institutionName: string
  maskedIdentifier: string | null
}) {
  return `${input.institutionName}${input.maskedIdentifier ? ` •${input.maskedIdentifier}` : ""}`
}

export async function POST(request: Request) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303)
  }

  const formData = await request.formData()
  const reviewItemId = String(formData.get("reviewItemId") ?? "")
  const resolution = String(formData.get("resolution") ?? "")
  const targetEventId = String(formData.get("targetEventId") ?? "").trim()
  const overrideMerchant = String(formData.get("overrideMerchant") ?? "").trim()
  const overrideCategoryId = String(formData.get("overrideCategoryId") ?? "").trim()
  const overrideProcessor = String(formData.get("overrideProcessor") ?? "").trim()
  const overrideEventTypeValue = String(formData.get("overrideEventType") ?? "").trim()
  const overrideRecurringTypeValue = String(formData.get("overrideRecurringType") ?? "").trim()
  const targetRecurringModelId = String(formData.get("targetRecurringModelId") ?? "").trim()
  const overrideEventType = isFinancialEventType(overrideEventTypeValue)
    ? overrideEventTypeValue
    : null
  const overrideRecurringType =
    overrideRecurringTypeValue === "subscription" ||
    overrideRecurringTypeValue === "bill" ||
    overrideRecurringTypeValue === "emi"
      ? overrideRecurringTypeValue
      : null

  if (!reviewItemId || !resolution) {
    return redirectToReview(request, "invalid-request")
  }

  const context = await getReviewQueueContext(reviewItemId)
  if (!context || context.item.userId !== session.user.id) {
    return redirectToReview(request, "missing-review-item")
  }

  const proposal = (context.item.proposedResolutionJson ?? {}) as ProposedResolution
  const proposalKind = proposal.kind ?? "event"

  const existingSource = context.signal
    ? await getFinancialEventSourceByExtractedSignal(context.signal.id)
    : null

  if (resolution === "ignore" && proposalKind === "event") {
    if (context.signal) {
      await updateExtractedSignalStatus(context.signal.id, "ignored")
    }

    await updateReviewQueueItem(context.item.id, {
      status: "ignored",
      resolvedAt: new Date(),
    })

    return redirectToReview(request, "ignored")
  }

  if (existingSource) {
    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: existingSource.financialEventId,
    })

    return redirectToReview(request, "already-reconciled")
  }
  const eventDraft = proposal.eventDraft

  if (proposalKind === "payment_instrument_resolution") {
    const targetPaymentInstrumentId = String(formData.get("targetPaymentInstrumentId") ?? "").trim()
    const overrideInstitution = String(formData.get("overrideInstitution") ?? "").trim()
    const overrideInstrumentTypeValue = String(formData.get("overrideInstrumentType") ?? "").trim()
    const overrideInstrumentType =
      overrideInstrumentTypeValue === "credit_card" ||
      overrideInstrumentTypeValue === "debit_card" ||
      overrideInstrumentTypeValue === "bank_account" ||
      overrideInstrumentTypeValue === "upi" ||
      overrideInstrumentTypeValue === "wallet" ||
      overrideInstrumentTypeValue === "unknown"
        ? overrideInstrumentTypeValue
        : null

    const canonicalInstitutionName =
      overrideInstitution || proposal.canonicalInstitutionName || null
    const canonicalInstrumentType =
      overrideInstrumentType || proposal.canonicalInstrumentType || "unknown"

    if (!context.item.financialEventId) {
      return redirectToReview(request, "missing-review-item")
    }

    const event = await getFinancialEventById(context.item.financialEventId)
    if (!event || event.userId !== session.user.id) {
      return redirectToReview(request, "invalid-target-event")
    }

    const supportingObservationIds = proposal.supportingObservationIds ?? []
    if (resolution === "ignore") {
      if (supportingObservationIds.length > 0) {
        await updatePaymentInstrumentObservationStatus(supportingObservationIds, "ignored")
      }

      await updateReviewQueueItem(context.item.id, {
        status: "ignored",
        resolvedAt: new Date(),
      })

      return redirectToReview(request, "ignored")
    }

    const institution =
      canonicalInstitutionName
        ? await getOrCreateFinancialInstitution({
            userId: session.user.id,
            displayName: canonicalInstitutionName,
          })
        : null

    if (institution) {
      await upsertFinancialInstitutionAliases({
        financialInstitutionId: institution.id,
        aliases: [
          { aliasText: canonicalInstitutionName!, source: "review_resolution", confidence: 1 },
        ],
      })
    }

    const selectedTargetId =
      resolution === "merge"
        ? targetPaymentInstrumentId || proposal.targetPaymentInstrumentId || ""
        : targetPaymentInstrumentId || proposal.targetPaymentInstrumentId || ""

    let instrument =
      selectedTargetId.length > 0 ? (await getPaymentInstrumentById(selectedTargetId))?.instrument : null

    if (!instrument) {
        instrument = await findExistingCanonicalPaymentInstrument({
        userId: session.user.id,
        financialInstitutionId: institution?.id ?? null,
        instrumentType: canonicalInstrumentType,
        maskedIdentifier: proposal.maskedIdentifier ?? null,
      })
    }

    if (!instrument) {
      instrument = await createPaymentInstrument({
        userId: session.user.id,
        financialInstitutionId: institution?.id ?? null,
        instrumentType: canonicalInstrumentType,
        providerName: institution?.displayName ?? null,
        displayName: buildInstrumentDisplayName({
          institutionName: institution?.displayName ?? "Unknown issuer",
          maskedIdentifier: proposal.maskedIdentifier ?? null,
        }),
        maskedIdentifier: proposal.maskedIdentifier ?? null,
        currency: event.currency,
        status: "active",
      })
    } else {
      instrument =
        (await updatePaymentInstrument(instrument.id, {
          financialInstitutionId: institution?.id ?? instrument.financialInstitutionId,
          instrumentType:
            canonicalInstrumentType === "unknown"
              ? instrument.instrumentType
              : canonicalInstrumentType,
          providerName: institution?.displayName ?? instrument.providerName,
          displayName: buildInstrumentDisplayName({
            institutionName:
              institution?.displayName ?? instrument.providerName ?? "Unknown issuer",
            maskedIdentifier:
              instrument.maskedIdentifier ?? proposal.maskedIdentifier ?? null,
          }),
        })) ?? instrument
    }

    await updateFinancialEvent(event.id, {
      paymentInstrumentId: instrument.id,
    })

    if (supportingObservationIds.length > 0) {
      await updatePaymentInstrumentObservationStatus(
        supportingObservationIds,
        "linked",
        instrument.id,
      )
    }

    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: event.id,
      proposedResolutionJson: {
        ...proposal,
        resolvedAs: resolution === "merge" ? "merge" : "approve",
        canonicalInstitutionName: institution?.displayName ?? canonicalInstitutionName,
        canonicalInstrumentType:
          canonicalInstrumentType === "unknown"
            ? instrument.instrumentType
            : canonicalInstrumentType,
        targetPaymentInstrumentId: instrument.id,
      },
    })

    return redirectToReview(request, resolution === "merge" ? "merged" : "approved")
  }

  if (proposalKind === "merchant_resolution" || proposalKind === "category_resolution") {
    if (!context.item.financialEventId) {
      return redirectToReview(request, "missing-review-item")
    }

    const event = await getFinancialEventById(context.item.financialEventId)
    if (!event || event.userId !== session.user.id) {
      return redirectToReview(request, "invalid-target-event")
    }

    const targetMerchantId = String(formData.get("targetMerchantId") ?? "").trim()
    const targetProcessorId = String(formData.get("targetProcessorId") ?? "").trim()
    const supportingObservationIds = proposal.supportingObservationIds ?? []

    if (resolution === "ignore") {
      if (supportingObservationIds.length > 0) {
        await updateMerchantObservationStatus(supportingObservationIds, "ignored")
      }

      await updateReviewQueueItem(context.item.id, {
        status: "ignored",
        resolvedAt: new Date(),
      })

      return redirectToReview(request, "ignored")
    }

    const merchant =
      (resolution === "merge" && (targetMerchantId || proposal.targetMerchantId)
        ? await getMerchantById(targetMerchantId || proposal.targetMerchantId || "")
        : null) ??
      (overrideMerchant
        ? await getOrCreateMerchantForAlias({
            userId: session.user.id,
            aliasText: overrideMerchant,
            source: "review_resolution",
            confidence: 1,
          })
        : proposal.canonicalMerchantName
          ? await getOrCreateMerchantForAlias({
              userId: session.user.id,
              aliasText: proposal.canonicalMerchantName,
              source: "review_resolution",
              confidence: 1,
            })
          : null)

    if (merchant) {
      const merchantAliasText = overrideMerchant || proposal.canonicalMerchantName || ""
      await upsertMerchantAliases({
        merchantId: merchant.id,
        aliases: merchantAliasText
          ? [
              {
                aliasText: merchantAliasText,
                source: "review_resolution",
                confidence: 1,
              },
            ]
          : [],
      })
    }

    const processor =
      (targetProcessorId || proposal.targetProcessorId
        ? await getPaymentProcessorById(targetProcessorId || proposal.targetProcessorId || "")
        : null) ??
      (overrideProcessor
        ? await getOrCreatePaymentProcessor({
            userId: session.user.id,
            displayName: overrideProcessor,
          })
        : proposal.canonicalProcessorName
          ? await getOrCreatePaymentProcessor({
              userId: session.user.id,
              displayName: proposal.canonicalProcessorName,
            })
          : null)

    if (processor) {
      const processorAliasText = overrideProcessor || proposal.canonicalProcessorName || ""
      await upsertPaymentProcessorAliases({
        paymentProcessorId: processor.id,
        aliases: processorAliasText
          ? [
              {
                aliasText: processorAliasText,
                source: "review_resolution",
                confidence: 1,
              },
            ]
          : [],
      })
    }

    const resolvedCategory =
      overrideCategoryId
        ? { id: overrideCategoryId }
        : proposal.categorySlug
          ? await getCategoryBySlug(session.user.id, proposal.categorySlug)
          : null

    await updateFinancialEvent(event.id, {
      merchantId: merchant?.id ?? event.merchantId,
      paymentProcessorId: processor?.id ?? event.paymentProcessorId,
      categoryId: resolvedCategory?.id ?? event.categoryId,
      description: merchant?.displayName ?? event.description,
    })

    if (supportingObservationIds.length > 0) {
      await updateMerchantObservationStatus(supportingObservationIds, "linked", {
        merchantId: merchant?.id ?? event.merchantId,
        paymentProcessorId: processor?.id ?? event.paymentProcessorId,
      })
    }

    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: event.id,
      proposedResolutionJson: {
        ...proposal,
        resolvedAs: resolution === "merge" ? "merge" : "approve",
        canonicalMerchantName: merchant?.displayName ?? proposal.canonicalMerchantName ?? null,
        canonicalProcessorName:
          processor?.displayName ?? proposal.canonicalProcessorName ?? null,
        targetMerchantId: merchant?.id ?? proposal.targetMerchantId ?? null,
        targetProcessorId: processor?.id ?? proposal.targetProcessorId ?? null,
        categorySlug: proposal.categorySlug ?? null,
      },
    })

    return redirectToReview(request, resolution === "merge" ? "merged" : "approved")
  }

  if (proposalKind !== "event") {
    if (proposalKind === "income_stream") {
      const streamId = proposal.incomeStreamId

      if (!streamId) {
        return redirectToReview(request, "missing-income-stream")
      }

      const incomeStream = await getIncomeStreamById(streamId)

      if (!incomeStream || incomeStream.userId !== session.user.id) {
        return redirectToReview(request, "invalid-income-stream")
      }

      if (resolution === "ignore") {
        await updateIncomeStream(incomeStream.id, {
          status: "inactive",
        })
        await updateReviewQueueItem(context.item.id, {
          status: "ignored",
          resolvedAt: new Date(),
        })

        return redirectToReview(request, "ignored")
      }

      if (resolution === "merge" && targetRecurringModelId) {
        const targetIncomeStream = await getIncomeStreamById(targetRecurringModelId)

        if (!targetIncomeStream || targetIncomeStream.userId !== session.user.id) {
          return redirectToReview(request, "invalid-target-event")
        }

        await updateIncomeStream(targetIncomeStream.id, {
          status: "active",
          confidence: Math.max(
            Number(targetIncomeStream.confidence),
            Number(incomeStream.confidence),
          ),
        })
        await updateIncomeStream(incomeStream.id, {
          status: "inactive",
        })
        await updateReviewQueueItem(context.item.id, {
          status: "resolved",
          resolvedAt: new Date(),
          proposedResolutionJson: {
            ...proposal,
            resolvedAs: "merge",
            targetRecurringModelId,
          },
        })

        return redirectToReview(request, "merged")
      }

      const resolvedMerchant =
        overrideMerchant.length > 0
          ? await getOrCreateMerchantForAlias({
              userId: session.user.id,
              aliasText: overrideMerchant,
              source: "review_resolution",
              confidence: 1,
            })
          : null

      await updateIncomeStream(incomeStream.id, {
        status: "active",
        sourceMerchantId: resolvedMerchant?.id ?? incomeStream.sourceMerchantId,
      })
      await updateReviewQueueItem(context.item.id, {
        status: "resolved",
        resolvedAt: new Date(),
        proposedResolutionJson: {
          ...proposal,
          resolvedAs: "approve",
        },
      })

      return redirectToReview(request, "approved")
    }

    const recurringObligationId = proposal.recurringObligationId

    if (!recurringObligationId) {
      return redirectToReview(request, "missing-recurring-obligation")
    }

    const obligation = await getRecurringObligationById(recurringObligationId)

    if (!obligation || obligation.userId !== session.user.id) {
      return redirectToReview(request, "invalid-recurring-obligation")
    }

    const resolvedMerchant =
      overrideMerchant.length > 0
        ? await getOrCreateMerchantForAlias({
            userId: session.user.id,
            aliasText: overrideMerchant,
            source: "review_resolution",
            confidence: 1,
          })
        : null

    if (resolution === "ignore") {
      await updateRecurringObligation(obligation.id, {
        status: "paused",
      })

      if (proposalKind === "emi_plan") {
        const emiPlan = await getEmiPlanByRecurringObligationId(obligation.id)

        if (emiPlan) {
          await upsertEmiPlan({
            recurringObligationId: obligation.id,
            values: {
              ...emiPlan,
              status: "cancelled",
            },
          })
        }
      }

      await updateReviewQueueItem(context.item.id, {
        status: "ignored",
        resolvedAt: new Date(),
      })

      return redirectToReview(request, "ignored")
    }

    if (resolution === "merge" && targetRecurringModelId) {
      const targetObligation = await getRecurringObligationById(targetRecurringModelId)

      if (!targetObligation || targetObligation.userId !== session.user.id) {
        return redirectToReview(request, "invalid-target-event")
      }

      await updateRecurringObligation(targetObligation.id, {
        status: "active",
        detectionConfidence: Math.max(
          Number(targetObligation.detectionConfidence),
          Number(obligation.detectionConfidence),
        ),
      })
      await updateRecurringObligation(obligation.id, {
        status: "closed",
      })
      await updateReviewQueueItem(context.item.id, {
        status: "resolved",
        resolvedAt: new Date(),
        proposedResolutionJson: {
          ...proposal,
          resolvedAs: "merge",
          targetRecurringModelId,
        },
      })

      return redirectToReview(request, "merged")
    }

    await updateRecurringObligation(obligation.id, {
      status: "active",
      obligationType: overrideRecurringType ?? obligation.obligationType,
      merchantId: resolvedMerchant?.id ?? obligation.merchantId,
      categoryId: overrideCategoryId || obligation.categoryId,
    })

    if (proposalKind === "emi_plan") {
      const emiPlan = await getEmiPlanByRecurringObligationId(obligation.id)

      if (emiPlan) {
        await upsertEmiPlan({
          recurringObligationId: obligation.id,
          values: {
            ...emiPlan,
            status: "active",
            merchantId: resolvedMerchant?.id ?? emiPlan.merchantId,
          },
        })
      }
    }

    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      proposedResolutionJson: {
        ...proposal,
        resolvedAs: "approve",
      },
    })

    return redirectToReview(request, "approved")
  }

  if (!context.signal || !context.rawDocument || !eventDraft) {
    return redirectToReview(request, "missing-proposal")
  }

  const resolvedMerchant =
    overrideMerchant.length > 0
      ? await getOrCreateMerchantForAlias({
          userId: session.user.id,
          aliasText: overrideMerchant,
          source: "review_resolution",
          confidence: 1,
        })
      : null

  const resolvedEventType =
    overrideEventType ?? (isFinancialEventType(eventDraft.eventType) ? eventDraft.eventType : null)

  if (!resolvedEventType) {
    return redirectToReview(request, "invalid-event-type")
  }

  const targetFinancialEventId =
    resolution === "merge"
      ? targetEventId || proposal.matchedEventIds?.[0] || ""
      : targetEventId

  if (resolution === "merge" && !targetFinancialEventId) {
    return redirectToReview(request, "missing-target-event")
  }

  if (resolution === "merge") {
    const existingEvent = await getFinancialEventById(targetFinancialEventId)

    if (!existingEvent || existingEvent.userId !== session.user.id) {
      return redirectToReview(request, "invalid-target-event")
    }

    await updateFinancialEvent(existingEvent.id, {
      eventType: resolvedEventType,
      direction: getDirectionForEventType(resolvedEventType),
      merchantId: resolvedMerchant?.id ?? existingEvent.merchantId,
      categoryId: overrideCategoryId || existingEvent.categoryId,
      needsReview: false,
      status: "confirmed",
      confidence: Math.max(Number(existingEvent.confidence), Number(eventDraft.confidence)),
    })
    await createFinancialEventSource({
      financialEventId: existingEvent.id,
      rawDocumentId: context.rawDocument.id,
      extractedSignalId: context.signal.id,
      linkReason: "review_resolution_merge",
    })
    await refreshFinancialEventSourceCount(existingEvent.id)
    await updateExtractedSignalStatus(context.signal.id, "reconciled")
    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: existingEvent.id,
      proposedResolutionJson: {
        ...proposal,
        resolvedAs: "merge",
      },
    })
    await enqueueRecurringDetectionForEvent({
      userId: session.user.id,
      financialEventId: existingEvent.id,
    })
    await enqueueInstrumentResolutionForEvent({
      userId: session.user.id,
      financialEventId: existingEvent.id,
    })

    return redirectToReview(request, "merged")
  }

  const createdEvent = await createFinancialEvent({
    userId: session.user.id,
    eventType: resolvedEventType,
    direction: getDirectionForEventType(resolvedEventType),
    amountMinor: eventDraft.amountMinor,
    currency: eventDraft.currency,
    eventOccurredAt: new Date(eventDraft.eventOccurredAt),
    postedAt: eventDraft.postedAt ? new Date(eventDraft.postedAt) : context.rawDocument.messageTimestamp,
    merchantId: resolvedMerchant?.id ?? eventDraft.merchantId ?? null,
    paymentInstrumentId: eventDraft.paymentInstrumentId ?? null,
    categoryId: overrideCategoryId || eventDraft.categoryId || null,
    description: eventDraft.description ?? context.rawDocument.subject ?? null,
    notes: eventDraft.notes ?? null,
    confidence: eventDraft.confidence,
    needsReview: false,
    isRecurringCandidate: eventDraft.isRecurringCandidate ?? false,
    isTransfer: resolvedEventType === "transfer",
    sourceCount: 0,
    status: "confirmed",
  })

  await createFinancialEventSource({
    financialEventId: createdEvent.id,
    rawDocumentId: context.rawDocument.id,
    extractedSignalId: context.signal.id,
    linkReason: "review_resolution_create",
  })
  await refreshFinancialEventSourceCount(createdEvent.id)
  await updateExtractedSignalStatus(context.signal.id, "reconciled")
  await updateReviewQueueItem(context.item.id, {
    status: "resolved",
    resolvedAt: new Date(),
    financialEventId: createdEvent.id,
    proposedResolutionJson: {
      ...proposal,
      resolvedAs: "create",
    },
  })
  await Promise.all([
    triggerFinancialEventValuationRefresh({
      userId: session.user.id,
      financialEventId: createdEvent.id,
    }),
    enqueueRecurringDetectionForEvent({
      userId: session.user.id,
      financialEventId: createdEvent.id,
    }),
    enqueueInstrumentResolutionForEvent({
      userId: session.user.id,
      financialEventId: createdEvent.id,
    }),
  ])

  return redirectToReview(request, "approved")
}
