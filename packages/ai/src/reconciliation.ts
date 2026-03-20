import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"

const logger = createLogger("ai.reconciliation")
const providerName = "ai-gateway"

export const reconciliationDecisionSchema = z.enum([
  "merge_with_existing_event",
  "create_new_event",
  "needs_review",
])

export const reconciliationCanonicalEventTypeSchema = z.enum([
  "purchase",
  "subscription_charge",
  "emi_payment",
  "bill_payment",
  "income",
  "refund",
  "transfer",
])

export const reconciliationDecisionResultSchema = z.object({
  decision: reconciliationDecisionSchema,
  confidence: z.number().min(0).max(1),
  targetFinancialEventId: z.string().uuid().nullable().optional(),
  canonicalEventType: reconciliationCanonicalEventTypeSchema.nullable().optional(),
  reason: z.string().max(400),
  supportingCandidateIds: z.array(z.string().uuid()).max(5).default([]),
  contradictions: z.array(z.string().max(200)).max(5).default([]),
  warnings: z.array(z.string().max(200)).max(5).default([]),
})

export type ReconciliationDecisionResult = z.infer<typeof reconciliationDecisionResultSchema>

export type ReconciliationIncomingSignal = {
  rawDocumentId: string
  signalId: string
  signalType: string
  candidateEventType: string | null
  amountMinor: number
  currency: string
  occurredAtIso: string
  confidence: number
  merchantName: string | null
  processorName: string | null
  issuerName: string | null
  descriptor: string | null
  sender: string | null
  subject: string | null
  snippet: string | null
  bodyTextExcerpt: string | null
  evidenceSnippets: string[]
  isBankSettlementSource: boolean
}

export type ReconciliationCandidateEvent = {
  financialEventId: string
  eventType: string
  direction: string
  amountMinor: number
  currency: string
  eventOccurredAtIso: string
  createdAtIso: string
  merchantName: string | null
  processorName: string | null
  paymentInstrumentName: string | null
  description: string | null
  sourceCount: number
  isBankSettlementSource: boolean
  sources: Array<{
    rawDocumentId: string | null
    subject: string | null
    sender: string | null
    timestampIso: string | null
    signalType: string | null
    candidateEventType: string | null
    descriptor: string | null
    merchantHint: string | null
    processorHint: string | null
    evidenceSnippets: string[]
    linkReason: string
  }>
}

export type ReconciliationAiInput = {
  incoming: ReconciliationIncomingSignal
  candidates: ReconciliationCandidateEvent[]
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

export async function resolveReconciliationWithAi(input: ReconciliationAiInput) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You decide whether an incoming finance signal should merge into an existing canonical ledger event, create a new event, or go to review.",
    "You are only judging same-underlying-transaction identity, not merchant or instrument canonicalization.",
    "Prefer merge_with_existing_event only when the incoming signal and one candidate clearly refer to the same underlying transaction.",
    "Use needs_review when evidence is materially conflicting or more than one candidate is similarly plausible.",
    "If no candidate is a clear match, choose create_new_event.",
    "Cross-type bridging is allowed only within the outflow family: purchase, subscription_charge, emi_payment, bill_payment.",
    "Do not merge income, refund, or transfer across different event types.",
    "Cross-currency matching is allowed when amounts are plausibly the same charge after FX conversion.",
    "Bank/card settlement evidence is stronger than merchant marketing or lifecycle copy for canonical amount/currency.",
    "Sender bank domains and issuer hints indicate settlement-side evidence, not merchant identity.",
    "If you choose merge_with_existing_event, targetFinancialEventId must be one of the provided candidate ids.",
    "If you choose create_new_event, targetFinancialEventId must be null.",
    "Set canonicalEventType when the merged canonical event should use a more specific compatible type; otherwise keep it null.",
    "",
    "Incoming signal:",
    JSON.stringify(input.incoming, null, 2),
    "",
    "Candidate canonical events:",
    JSON.stringify(input.candidates, null, 2),
  ].join("\n")

  const result = await generateObject({
    model: gateway(aiModels.financeReconciliationResolver),
    schema: reconciliationDecisionResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeReconciliationResolver,
    promptVersion: aiPromptVersions.financeReconciliationResolver,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies ModelRunMetadata

  logger.info("Resolved reconciliation decision", {
    decision: result.object.decision,
    confidence: result.object.confidence,
    targetFinancialEventId: result.object.targetFinancialEventId ?? null,
    candidateCount: input.candidates.length,
    ...metadata,
  })

  return {
    decision: result.object,
    metadata,
  }
}
