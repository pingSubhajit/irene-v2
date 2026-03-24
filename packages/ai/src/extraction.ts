import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"
import {
  generateStructuredObject,
  type GeneratedObjectMetadata,
} from "./object-generation"

const logger = createLogger("ai.finance-extraction")

const providerName = "ai-gateway"

export const documentRouteLabelSchema = z.enum([
  "purchase",
  "income",
  "subscription_charge",
  "emi_payment",
  "bill_payment",
  "refund",
  "transfer",
  "generic_finance",
])

export const documentRouteResultSchema = z.object({
  routeLabel: documentRouteLabelSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1).max(4),
  summary: z.string().max(240).optional(),
})

const extractedSignalSchema = z.object({
  signalType: z.enum([
    "purchase_signal",
    "income_signal",
    "subscription_signal",
    "emi_signal",
    "bill_signal",
    "refund_signal",
    "transfer_signal",
    "generic_finance_signal",
  ]),
  candidateEventType: z
    .enum([
      "purchase",
      "income",
      "subscription_charge",
      "emi_payment",
      "bill_payment",
      "refund",
      "transfer",
    ])
    .nullable()
    .optional(),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  issuerNameHint: z.string().max(160).nullable().optional(),
  instrumentLast4Hint: z.string().max(16).nullable().optional(),
  availableBalanceMinor: z.number().int().nonnegative().nullable().optional(),
  availableCreditLimitMinor: z.number().int().nonnegative().nullable().optional(),
  balanceAsOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  balanceInstrumentLast4Hint: z.string().max(16).nullable().optional(),
  backingAccountLast4Hint: z.string().max(16).nullable().optional(),
  backingAccountNameHint: z.string().max(160).nullable().optional(),
  accountRelationshipHint: z
    .enum(["direct_account", "linked_card_account", "unknown"])
    .nullable()
    .optional(),
  balanceEvidenceStrength: z.enum(["explicit", "strong", "weak"]).nullable().optional(),
  merchantDescriptorRaw: z.string().max(240).nullable().optional(),
  merchantNameCandidate: z.string().max(240).nullable().optional(),
  processorNameCandidate: z.string().max(160).nullable().optional(),
  channelHint: z
    .enum(["card", "wallet", "upi", "bank_transfer", "other"])
    .nullable()
    .optional(),
  merchantRaw: z.string().max(240).nullable().optional(),
  merchantHint: z.string().max(240).nullable().optional(),
  paymentInstrumentHint: z.string().max(120).nullable().optional(),
  categoryHint: z.string().max(120).nullable().optional(),
  categoryCandidates: z.array(z.string().max(120)).max(4).default([]),
  isRecurringHint: z.boolean().default(false),
  isEmiHint: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  roleConfidence: z.number().min(0).max(1).nullable().optional(),
  evidenceSnippets: z.array(z.string().max(280)).max(4),
  explanation: z.string().max(240).optional(),
})

export const structuredExtractionResultSchema = z.object({
  signals: z.array(extractedSignalSchema).max(4),
  extractionSummary: z.string().max(280).optional(),
})

export const merchantHintExtractionResultSchema = z.object({
  merchantDescriptorRaw: z.string().max(240).nullable().optional(),
  merchantNameCandidate: z.string().max(240).nullable().optional(),
  merchantHint: z.string().max(240).nullable().optional(),
  merchantRaw: z.string().max(240).nullable().optional(),
  processorNameCandidate: z.string().max(160).nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidenceSnippets: z.array(z.string().max(280)).max(4),
  explanation: z.string().max(240).optional(),
})

export type DocumentRouteLabel = z.infer<typeof documentRouteLabelSchema>
export type DocumentRouteResult = z.infer<typeof documentRouteResultSchema>
export type StructuredExtractionSignal = z.infer<typeof extractedSignalSchema>
export type StructuredExtractionResult = z.infer<typeof structuredExtractionResultSchema>
export type MerchantHintExtractionResult = z.infer<typeof merchantHintExtractionResultSchema>

export type NormalizedFinanceDocumentInput = {
  sender: string | null
  recipient: string | null
  subject: string | null
  snippet: string | null
  messageTimestamp: string
  bodyText: string | null
  attachmentTexts: Array<{
    attachmentId: string
    filename: string
    mimeType: string
    parsedText: string
  }>
  relevanceLabel: string | null
  relevanceStage: string | null
}

function buildMemoryContext(memorySummary?: string[]) {
  return [
    "",
    "User memory:",
    memorySummary?.length ? memorySummary.join("\n") : "none",
  ].join("\n")
}

type ModelRunMetadata = GeneratedObjectMetadata

