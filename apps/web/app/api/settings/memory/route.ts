import { NextResponse } from "next/server"
import { z } from "zod"

import {
  authoredCandidateSchema,
  aiModels,
  aiPromptVersions,
  interpretMemoryAuthoringWithAi,
} from "@workspace/ai"
import {
  createModelRun,
  getMemoryAuthoringCatalogForUser,
  getMemoryFactById,
  normalizeMemoryKey,
  upsertMemoryFact,
  updateMemoryFact,
  updateModelRun,
  type MemoryFactInsert,
} from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { requireSession } from "@/lib/session"

const interpretRequestSchema = z.object({
  action: z.literal("interpret"),
  authoredText: z.string().min(8).max(600),
})

const confirmRequestSchema = z.object({
  action: z.enum(["create", "replace"]),
  authoredText: z.string().min(8).max(600),
  memoryFactId: z.string().uuid().optional(),
  candidates: z.array(authoredCandidateSchema).min(1).max(3),
})

function redirectToPath(input: {
  path: string
  status: string
  query?: string | null
}) {
  const url = new URL(input.path, "http://localhost")
  url.searchParams.set("memory", input.status)
  if (input.query) {
    url.searchParams.set("q", input.query)
  }

  return NextResponse.redirect(url)
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizedEqual(left: string | null | undefined, right: string | null | undefined) {
  return normalizeMemoryKey(left) === normalizeMemoryKey(right)
}

function findMerchant(catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>, name: string) {
  const direct = catalog.merchants.find((merchant) => normalizedEqual(merchant.displayName, name))
  if (direct) {
    return direct
  }

  const alias = catalog.merchantAliases.find((row) => normalizedEqual(row.aliasText, name))
  return alias ? catalog.merchants.find((merchant) => merchant.id === alias.merchantId) ?? null : null
}

function findCategory(
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
  input: { categoryName?: string | null; categorySlug?: string | null },
) {
  if (input.categorySlug) {
    const bySlug = catalog.categories.find((category) => normalizedEqual(category.slug, input.categorySlug))
    if (bySlug) {
      return bySlug
    }
  }

  if (input.categoryName) {
    return (
      catalog.categories.find((category) => normalizedEqual(category.name, input.categoryName)) ??
      null
    )
  }

  return null
}

function findProcessor(
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
  name: string,
) {
  return (
    catalog.processors.find((processor) => normalizedEqual(processor.displayName, name)) ??
    null
  )
}

function findInstitution(
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
  name: string,
) {
  const direct = catalog.institutions.find((institution) =>
    normalizedEqual(institution.displayName, name),
  )
  if (direct) {
    return direct
  }

  const alias = catalog.institutionAliases.find((row) => normalizedEqual(row.aliasText, name))
  return alias
    ? catalog.institutions.find((institution) => institution.id === alias.financialInstitutionId) ??
        null
    : null
}

function findInstrument(
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
  input: { last4?: string | null; displayName?: string | null },
) {
  const normalizedLast4 = normalizeMemoryKey(input.last4)

  if (normalizedLast4) {
    const byLast4 = catalog.instruments.find((instrument) =>
      normalizedEqual(instrument.maskedIdentifier, normalizedLast4),
    )
    if (byLast4) {
      return byLast4
    }
  }

  if (input.displayName) {
    const byName = catalog.instruments.find((instrument) =>
      normalizedEqual(instrument.displayName, input.displayName),
    )
    if (byName) {
      return byName
    }
  }

  return null
}

function findIncomeStream(
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
  name: string,
) {
  return catalog.incomeStreams.find((stream) => normalizedEqual(stream.name, name)) ?? null
}

function buildMemoryInsert(
  userId: string,
  authoredText: string,
  candidate: z.infer<typeof authoredCandidateSchema>,
  catalog: Awaited<ReturnType<typeof getMemoryAuthoringCatalogForUser>>,
) {
  const now = new Date()

  switch (candidate.factType) {
    case "merchant_category_default": {
      const merchant = findMerchant(catalog, candidate.merchantName)
      const category = findCategory(catalog, {
        categoryName: candidate.categoryName,
        categorySlug: candidate.categorySlug,
      })
      const key = normalizeMemoryKey(merchant?.displayName ?? candidate.merchantName)

      if (!merchant || !category || !key) {
        return { error: "I couldn't confidently match that merchant or category. Try using Irene's existing names." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "merchant",
          subjectId: merchant.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            categoryId: category.id,
            categoryName: category.name,
            categorySlug: category.slug,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "merchant_alias": {
      const merchant = findMerchant(catalog, candidate.merchantName)
      const key = normalizeMemoryKey(candidate.aliasText)

      if (!merchant || !key) {
        return { error: "I couldn't confidently match that merchant alias. Try using the merchant's current Irene name." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "merchant",
          subjectId: merchant.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            alias: candidate.aliasText,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "merchant_recurring_hint": {
      const merchant = findMerchant(catalog, candidate.merchantName)
      const key = normalizeMemoryKey(merchant?.displayName ?? candidate.merchantName)

      if (!merchant || !key) {
        return { error: "I couldn't confidently match that recurring merchant memory." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "merchant",
          subjectId: merchant.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            obligationType: candidate.obligationType ?? "subscription",
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "merchant_preferred_processor": {
      const merchant = findMerchant(catalog, candidate.merchantName)
      const processor = findProcessor(catalog, candidate.processorName)
      const key = normalizeMemoryKey(merchant?.displayName ?? candidate.merchantName)

      if (!merchant || !processor || !key) {
        return { error: "I couldn't confidently match that merchant or processor." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "merchant",
          subjectId: merchant.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            paymentProcessorId: processor.id,
            processorName: processor.displayName,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "merchant_preferred_event_type": {
      const merchant = findMerchant(catalog, candidate.merchantName)
      const key = normalizeMemoryKey(merchant?.displayName ?? candidate.merchantName)

      if (!merchant || !key) {
        return { error: "I couldn't confidently match that merchant." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "merchant",
          subjectId: merchant.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            eventType: candidate.eventType,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "sender_institution_alias": {
      const institution = findInstitution(catalog, candidate.institutionName)
      const key = normalizeMemoryKey(candidate.aliasText)

      if (!institution || !key) {
        return { error: "I couldn't confidently match that sender or institution." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "financial_institution",
          subjectId: institution.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            financialInstitutionId: institution.id,
            institutionName: institution.displayName,
            alias: candidate.aliasText,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "instrument_type_preference": {
      const instrument = findInstrument(catalog, {
        last4: candidate.instrumentLast4,
        displayName: candidate.instrumentDisplayName,
      })
      const key = normalizeMemoryKey(instrument?.maskedIdentifier ?? candidate.instrumentLast4)

      if (!instrument || !key) {
        return { error: "I couldn't confidently match that card or account." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "payment_instrument",
          subjectId: instrument.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            paymentInstrumentId: instrument.id,
            displayName: instrument.displayName,
            instrumentType: candidate.instrumentType,
            maskedIdentifier: instrument.maskedIdentifier,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "instrument_backing_account_link": {
      const instrument = findInstrument(catalog, { last4: candidate.instrumentLast4 })
      const backingInstrument = findInstrument(catalog, { last4: candidate.backingInstrumentLast4 })
      const key = normalizeMemoryKey(instrument?.maskedIdentifier ?? candidate.instrumentLast4)

      if (!instrument || !backingInstrument || !key) {
        return { error: "I couldn't confidently match the account link in that note." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "payment_instrument",
          subjectId: instrument.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            paymentInstrumentId: instrument.id,
            displayName: instrument.displayName,
            backingPaymentInstrumentId: backingInstrument.id,
            backingDisplayName: backingInstrument.displayName,
            backingMaskedIdentifier: backingInstrument.maskedIdentifier,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
    case "income_timing_expectation": {
      const incomeStream = findIncomeStream(catalog, candidate.incomeStreamName)
      const key = normalizeMemoryKey(incomeStream?.name ?? candidate.incomeStreamName)

      if (!incomeStream || !key) {
        return { error: "I couldn't confidently match that income stream." }
      }

      return {
        insert: {
          userId,
          factType: candidate.factType,
          subjectType: "income_stream",
          subjectId: incomeStream.id,
          key,
          summaryText: candidate.summaryText,
          detailText: candidate.detailText ?? null,
          authoredText,
          valueJson: {
            incomeStreamId: incomeStream.id,
            name: incomeStream.name,
            cadence: candidate.cadence,
            intervalCount: candidate.intervalCount,
            expectedDayOfMonth: candidate.expectedDayOfMonth ?? null,
            secondaryDayOfMonth: candidate.secondaryDayOfMonth ?? null,
          },
          confidence: candidate.confidence,
          source: "feedback",
          sourceReferenceId: null,
          isUserPinned: false,
          firstObservedAt: now,
          lastConfirmedAt: now,
          expiresAt: null,
        } satisfies MemoryFactInsert,
      }
    }
  }
}

async function handleInterpret(request: Request, userId: string) {
  const body = interpretRequestSchema.parse(await request.json())
  const catalog = await getMemoryAuthoringCatalogForUser(userId)
  const modelRun = await createModelRun({
    userId,
    taskType: "memory_authoring",
    provider: "ai-gateway",
    modelName: aiModels.financeMemoryAuthoring,
    promptVersion: aiPromptVersions.financeMemoryAuthoring,
    status: "running",
  })

  try {
    const interpreted = await interpretMemoryAuthoringWithAi({
      authoredText: body.authoredText,
      merchants: catalog.merchants.map((merchant) => merchant.displayName),
      categories: catalog.categories.map((category) => ({
        name: category.name,
        slug: category.slug,
      })),
      processors: catalog.processors.map((processor) => processor.displayName),
      institutions: catalog.institutions.map((institution) => institution.displayName),
      instruments: catalog.instruments.map((instrument) => ({
        displayName: instrument.displayName,
        maskedIdentifier: instrument.maskedIdentifier,
      })),
      incomeStreams: catalog.incomeStreams.map((stream) => stream.name),
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      inputTokens: interpreted.metadata.inputTokens,
      outputTokens: interpreted.metadata.outputTokens,
      latencyMs: interpreted.metadata.latencyMs,
      requestId: interpreted.metadata.requestId,
      resultJson: {
        result: interpreted.result,
        recovery: interpreted.recovery,
      },
    })

    return NextResponse.json({
      ok: true,
      modelRunId: modelRun.id,
      result: interpreted.result,
    })
  } catch (error) {
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        ok: false,
        error:
          "I couldn't turn that note into a safe memory yet. Try splitting it into one clearer idea.",
      },
      { status: 400 },
    )
  }
}

async function handleConfirm(request: Request, userId: string) {
  const body = confirmRequestSchema.parse(await request.json())
  const catalog = await getMemoryAuthoringCatalogForUser(userId)
  const inserts: MemoryFactInsert[] = []

  for (const candidate of body.candidates) {
    const built = buildMemoryInsert(userId, body.authoredText, candidate, catalog)
    if ("error" in built) {
      return NextResponse.json({ ok: false, error: built.error }, { status: 400 })
    }

    inserts.push(built.insert)
  }

  const createdFacts = []
  for (const insert of inserts) {
    createdFacts.push(await upsertMemoryFact(insert))
  }

  if (body.action === "replace" && body.memoryFactId) {
    const existing = await getMemoryFactById(body.memoryFactId)
    if (existing && existing.userId === userId) {
      const stillPresent = createdFacts.some((fact) => fact.id === existing.id)
      if (!stillPresent) {
        await updateMemoryFact(existing.id, {
          isUserPinned: false,
          expiresAt: new Date(),
          key: `${existing.key}::superseded::${Date.now()}`,
        })
      }
      await recordFeedbackEvent({
        userId,
        targetType: "memory_fact",
        targetId: existing.id,
        correctionType: "replace_memory_from_note",
        sourceSurface: "settings",
        previousValue: {
          summaryText: existing.summaryText,
          detailText: existing.detailText,
          authoredText: existing.authoredText,
        },
        newValue: {
          replacementCount: createdFacts.length,
          summaries: createdFacts.map((fact) => fact.summaryText),
        },
        metadata: {
          factType: existing.factType,
          key: existing.key,
        },
      })
    }
  }

  for (const fact of createdFacts) {
    await recordFeedbackEvent({
      userId,
      targetType: "memory_fact",
      targetId: fact.id,
      correctionType: "create_memory_from_note",
      sourceSurface: "settings",
      previousValue: null,
      newValue: {
        summaryText: fact.summaryText,
        detailText: fact.detailText,
        authoredText: fact.authoredText,
      },
      metadata: {
        factType: fact.factType,
        key: fact.key,
      },
    })
  }

  const redirectTo =
    createdFacts.length === 1
      ? `/settings/memory/${createdFacts[0]!.id}?memory=${body.action === "replace" ? "updated" : "created"}`
      : `/settings/memory?memory=${body.action === "replace" ? "updated" : "created"}`

  return NextResponse.json({
    ok: true,
    redirectTo,
  })
}

export async function POST(request: Request) {
  const session = await requireSession()
  const contentType = request.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const cloned = request.clone()
    const body = await cloned.json()
    const action = asString(body.action)

    if (action === "interpret") {
      return handleInterpret(request, session.user.id)
    }

    if (action === "create" || action === "replace") {
      return handleConfirm(request, session.user.id)
    }

    return NextResponse.json({ ok: false, error: "Invalid memory action." }, { status: 400 })
  }

  const formData = await request.formData()
  const action = String(formData.get("action") ?? "")
  const memoryFactId = String(formData.get("memoryFactId") ?? "")
  const query = String(formData.get("q") ?? "")
  const returnTo = asString(formData.get("returnTo")) ?? "/settings/memory"

  if (!memoryFactId) {
    return redirectToPath({ path: returnTo, status: "invalid", query })
  }

  const memoryFact = await getMemoryFactById(memoryFactId)

  if (!memoryFact || memoryFact.userId !== session.user.id) {
    return redirectToPath({ path: returnTo, status: "invalid", query })
  }

  if (action === "pin") {
    await updateMemoryFact(memoryFact.id, {
      isUserPinned: true,
      expiresAt: null,
    })
    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "memory_fact",
      targetId: memoryFact.id,
      correctionType: "pin_memory",
      sourceSurface: "settings",
      previousValue: {
        isUserPinned: memoryFact.isUserPinned,
        expiresAt: memoryFact.expiresAt?.toISOString() ?? null,
      },
      newValue: {
        isUserPinned: true,
        expiresAt: null,
      },
      metadata: {
        factType: memoryFact.factType,
        key: memoryFact.key,
      },
    })
    return redirectToPath({ path: returnTo, status: "pinned", query })
  }

  if (action === "unpin") {
    await updateMemoryFact(memoryFact.id, {
      isUserPinned: false,
    })
    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "memory_fact",
      targetId: memoryFact.id,
      correctionType: "unpin_memory",
      sourceSurface: "settings",
      previousValue: {
        isUserPinned: memoryFact.isUserPinned,
      },
      newValue: {
        isUserPinned: false,
      },
      metadata: {
        factType: memoryFact.factType,
        key: memoryFact.key,
      },
    })
    return redirectToPath({ path: returnTo, status: "unpinned", query })
  }

  if (action === "expire") {
    await updateMemoryFact(memoryFact.id, {
      isUserPinned: false,
      expiresAt: new Date(),
    })
    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "memory_fact",
      targetId: memoryFact.id,
      correctionType: "expire_memory",
      sourceSurface: "settings",
      previousValue: {
        isUserPinned: memoryFact.isUserPinned,
        expiresAt: memoryFact.expiresAt?.toISOString() ?? null,
      },
      newValue: {
        isUserPinned: false,
        expiresAt: new Date().toISOString(),
      },
      metadata: {
        factType: memoryFact.factType,
        key: memoryFact.key,
      },
    })
    return redirectToPath({ path: returnTo, status: "expired", query })
  }

  if (action === "restore") {
    await updateMemoryFact(memoryFact.id, {
      expiresAt: null,
    })
    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "memory_fact",
      targetId: memoryFact.id,
      correctionType: "restore_memory",
      sourceSurface: "settings",
      previousValue: {
        expiresAt: memoryFact.expiresAt?.toISOString() ?? null,
      },
      newValue: {
        expiresAt: null,
      },
      metadata: {
        factType: memoryFact.factType,
        key: memoryFact.key,
      },
    })
    return redirectToPath({ path: returnTo, status: "restored", query })
  }

  return redirectToPath({ path: returnTo, status: "invalid", query })
}
