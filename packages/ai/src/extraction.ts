import { generateObject } from "ai"
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
  merchantRaw: z.string().max(240).nullable().optional(),
  merchantHint: z.string().max(240).nullable().optional(),
  paymentInstrumentHint: z.string().max(120).nullable().optional(),
  categoryHint: z.string().max(120).nullable().optional(),
  isRecurringHint: z.boolean().default(false),
  isEmiHint: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
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
    "Prefer one high-quality signal over multiple speculative signals.",
    "If the document is finance-relevant but fields are incomplete, still return a typed signal with missing fields set to null when justified.",
    "When the document is too ambiguous, return one generic_finance_signal.",
    "Promotional or offer emails must not produce purchase_signal, emi_signal, bill_signal, subscription_signal, refund_signal, transfer_signal, or income_signal unless the email clearly proves a completed money movement, an active obligation, or a due/reminder for an existing obligation.",
    "Examples that should become generic_finance_signal: EMI offers, card upgrade offers, cashback campaigns, 'save up to' promotions, shopping deals with financing language, and pre-approved loan offers.",
    "If the email advertises financing terms like 'EMI starting at' without confirming enrollment or payment, return generic_finance_signal.",
    "",
    ...routeSpecificInstructions[input.routeLabel],
    "",
    buildBaseContext(input.normalizedDocument),
  ].join("\n")

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
}