const balanceRecoverySchema = z.object({
  containsAvailableBalance: z.boolean().default(false),
  containsAvailableCreditLimit: z.boolean().default(false),
  availableBalanceMinor: z.number().int().nonnegative().nullable().optional(),
  availableCreditLimitMinor: z.number().int().nonnegative().nullable().optional(),
  balanceAsOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  balanceInstrumentLast4Hint: z.string().max(16).nullable().optional(),
  backingAccountLast4Hint: z.string().max(16).nullable().optional(),
  backingAccountNameHint: z.string().max(160).nullable().optional(),
  accountRelationshipHint: z
    .enum(["direct_account", "linked_card_account", "unknown"])
    .nullable()
    .optional(),
  balanceEvidenceStrength: z.enum(["explicit", "strong", "weak"]).nullable().optional(),
  explanation: z.string().max(240).optional(),
})

const balanceInferenceSchema = balanceRecoverySchema.extend({
  institutionIssued: z.boolean().default(false),
  reason: z.string().max(240).optional(),
})

export type DocumentBalanceInferenceResult = z.infer<typeof balanceInferenceSchema>

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function truncate(input: string | null | undefined, max = 4000) {
  if (!input) {
    return "none"
  }

  return input.length > max ? `${input.slice(0, max)}…` : input
}

function getUsage(result: unknown) {
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage

  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  }
}

function getRequestId(result: unknown) {
  const response = (result as { response?: { id?: string } }).response
  return response?.id ?? null
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeMinorAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return value
    }

    return Math.round(value * 100)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const numeric = Number.parseFloat(trimmed.replace(/,/g, ""))
    if (!Number.isFinite(numeric)) {
      return null
    }

    if (trimmed.includes(".")) {
      return Math.round(numeric * 100)
    }

    return Number.isInteger(numeric) ? numeric : Math.round(numeric * 100)
  }

  return null
}

function clampProbability(value: unknown, fallback = 0.5) {
  const normalized = normalizeNumber(value)

  if (normalized === null) {
    return fallback
  }

  return Math.min(Math.max(normalized, 0), 1)
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.replace(/\s+/g, " ").trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, maxLength)
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") {
      return true
    }
    if (normalized === "false") {
      return false
    }
  }

  return false
}

function normalizeCurrency(value: unknown) {
  const normalized = normalizeString(value, 16)

  if (!normalized) {
    return null
  }

  if (/₹|^rs\.?$|^inr$/i.test(normalized)) {
    return "INR"
  }

  if (/^\$|^usd$/i.test(normalized)) {
    return "USD"
  }

  const alpha = normalized.toUpperCase().replace(/[^A-Z]/g, "")
  return alpha.length >= 3 ? alpha.slice(0, 3) : null
}

function normalizeEventDate(value: unknown) {
  const normalized = normalizeString(value, 64)

  if (!normalized) {
    return null
  }

  const exactMatch = normalized.match(/^\d{4}-\d{2}-\d{2}$/)
  if (exactMatch) {
    return exactMatch[0]
  }

  const embeddedMatch = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  return embeddedMatch?.[1] ?? null
}

function normalizeChannelHint(value: unknown): StructuredExtractionSignal["channelHint"] {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  switch (normalized) {
    case "card":
    case "wallet":
    case "upi":
    case "bank_transfer":
    case "other":
      return normalized
    case "banktransfer":
      return "bank_transfer"
    default:
      return null
  }
}

function coerceBalanceInferenceResult(raw: unknown): DocumentBalanceInferenceResult | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const availableBalanceMinor = normalizeMinorAmount(record.availableBalanceMinor)
  const availableCreditLimitMinor = normalizeMinorAmount(record.availableCreditLimitMinor)

  return {
    containsAvailableBalance:
      normalizeBoolean(record.containsAvailableBalance) ||
      Number.isInteger(availableBalanceMinor),
    containsAvailableCreditLimit:
      normalizeBoolean(record.containsAvailableCreditLimit) ||
      Number.isInteger(availableCreditLimitMinor),
    availableBalanceMinor: Number.isInteger(availableBalanceMinor) ? availableBalanceMinor : null,
    availableCreditLimitMinor: Number.isInteger(availableCreditLimitMinor)
      ? availableCreditLimitMinor
      : null,
    balanceAsOfDate: normalizeEventDate(record.balanceAsOfDate),
    balanceInstrumentLast4Hint: normalizeString(record.balanceInstrumentLast4Hint, 16),
    backingAccountLast4Hint: normalizeString(record.backingAccountLast4Hint, 16),
    backingAccountNameHint: normalizeString(record.backingAccountNameHint, 160),
    accountRelationshipHint: normalizeAccountRelationshipHint(record.accountRelationshipHint),
    balanceEvidenceStrength: normalizeBalanceEvidenceStrength(record.balanceEvidenceStrength),
    institutionIssued: normalizeBoolean(record.institutionIssued),
    reason: normalizeString(record.reason, 240) ?? undefined,
    explanation:
      normalizeString(record.explanation, 240) ??
      "Recovered balance evidence from schema-mismatch model output.",
  }
}

