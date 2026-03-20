import { NoObjectGeneratedError, generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"

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

export type DocumentRouteLabel = z.infer<typeof documentRouteLabelSchema>
export type DocumentRouteResult = z.infer<typeof documentRouteResultSchema>
export type StructuredExtractionSignal = z.infer<typeof extractedSignalSchema>
export type StructuredExtractionResult = z.infer<typeof structuredExtractionResultSchema>

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

type ModelRunMetadata = {
  provider: string
  modelName: string
  promptVersion: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  requestId: string | null
}

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

function getUsageFromNoObjectError(error: NoObjectGeneratedError) {
  return {
    inputTokens: error.usage?.inputTokens ?? null,
    outputTokens: error.usage?.outputTokens ?? null,
  }
}

function getRequestIdFromNoObjectError(error: NoObjectGeneratedError) {
  return error.response?.id ?? null
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

function parseLooseJson(text: string) {
  const candidates = [text.trim()]
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1).trim())
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      continue
    }
  }

  return null
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
    const amountMinorValue = normalizeNumber(record.amountMinor)

    return [
      {
        signalType,
        candidateEventType,
        amountMinor: Number.isInteger(amountMinorValue) ? amountMinorValue : null,
        currency: normalizeCurrency(record.currency),
        eventDate: normalizeEventDate(record.eventDate),
        issuerNameHint: normalizeString(record.issuerNameHint, 160),
        instrumentLast4Hint: normalizeString(record.instrumentLast4Hint, 16),
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

function buildMetadataFromNoObjectError(error: NoObjectGeneratedError, startedAt: number) {
  return {
    provider: providerName,
    modelName: aiModels.financeSignalExtractor,
    promptVersion: aiPromptVersions.financeSignalExtractor,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestIdFromNoObjectError(error),
    ...getUsageFromNoObjectError(error),
  } satisfies ModelRunMetadata
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

export async function routeDocumentForExtraction(input: NormalizedFinanceDocumentInput) {
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
}) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()
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
    "merchantDescriptorRaw should preserve the raw descriptor fragment if one is visible.",
    "channelHint should capture payment channel when inferable: card, wallet, upi, bank_transfer, or other.",
    "categoryCandidates should contain up to four candidate slugs in priority order such as gaming, software, digital_goods, food, transport, subscriptions, bills, shopping, salary, utilities, travel, entertainment.",
    "",
    ...routeSpecificInstructions[input.routeLabel],
    "",
    buildBaseContext(input.normalizedDocument),
  ].join("\n")

  try {
    const result = await generateObject({
      model: gateway(aiModels.financeSignalExtractor),
      schema: structuredExtractionResultSchema,
      prompt,
    })

    const metadata = {
      provider: providerName,
      modelName: aiModels.financeSignalExtractor,
      promptVersion: aiPromptVersions.financeSignalExtractor,
      latencyMs: Date.now() - startedAt,
      requestId: getRequestId(result),
      ...getUsage(result),
    } satisfies ModelRunMetadata

    logger.info("Extracted structured finance signals", {
      routeLabel: input.routeLabel,
      signalCount: result.object.signals.length,
      ...metadata,
    })

    return {
      extraction: result.object,
      metadata,
    }
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      const metadata = buildMetadataFromNoObjectError(error, startedAt)
      const parsed = parseLooseJson(error.text)

      if (parsed) {
        const extraction = coerceStructuredExtractionResult(parsed, input)

        logger.warn("Recovered structured finance signals from schema-mismatch response", {
          routeLabel: input.routeLabel,
          signalCount: extraction.signals.length,
          errorMessage: error.message,
          finishReason: error.finishReason,
          rawResponseExcerpt: error.text.slice(0, 800),
          ...metadata,
        })

        return {
          extraction,
          metadata,
        }
      }

      logger.warn("Falling back to empty extraction after unrecoverable schema-mismatch response", {
        routeLabel: input.routeLabel,
        errorMessage: error.message,
        finishReason: error.finishReason,
        rawResponseExcerpt: error.text.slice(0, 800),
        ...metadata,
      })

      return {
        extraction: {
          signals: [],
          extractionSummary: "Failed to recover schema-mismatch model output.",
        },
        metadata,
      }
    }

    throw error
  }
}
