import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"
import { generateStructuredObject } from "./object-generation"

const logger = createLogger("ai.instrument-resolution")
const providerName = "ai-gateway"

export const instrumentResolutionDecisionSchema = z.enum([
  "link_to_existing_instrument",
  "create_new_instrument",
  "update_existing_instrument",
  "merge_instruments",
  "needs_review",
  "ignore",
])

export const canonicalInstrumentTypeSchema = z.enum([
  "credit_card",
  "debit_card",
  "bank_account",
  "upi",
  "wallet",
  "unknown",
])

export const instrumentResolutionResultSchema = z.object({
  decision: instrumentResolutionDecisionSchema,
  confidence: z.number().min(0).max(1),
  canonicalInstitutionName: z.string().max(160).nullable().optional(),
  canonicalInstrumentType: canonicalInstrumentTypeSchema,
  targetPaymentInstrumentId: z.string().uuid().nullable().optional(),
  instrumentDisplayName: z.string().max(200).nullable().optional(),
  reason: z.string().max(320),
  ignoredHints: z.array(z.string().max(160)).max(8).default([]),
  supportingObservationIds: z.array(z.string().uuid()).min(1).max(50),
})

export type InstrumentResolutionResult = z.infer<typeof instrumentResolutionResultSchema>

type InstrumentObservationSummary = {
  id: string
  observationSourceKind: string
  maskedIdentifier: string | null
  instrumentTypeHint: string | null
  issuerHint: string | null
  issuerAliasHint: string | null
  counterpartyHint: string | null
  networkHint: string | null
  confidence: number
  evidenceSummary: string[]
}

type CandidateInstrumentSummary = {
  id: string
  displayName: string
  providerName: string | null
  canonicalInstitutionName: string | null
  instrumentType: string
  maskedIdentifier: string | null
  linkedEventCount: number
}

type CandidateInstitutionSummary = {
  id: string
  displayName: string
  aliases: string[]
}

export type InstrumentResolutionInput = {
  userId: string
  maskedIdentifier: string
  sourceReliability: {
    bankOriginCount: number
    statementOriginCount: number
    merchantOriginCount: number
  }
  observations: InstrumentObservationSummary[]
  candidateInstruments: CandidateInstrumentSummary[]
  candidateInstitutions: CandidateInstitutionSummary[]
}

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.replace(/\s+/g, " ").trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function clampProbability(value: unknown, fallback = 0.5) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(value, 0), 1)
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed)) {
      return Math.min(Math.max(parsed, 0), 1)
    }
  }

  return fallback
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeString(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)
}

function normalizeUuidArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const ids = value
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entry,
      ),
    )

  return ids.length > 0 ? ids.slice(0, 50) : fallback
}

function coerceInstrumentResolutionResult(
  raw: unknown,
  fallbackObservationIds: string[],
): InstrumentResolutionResult | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const decision = instrumentResolutionDecisionSchema.safeParse(record.decision)
  const instrumentType = canonicalInstrumentTypeSchema.safeParse(record.canonicalInstrumentType)

  return {
    decision: decision.success ? decision.data : "needs_review",
    confidence: clampProbability(record.confidence),
    canonicalInstitutionName: normalizeString(record.canonicalInstitutionName, 160),
    canonicalInstrumentType: instrumentType.success ? instrumentType.data : "unknown",
    targetPaymentInstrumentId:
      typeof record.targetPaymentInstrumentId === "string"
        ? record.targetPaymentInstrumentId
        : null,
    instrumentDisplayName: normalizeString(record.instrumentDisplayName, 200),
    reason:
      normalizeString(record.reason, 320) ??
      "Recovered instrument resolution from schema-mismatch model output.",
    ignoredHints: normalizeStringArray(record.ignoredHints, 8, 160),
    supportingObservationIds: normalizeUuidArray(
      record.supportingObservationIds,
      fallbackObservationIds,
    ),
  }
}

export async function resolvePaymentInstrumentWithAi(input: InstrumentResolutionInput) {
  const gateway = getGatewayProvider()

  const prompt = [
    "You resolve canonical payment instrument identity from structured evidence.",
    "You must separate issuer institution from merchant or counterparty.",
    "Merchant names like Spotify, Amazon, Uber, Google Play, or Apple are not issuer evidence when any bank-origin or statement-origin evidence exists.",
    "Bank-origin sender aliases outrank merchant receipts.",
    "Exact same masked identifier is necessary but not sufficient for merge decisions.",
    "If evidence is insufficient or conflicting, prefer needs_review or ignore over a confident but wrong canonical decision.",
    "If debit-vs-credit is unclear, use unknown.",
    "If multiple aliases like cards@icicibank.com and credit_cards@icicibank.com clearly point to the same issuer, normalize them under one canonical institution.",
    "",
    `Masked identifier cluster: ${input.maskedIdentifier}`,
    `Source reliability summary: bank=${input.sourceReliability.bankOriginCount}, statement=${input.sourceReliability.statementOriginCount}, merchant=${input.sourceReliability.merchantOriginCount}`,
    "",
    "Observations:",
    JSON.stringify(input.observations, null, 2),
    "",
    "Existing candidate instruments:",
    JSON.stringify(input.candidateInstruments, null, 2),
    "",
    "Existing candidate institutions:",
    JSON.stringify(input.candidateInstitutions, null, 2),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeInstrumentResolver),
    schema: instrumentResolutionResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeInstrumentResolver,
    promptVersion: aiPromptVersions.financeInstrumentResolver,
    coerce: (raw) =>
      coerceInstrumentResolutionResult(raw, input.observations.map((observation) => observation.id)),
    fallback: () => ({
      decision: "needs_review" as const,
      confidence: 0.35,
      canonicalInstitutionName: null,
      canonicalInstrumentType: "unknown" as const,
      targetPaymentInstrumentId: null,
      instrumentDisplayName: null,
      reason: "Model output could not be validated. Manual payment instrument review required.",
      ignoredHints: [],
      supportingObservationIds: input.observations.map((observation) => observation.id),
    }),
  })

  if (result.recovery.mode === "strict") {
    logger.info("Resolved payment instrument cluster", {
      maskedIdentifier: input.maskedIdentifier,
      decision: result.object.decision,
      confidence: result.object.confidence,
      ...result.metadata,
    })
  } else {
    logger.warn("Recovered payment instrument resolution from degraded model response", {
      maskedIdentifier: input.maskedIdentifier,
      decision: result.object.decision,
      confidence: result.object.confidence,
      recoveryMode: result.recovery.mode,
      errorMessage: result.recovery.errorMessage,
      finishReason: result.recovery.finishReason,
      rawResponseExcerpt: result.recovery.rawResponseExcerpt,
      ...result.metadata,
    })
  }

  return {
    resolution: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