export function mergeBalanceInferenceIntoSignals(input: {
  signals: StructuredExtractionSignal[]
  balance: DocumentBalanceInferenceResult
}) {
  if (input.signals.length === 0) {
    return input.signals
  }

  if (
    typeof input.balance.availableBalanceMinor !== "number" &&
    typeof input.balance.availableCreditLimitMinor !== "number"
  ) {
    return input.signals
  }

  let targetIndex = 0

  if (input.balance.balanceInstrumentLast4Hint) {
    const matchedIndex = input.signals.findIndex(
      (signal) =>
        signal.instrumentLast4Hint === input.balance.balanceInstrumentLast4Hint ||
        signal.balanceInstrumentLast4Hint === input.balance.balanceInstrumentLast4Hint,
    )

    if (matchedIndex >= 0) {
      targetIndex = matchedIndex
    }
  }

  return input.signals.map((signal, index) => {
    if (index !== targetIndex) {
      return signal
    }

    return {
      ...signal,
      availableBalanceMinor:
        signal.availableBalanceMinor ?? input.balance.availableBalanceMinor ?? null,
      availableCreditLimitMinor:
        signal.availableCreditLimitMinor ?? input.balance.availableCreditLimitMinor ?? null,
      balanceAsOfDate: signal.balanceAsOfDate ?? input.balance.balanceAsOfDate ?? null,
      balanceInstrumentLast4Hint:
        signal.balanceInstrumentLast4Hint ?? input.balance.balanceInstrumentLast4Hint ?? null,
      backingAccountLast4Hint:
        signal.backingAccountLast4Hint ?? input.balance.backingAccountLast4Hint ?? null,
      backingAccountNameHint:
        signal.backingAccountNameHint ?? input.balance.backingAccountNameHint ?? null,
      accountRelationshipHint:
        signal.accountRelationshipHint ?? input.balance.accountRelationshipHint ?? null,
      balanceEvidenceStrength:
        signal.balanceEvidenceStrength ?? input.balance.balanceEvidenceStrength ?? null,
      explanation:
        signal.explanation ??
        input.balance.explanation ??
        "Model extracted balance-bearing evidence from the source document.",
    }
  })
}

function buildSignalContext(signals: Array<{
  signalType: string
  candidateEventType?: string | null
  instrumentLast4Hint?: string | null
  balanceInstrumentLast4Hint?: string | null
  backingAccountLast4Hint?: string | null
  amountMinor?: number | null
  currency?: string | null
}>) {
  if (signals.length === 0) {
    return "No extracted signals exist yet."
  }

  return signals
    .map((signal, index) =>
      [
        `Signal ${index + 1}:`,
        `type=${signal.signalType}`,
        `candidateEventType=${signal.candidateEventType ?? "null"}`,
        `amountMinor=${signal.amountMinor ?? "null"}`,
        `currency=${signal.currency ?? "null"}`,
        `instrumentLast4=${signal.instrumentLast4Hint ?? "null"}`,
        `balanceInstrumentLast4=${signal.balanceInstrumentLast4Hint ?? "null"}`,
        `backingAccountLast4=${signal.backingAccountLast4Hint ?? "null"}`,
      ].join(" "),
    )
    .join("\n")
}

function buildInstrumentContext(
  instruments: Array<{
    displayName: string
    instrumentType: string
    maskedIdentifier: string | null
    institutionName: string | null
  }>,
) {
  if (instruments.length === 0) {
    return "No known instruments for this user."
  }

  return instruments
    .map(
      (instrument, index) =>
        `Instrument ${index + 1}: ${instrument.displayName} | type=${instrument.instrumentType} | last4=${instrument.maskedIdentifier ?? "null"} | institution=${instrument.institutionName ?? "null"}`,
    )
    .join("\n")
}

export async function inferDocumentBalanceContext(input: {
  normalizedDocument: NormalizedFinanceDocumentInput
  signals: Array<{
    signalType: StructuredExtractionSignal["signalType"]
    candidateEventType?: StructuredExtractionSignal["candidateEventType"]
    instrumentLast4Hint?: string | null
    balanceInstrumentLast4Hint?: string | null
    backingAccountLast4Hint?: string | null
    amountMinor?: number | null
    currency?: string | null
  }>
  existingInstruments?: Array<{
    displayName: string
    instrumentType: string
    maskedIdentifier: string | null
    institutionName: string | null
  }>
  memorySummary?: string[]
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You extract only account-balance, credit-limit, and card-to-account-linking evidence from a single normalized finance document.",
    "This is a dedicated post-extraction balance inference step that runs even when the main transaction signal is already obvious.",
    "Decide whether the document explicitly contains available balance and/or available credit limit.",
    "Return only what is directly supported by the source text. Do not guess.",
    "institutionIssued should be true only when the sender/content clearly indicates a bank, card issuer, wallet, or account provider.",
    "Available balance on a bank account or wallet is cash-balance evidence.",
    "Available credit limit on a credit card is headroom evidence only, not a cash balance.",
    "If a card/account ending is shown with the balance or limit, populate balanceInstrumentLast4Hint.",
    "If a separate backing bank account is explicitly identified, populate backingAccountLast4Hint and backingAccountNameHint.",
    "accountRelationshipHint should be direct_account when the balance belongs to the account itself, linked_card_account when the card is explicitly tied to a backing account, or unknown otherwise.",
    "balanceEvidenceStrength should be explicit for clear stated values, strong for clear but slightly indirect evidence, and weak otherwise.",
    "Return monetary values in minor units. Example: Rs 5943.4 -> 594340, INR 47045.25 -> 4704525.",
    "Example: 'account 30XX8899 has been debited via Debit Card XX5754 ... available balance is Rs 5943.4' means backingAccountLast4Hint=8899, balanceInstrumentLast4Hint=5754, accountRelationshipHint=linked_card_account, availableBalanceMinor=594340.",
    "Ignore transaction amount, merchant name, processor, support phone numbers, footer text, and boilerplate unless needed to understand which instrument the balance belongs to.",
    "",
    "Existing extracted signals:",
    buildSignalContext(input.signals),
    "",
    "Known user instruments:",
    buildInstrumentContext(input.existingInstruments ?? []),
    "",
    buildBaseContext(input.normalizedDocument),
    buildMemoryContext(input.memorySummary),
  ].join("\n")

  return generateStructuredObject({
    model: gateway(aiModels.financeBalanceExtractor),
    schema: balanceInferenceSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeBalanceExtractor,
    promptVersion: aiPromptVersions.financeBalanceExtractor,
    coerce: (raw) => coerceBalanceInferenceResult(raw),
    fallback: () => ({
      containsAvailableBalance: false,
      containsAvailableCreditLimit: false,
      availableBalanceMinor: null,
      availableCreditLimitMinor: null,
      balanceAsOfDate: null,
      balanceInstrumentLast4Hint: null,
      backingAccountLast4Hint: null,
      backingAccountNameHint: null,
      accountRelationshipHint: null,
      balanceEvidenceStrength: null,
      institutionIssued: false,
      reason: "The document did not provide clear balance-bearing account evidence.",
      explanation:
        "Balance inference could not validate a balance or credit-limit amount.",
    }),
  })
}

function normalizeAccountRelationshipHint(
  value: unknown,
): StructuredExtractionSignal["accountRelationshipHint"] {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  switch (normalized) {
    case "direct_account":
    case "linked_card_account":
    case "unknown":
      return normalized
    case "direct":
    case "account":
    case "bank_account":
      return "direct_account"
    case "linked_card":
    case "linked_account":
    case "card_account":
      return "linked_card_account"
    default:
      return null
  }
}

function normalizeBalanceEvidenceStrength(
  value: unknown,
): StructuredExtractionSignal["balanceEvidenceStrength"] {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()

  switch (normalized) {
    case "explicit":
    case "strong":
    case "weak":
      return normalized
    case "high":
    case "clear":
      return "explicit"
    case "medium":
      return "strong"
    case "low":
      return "weak"
    default:
      return null
  }
}

function defaultSignalTypeForRoute(routeLabel: DocumentRouteLabel): StructuredExtractionSignal["signalType"] {
  switch (routeLabel) {
    case "purchase":
      return "purchase_signal"
    case "income":
      return "income_signal"
    case "subscription_charge":
      return "subscription_signal"
    case "emi_payment":
      return "emi_signal"
    case "bill_payment":
      return "bill_signal"
    case "refund":
      return "refund_signal"
    case "transfer":
      return "transfer_signal"
    case "generic_finance":
      return "generic_finance_signal"
  }
}

function normalizeSignalType(
  value: unknown,
  routeLabel: DocumentRouteLabel,
): StructuredExtractionSignal["signalType"] {
  if (typeof value !== "string") {
    return defaultSignalTypeForRoute(routeLabel)
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  switch (normalized) {
    case "purchase_signal":
    case "purchase":
      return "purchase_signal"
    case "income_signal":
    case "income":
      return "income_signal"
    case "subscription_signal":
    case "subscription":
    case "subscription_charge":
      return "subscription_signal"
    case "emi_signal":
    case "emi":
    case "emi_payment":
      return "emi_signal"
    case "bill_signal":
    case "bill":
    case "bill_payment":
      return "bill_signal"
    case "refund_signal":
    case "refund":
    case "reversal":
      return "refund_signal"
    case "transfer_signal":
    case "transfer":
    case "bank_transfer":
      return "transfer_signal"
    case "generic_finance_signal":
    case "generic_finance":
    case "generic":
      return "generic_finance_signal"
    default:
      return defaultSignalTypeForRoute(routeLabel)
  }
}

function normalizeCandidateEventType(
  value: unknown,
): StructuredExtractionSignal["candidateEventType"] {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  switch (normalized) {
    case "purchase":
      return "purchase"
    case "income":
      return "income"
    case "subscription":
    case "subscription_charge":
      return "subscription_charge"
    case "emi":
    case "emi_payment":
      return "emi_payment"
    case "bill":
    case "bill_payment":
    case "statement":
      return "bill_payment"
    case "refund":
    case "reversal":
      return "refund"
    case "transfer":
    case "bank_transfer":
      return "transfer"
    default:
      return null
  }
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

function getFallbackEvidence(input: NormalizedFinanceDocumentInput) {
  return normalizeStringArray(
    [
      input.subject,
      input.snippet,
      input.bodyText?.slice(0, 280),
    ],
    4,
    280,
  )
}

function coerceStructuredExtractionResult(
  raw: unknown,
  input: {
    normalizedDocument: NormalizedFinanceDocumentInput
    routeLabel: DocumentRouteLabel
  },
): StructuredExtractionResult {
  const rawRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  const rawSignals = rawRecord?.signals
  const signalEntries = Array.isArray(rawSignals)
    ? rawSignals
    : rawSignals && typeof rawSignals === "object"
      ? [rawSignals]
      : []

  const signals: StructuredExtractionSignal[] = signalEntries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return []
    }

    const record = entry as Record<string, unknown>
    const signalType = normalizeSignalType(record.signalType, input.routeLabel)
    const candidateEventType =
      signalType === "generic_finance_signal"
        ? null
        : normalizeCandidateEventType(record.candidateEventType)
    const amountMinorValue = normalizeMinorAmount(record.amountMinor)

    return [
      {
        signalType,
        candidateEventType,
        amountMinor: Number.isInteger(amountMinorValue) ? amountMinorValue : null,
        currency: normalizeCurrency(record.currency),
        eventDate: normalizeEventDate(record.eventDate),
        issuerNameHint: normalizeString(record.issuerNameHint, 160),
        instrumentLast4Hint: normalizeString(record.instrumentLast4Hint, 16),
        availableBalanceMinor: normalizeMinorAmount(record.availableBalanceMinor),
        availableCreditLimitMinor: normalizeMinorAmount(record.availableCreditLimitMinor),
        balanceAsOfDate: normalizeEventDate(record.balanceAsOfDate),
        balanceInstrumentLast4Hint: normalizeString(record.balanceInstrumentLast4Hint, 16),
        backingAccountLast4Hint: normalizeString(record.backingAccountLast4Hint, 16),
        backingAccountNameHint: normalizeString(record.backingAccountNameHint, 160),
        accountRelationshipHint: normalizeAccountRelationshipHint(record.accountRelationshipHint),
        balanceEvidenceStrength: normalizeBalanceEvidenceStrength(
          record.balanceEvidenceStrength,
        ),
        merchantDescriptorRaw: normalizeString(record.merchantDescriptorRaw, 240),
        merchantNameCandidate: normalizeString(record.merchantNameCandidate, 240),
        processorNameCandidate: normalizeString(record.processorNameCandidate, 160),
        channelHint: normalizeChannelHint(record.channelHint),
        merchantRaw: normalizeString(record.merchantRaw, 240),
        merchantHint: normalizeString(record.merchantHint, 240),
        paymentInstrumentHint: normalizeString(record.paymentInstrumentHint, 120),
        categoryHint: normalizeString(record.categoryHint, 120),
        categoryCandidates: normalizeStringArray(record.categoryCandidates, 4, 120),
        isRecurringHint: normalizeBoolean(record.isRecurringHint),
        isEmiHint: normalizeBoolean(record.isEmiHint),
        confidence: clampProbability(record.confidence),
        roleConfidence: record.roleConfidence == null ? null : clampProbability(record.roleConfidence),
        evidenceSnippets: (() => {
          const snippets = normalizeStringArray(record.evidenceSnippets, 4, 280)
          return snippets.length > 0 ? snippets : getFallbackEvidence(input.normalizedDocument)
        })(),
        explanation:
          normalizeString(record.explanation, 240) ??
          "Recovered extracted signal from schema-mismatch model output.",
      } satisfies StructuredExtractionSignal,
    ]
  })

  return {
    signals,
    extractionSummary:
      normalizeString(rawRecord?.extractionSummary, 280) ??
      (signals.length > 0 ? "Recovered structured extraction from schema-mismatch model output." : undefined),
  }
}

function coerceMerchantHintExtractionResult(input: {
  raw: unknown
  normalizedDocument: NormalizedFinanceDocumentInput
}): MerchantHintExtractionResult {
  const record =
    input.raw && typeof input.raw === "object" ? (input.raw as Record<string, unknown>) : {}
  const evidenceSnippets = normalizeStringArray(record.evidenceSnippets, 4, 280)
  const fallbackEvidence = getFallbackEvidence(input.normalizedDocument)

  return {
    merchantDescriptorRaw: normalizeString(record.merchantDescriptorRaw, 240),
    merchantNameCandidate: normalizeString(record.merchantNameCandidate, 240),
    merchantHint: normalizeString(record.merchantHint, 240),
    merchantRaw: normalizeString(record.merchantRaw, 240),
    processorNameCandidate: normalizeString(record.processorNameCandidate, 160),
    confidence: clampProbability(record.confidence, 0.2),
    evidenceSnippets: evidenceSnippets.length > 0 ? evidenceSnippets : fallbackEvidence,
    explanation:
      normalizeString(record.explanation, 240) ??
      "Recovered merchant hint extraction from schema-mismatch model output.",
  }
}

function buildBaseContext(input: NormalizedFinanceDocumentInput) {
  const attachmentSection =
    input.attachmentTexts.length > 0
      ? input.attachmentTexts
          .map(
            (attachment, index) =>
              `Attachment ${index + 1}: ${attachment.filename} (${attachment.mimeType})\n${truncate(
                attachment.parsedText,
                2500,
              )}`,
          )
          .join("\n\n")
      : "No parsed attachment text."

  return [
    `Sender: ${input.sender ?? "unknown"}`,
    `Recipient: ${input.recipient ?? "unknown"}`,
    `Subject: ${input.subject ?? "unknown"}`,
    `Snippet: ${truncate(input.snippet, 500)}`,
    `Message timestamp: ${input.messageTimestamp}`,
    `Phase 2 relevance label: ${input.relevanceLabel ?? "unknown"}`,
    `Phase 2 relevance stage: ${input.relevanceStage ?? "unknown"}`,
    "",
    "Normalized email body:",
    truncate(input.bodyText, 5000),
    "",
    "Parsed attachment text:",
    attachmentSection,
  ].join("\n")
}

export async function routeDocumentForExtraction(input: NormalizedFinanceDocumentInput & {
  memorySummary?: string[]
}) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()
  const prompt = [
    "You route already-ingested finance-relevant emails into one extraction profile.",
    "Choose the most likely route from the allowed labels.",
    "purchase: completed purchase or merchant receipt",
    "income: payroll, salary, payout, reimbursement, incoming money",
    "subscription_charge: subscription purchase, renewal, expiring subscription, subscription receipt",
    "emi_payment: installment, EMI, standing instruction for EMI, card EMI",
    "bill_payment: statement, bill due, mandate, auto-debit for a bill that is not clearly EMI",
    "refund: refund, reversal, chargeback, credited back",
    "transfer: bank transfer or peer transfer not obviously purchase/income",
    "generic_finance: finance-relevant but not confidently one of the above",
    "Prefer purchase over generic_finance for merchant order confirmations.",
    "Prefer subscription_charge over purchase when the message is clearly about a subscription lifecycle.",
    "Promotional finance emails, marketing campaigns, EMI offers, card offers, discount offers, cashback campaigns, upgrade offers, or 'starting at' financing messages are generic_finance unless they clearly describe a completed payment, an active obligation, or a due/reminder tied to an existing obligation.",
    "Mention of EMI, installment, bill, card, or amount alone is not enough to choose emi_payment or bill_payment.",
    "",
    buildBaseContext(input),
    buildMemoryContext(input.memorySummary),
  ].join("\n")

  const result = await generateObject({
    model: gateway(aiModels.financeDocumentRouter),
    schema: documentRouteResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeDocumentRouter,
    promptVersion: aiPromptVersions.financeDocumentRouter,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies ModelRunMetadata

  logger.info("Routed finance document for extraction", {
    routeLabel: result.object.routeLabel,
    confidence: result.object.confidence,
    ...metadata,
  })

  return {
    route: result.object,
    metadata,
  }
}

const routeSpecificInstructions: Record<DocumentRouteLabel, string[]> = {
  purchase: [
    "Extract completed purchase or receipt information.",
    "Use purchase_signal. candidateEventType should be purchase when clearly completed.",
  ],
  income: [
    "Extract incoming money information such as salary or payout.",
    "Use income_signal. candidateEventType should be income when clearly completed.",
  ],
  subscription_charge: [
    "Extract subscription lifecycle or subscription charge information.",
    "Use subscription_signal. candidateEventType may be subscription_charge when money movement already happened, otherwise null.",
  ],
  emi_payment: [
    "Extract EMI or installment details.",
    "Use emi_signal. candidateEventType may be emi_payment when money movement already happened, otherwise null.",
  ],
  bill_payment: [
    "Extract bill due, statement, mandate, or bill payment information.",
    "Use bill_signal. candidateEventType may be bill_payment when money movement already happened, otherwise null.",
  ],
  refund: [
    "Extract refund or reversal details.",
    "Use refund_signal. candidateEventType should be refund when clearly completed.",
  ],
  transfer: [
    "Extract transfer details between accounts or people.",
    "Use transfer_signal. candidateEventType should be transfer when clearly completed.",
  ],
  generic_finance: [
    "The document is finance-relevant but ambiguous.",
    "Prefer one generic_finance_signal with candidateEventType null unless the text clearly supports a typed signal.",
    "Use this for finance offers, card promotions, EMI marketing, discounts, and upsell messages.",
  ],
}

export async function extractStructuredSignals(input: {
  normalizedDocument: NormalizedFinanceDocumentInput
  routeLabel: DocumentRouteLabel
  memorySummary?: string[]
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You extract structured candidate finance signals from a single normalized document.",
    "Return only what is supported by the source text. Do not guess.",
    "Signals are hypotheses, not canonical truth.",
    "This model is the primary extractor for ambiguous finance documents because deterministic extraction is intentionally minimal.",
    "Prefer one high-quality signal over multiple speculative signals.",
    "If the document is finance-relevant but fields are incomplete, still return a typed signal with missing fields set to null when justified.",
    "When the document is too ambiguous, return one generic_finance_signal.",
    "Differentiate carefully between: completed money movement, obligation setup/change, due or reminder notices, and finance administration or lifecycle notices.",
    "Promotional or offer emails must not produce purchase_signal, emi_signal, bill_signal, subscription_signal, refund_signal, transfer_signal, or income_signal unless the email clearly proves a completed money movement, an active obligation, or a due/reminder for an existing obligation.",
    "Examples that should become generic_finance_signal: EMI offers, card upgrade offers, cashback campaigns, 'save up to' promotions, shopping deals with financing language, and pre-approved loan offers.",
    "If the email advertises financing terms like 'EMI starting at' without confirming enrollment or payment, return generic_finance_signal.",
    "If a document confirms setup, conversion, or restructuring of an obligation but does not prove that money moved in this document, use the obligation-appropriate signal type with candidateEventType null instead of forcing a purchase, refund, or income event.",
    "Do not treat words like cancellation, foreclosure, schedule, plan, conversion, or booking as evidence of refund by themselves.",
    "For purchase-like or bank-alert documents, explicitly separate issuer, merchant, and processor when possible.",
    "Sender email or sender display name is usually issuer evidence, not merchant evidence, for bank alerts.",
    "Descriptor strings like PAYPAL *UBISOFTEMEA often contain both a processor and a merchant. Prefer processor=PayPal and merchant=Ubisoft rather than using the whole descriptor as merchant.",
    "merchantNameCandidate should be who the user actually paid. processorNameCandidate should be an intermediary like PayPal, Razorpay, Google, Apple, or Amazon Pay when present.",
    "merchantNameCandidate should be the main brand identifier only, not a regional or domain variant when the base brand is obvious.",
    "Strip country or market qualifiers like India, UK, US, UAE, EU, .in, .com, .co.uk, or similar site/domain suffixes from merchantNameCandidate unless the qualifier is essential to the brand itself.",
    "Examples: Amazon.in -> Amazon, Amazon India -> Amazon, Uber India -> Uber, Netflix.com -> Netflix.",
    "merchantDescriptorRaw should preserve the raw descriptor fragment if one is visible.",
    "channelHint should capture payment channel when inferable: card, wallet, upi, bank_transfer, or other.",
    "categoryCandidates should contain up to four candidate slugs in priority order such as gaming, software, digital_goods, food, transport, subscriptions, bills, shopping, salary, utilities, travel, entertainment.",
    "If the document explicitly mentions available balance or available credit limit, extract it as availableBalanceMinor or availableCreditLimitMinor in minor units.",
    "If the balance or limit is tied to a card/account ending, populate balanceInstrumentLast4Hint.",
    "Use balanceAsOfDate when the document clearly gives the date the balance/limit was stated for.",
    "If the document clearly identifies a backing bank account or wallet separately from the transacting card or UPI instrument, populate backingAccountLast4Hint and backingAccountNameHint.",
    "accountRelationshipHint should be direct_account when the balance belongs to the main account itself, linked_card_account when a card or UPI instrument is explicitly tied to a backing account, or unknown otherwise.",
    "balanceEvidenceStrength should be explicit for direct clear balance statements, strong for clear but slightly indirect balance evidence, and weak when the balance linkage is incomplete.",
    "Available balance on a bank account or wallet is cash-balance evidence. Available credit limit on a credit card is headroom evidence only.",
    "Always return monetary amounts in minor units. Example: Rs 5943.4 -> 594340. INR 47,045.25 -> 4704525.",
    "When the text says an account was debited via a debit card, separate the account last4 from the card last4. Example: 'account 30XX8899 ... via Debit Card XX5754 ... available balance Rs 5943.4' means backingAccountLast4Hint=8899, instrumentLast4Hint=5754, accountRelationshipHint=linked_card_account, availableBalanceMinor=594340.",
    "",
    ...routeSpecificInstructions[input.routeLabel],
    "",
    buildBaseContext(input.normalizedDocument),
    buildMemoryContext(input.memorySummary),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeSignalExtractor),
    schema: structuredExtractionResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeSignalExtractor,
    promptVersion: aiPromptVersions.financeSignalExtractor,
    coerce: (raw) => coerceStructuredExtractionResult(raw, input),
    fallback: () => ({
      signals: [
        {
          signalType: "generic_finance_signal" as const,
          candidateEventType: null,
          amountMinor: null,
          currency: null,
          eventDate: input.normalizedDocument.messageTimestamp.slice(0, 10),
          issuerNameHint: null,
          instrumentLast4Hint: null,
          availableBalanceMinor: null,
          availableCreditLimitMinor: null,
          balanceAsOfDate: null,
          balanceInstrumentLast4Hint: null,
          backingAccountLast4Hint: null,
          backingAccountNameHint: null,
          accountRelationshipHint: null,
          balanceEvidenceStrength: null,
          merchantDescriptorRaw: null,
          merchantNameCandidate: null,
          processorNameCandidate: null,
          channelHint: null,
          merchantRaw: input.normalizedDocument.sender ?? null,
          merchantHint: input.normalizedDocument.sender ?? null,
          paymentInstrumentHint: null,
          categoryHint: null,
          categoryCandidates: [],
          isRecurringHint: false,
          isEmiHint: false,
          confidence: 0.2,
          roleConfidence: 0.1,
          evidenceSnippets: getFallbackEvidence(input.normalizedDocument),
          explanation:
            "Model output could not be validated. Falling back to a generic finance signal.",
        },
      ],
      extractionSummary:
        "Recovered via generic fallback after schema-mismatch model output.",
    }),
  })

  const extraction = result.object

  if (result.recovery.mode === "strict") {
    logger.info("Extracted structured finance signals", {
      routeLabel: input.routeLabel,
      signalCount: extraction.signals.length,
      ...result.metadata,
    })
  } else {
    logger.warn("Recovered structured finance signals from degraded model response", {
      routeLabel: input.routeLabel,
      signalCount: extraction.signals.length,
      recoveryMode: result.recovery.mode,
      errorMessage: result.recovery.errorMessage,
      finishReason: result.recovery.finishReason,
      rawResponseExcerpt: result.recovery.rawResponseExcerpt,
      ...result.metadata,
    })
  }

  return {
    extraction,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}

export async function extractMerchantHint(input: {
  normalizedDocument: NormalizedFinanceDocumentInput
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You extract only the merchant identity for a finance email.",
    "Use only the subject and normalized email body below.",
    "Return the charged merchant, not the sender, bank, issuer, card provider, or inbox alias.",
    "If a processor is explicitly present, separate processorNameCandidate from merchantNameCandidate.",
    "merchantNameCandidate should be the main brand the user paid.",
    "merchantDescriptorRaw should preserve the most specific raw merchant/descriptor fragment visible in the text.",
    "merchantHint and merchantRaw should follow the same merchant identity, not the sender identity.",
    "If the merchant is unclear, return null merchant fields rather than guessing.",
    "Do not use the sender display name or sender email as merchant evidence unless the body itself clearly makes the sender the merchant.",
    "",
    `Subject: ${input.normalizedDocument.subject ?? "unknown"}`,
    "",
    "Normalized email body:",
    truncate(input.normalizedDocument.bodyText, 6000),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeMerchantHintExtractor),
    schema: merchantHintExtractionResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeMerchantHintExtractor,
    promptVersion: aiPromptVersions.financeMerchantHintExtractor,
    coerce: (raw) =>
      coerceMerchantHintExtractionResult({
        raw,
        normalizedDocument: input.normalizedDocument,
      }),
    fallback: () => ({
      merchantDescriptorRaw: null,
      merchantNameCandidate: null,
      merchantHint: null,
      merchantRaw: null,
      processorNameCandidate: null,
      confidence: 0.1,
      evidenceSnippets: getFallbackEvidence(input.normalizedDocument),
      explanation: "Merchant hint extraction could not identify a merchant confidently.",
    }),
  })

  if (result.recovery.mode === "strict") {
    logger.info("Extracted merchant hint", {
      merchantNameCandidate: result.object.merchantNameCandidate,
      processorNameCandidate: result.object.processorNameCandidate,
      ...result.metadata,
    })
  } else {
    logger.warn("Recovered merchant hint from degraded model response", {
      merchantNameCandidate: result.object.merchantNameCandidate,
      processorNameCandidate: result.object.processorNameCandidate,
      recoveryMode: result.recovery.mode,
      ...result.metadata,
    })
  }

  return {
    merchantHint: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
