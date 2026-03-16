import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels } from "./config"

const logger = createLogger("ai.finance-relevance")

const financeRelevanceClassificationSchema = z.enum([
  "transactional_finance",
  "obligation_finance",
  "marketing_finance",
  "non_finance",
])

const borderlineResultSchema = z.object({
  classification: financeRelevanceClassificationSchema,
  confidence: z.number().min(0).max(1),
  reasonCode: z.enum([
    "transaction_signal",
    "obligation_signal",
    "marketing_promo",
    "shipping_update",
    "insufficient_finance_signal",
  ]),
})

export type FinanceRelevanceClassification = z.infer<
  typeof financeRelevanceClassificationSchema
>

export type FinanceRelevanceInput = {
  sender: string | null
  subject: string | null
  snippet: string | null
  labelIds: string[]
  timestamp: string | null
  attachmentNames: string[]
}

export type FinanceRelevanceDecision = {
  decision: "accept" | "skip"
  classification: FinanceRelevanceClassification
  stage: "heuristic" | "model"
  score: number
  reasons: string[]
  modelResult?: z.infer<typeof borderlineResultSchema>
}

const financeDomainHints = [
  "bank",
  "credit",
  "debit",
  "payments",
  "paytm",
  "phonepe",
  "gpay",
  "googlepay",
  "paypal",
  "stripe",
  "hdfc",
  "icici",
  "sbi",
  "axis",
  "kotak",
  "amex",
  "visa",
  "mastercard",
  "payroll",
  "salary",
  "insurance",
  "amazonpay",
]

const financeSenderPattern =
  /\b(bank|payments?|billing|statement|instaalert|alerts?|transaction|noreply@.*(bank|payments?))\b/i
const commerceSenderPattern =
  /\b(subscriptions?|orders?|receipts?|store|shop|merchant|billing|support)\b/i
const transactionalPattern =
  /\b(transaction(?: alert| notification)?|debited|credited|paid|payment successful|payment received|receipt|invoice|refund(?:ed)?|salary credited|bill payment|autopay|auto[- ]?debit|purchase confirmation|merchant ref(?:erence)?|transaction id|order id)\b|order\b[^\n]{0,80}\b(placed|confirmed|successful|successfully)\b/i
const obligationPattern =
  /\b(emi|installment|bill due|payment due|due date|statement(?: generated| available)?|standing instruction|mandate|subscription (?:renewal|renewed|expiring|expires)|renewal due)\b/i
const commerceLifecyclePattern =
  /\b(subscription summary|subs(?:cription)? start date|subs(?:cription)? end date|start date|end date|total:\s*\d|price:\s*(?:₹|rs\.?|inr|\$)|issues?\b|download)\b/i
const financeAmountPattern =
  /(?:₹|rs\.?|inr|\$|usd)\s?\d|(?:txn|transaction|ref|utr)\s*[:#-]?\s*[a-z0-9]{4,}|\b(?:upi|utr|vpa)\b|\b(?:ending|xx|xxxx)\s*\d{4}\b/i
const attachmentPattern = /\.(pdf|csv|xls|xlsx)$/i
const marketingPattern =
  /\b(need funds|pre-?approved|save up to|offer|discount|cashback|upgrade|exclusive|reward|deal|sale|promo|marketing|best card|passport to global|big savings|tap and pay|loan)\b/i
const newsletterPattern =
  /\b(unsubscribe|newsletter|digest|roundup|summary|webinar)\b/i
const shippingPattern =
  /\b(shipped|out for delivery|arriving|dispatched|delivered|tracking)\b/i
const senderCampaignPattern =
  /\b(marketing|offers|deals|promo|newsletters?)\b/i

const negativeLabels = new Set([
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
  "SPAM",
])

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function normalizeText(input: FinanceRelevanceInput) {
  const sender = input.sender ?? ""
  const subject = input.subject ?? ""
  const snippet = input.snippet ?? ""
  const combined = `${subject}\n${snippet}`

  return {
    sender,
    subject,
    snippet,
    combined,
    loweredCombined: combined.toLowerCase(),
    labelIds: input.labelIds,
  }
}

function buildHeuristicDecision(input: FinanceRelevanceInput): FinanceRelevanceDecision | null {
  const normalized = normalizeText(input)
  const reasons: string[] = []
  let score = 0

  const hasFinanceSender =
    financeDomainHints.some((hint) => normalized.sender.toLowerCase().includes(hint)) ||
    financeSenderPattern.test(normalized.sender)
  const hasCommerceSender = commerceSenderPattern.test(normalized.sender)
  const hasTransactionalSignal = transactionalPattern.test(normalized.combined)
  const hasObligationSignal = obligationPattern.test(normalized.combined)
  const hasCommerceLifecycleSignal = commerceLifecyclePattern.test(normalized.combined)
  const hasAmountOrReference = financeAmountPattern.test(normalized.combined)
  const hasAttachmentHint = input.attachmentNames.some((name) => attachmentPattern.test(name))
  const hasMarketingSignal =
    marketingPattern.test(normalized.loweredCombined) ||
    newsletterPattern.test(normalized.loweredCombined) ||
    senderCampaignPattern.test(normalized.sender.toLowerCase())
  const hasShippingSignal = shippingPattern.test(normalized.loweredCombined)
  const hasNegativeLabel = normalized.labelIds.some((label) => negativeLabels.has(label))

  if (hasFinanceSender) {
    score += 1
    reasons.push("finance_sender")
  }

  if (hasCommerceSender) {
    score += 1
    reasons.push("commerce_sender")
  }

  if (hasTransactionalSignal) {
    score += 4
    reasons.push("transaction_signal")
  }

  if (hasObligationSignal) {
    score += 4
    reasons.push("obligation_signal")
  }

  if (hasCommerceLifecycleSignal) {
    score += 2
    reasons.push("commerce_lifecycle_signal")
  }

  if (hasAmountOrReference) {
    score += 3
    reasons.push("amount_or_reference")
  }

  if (hasAttachmentHint) {
    score += 1
    reasons.push("attachment_hint")
  }

  if (hasNegativeLabel) {
    score -= 3
    reasons.push("negative_gmail_label")
  }

  if (hasMarketingSignal) {
    score -= 4
    reasons.push("marketing_signal")
  }

  if (hasShippingSignal) {
    score -= 3
    reasons.push("shipping_signal")
  }

  const hasStrongPromoOnlySignal =
    (hasMarketingSignal || hasNegativeLabel) &&
    !hasTransactionalSignal &&
    !hasObligationSignal &&
    !hasCommerceLifecycleSignal &&
    !hasAmountOrReference &&
    !hasAttachmentHint &&
    !hasCommerceSender

  if (hasStrongPromoOnlySignal) {
    return {
      decision: "skip",
      classification: hasFinanceSender ? "marketing_finance" : "non_finance",
      stage: "heuristic",
      score,
      reasons,
    }
  }

  if (
    hasTransactionalSignal &&
    (hasAmountOrReference || hasAttachmentHint || hasFinanceSender || hasCommerceSender)
  ) {
    return {
      decision: "accept",
      classification: "transactional_finance",
      stage: "heuristic",
      score,
      reasons,
    }
  }

  if (
    (hasObligationSignal || hasCommerceLifecycleSignal) &&
    (hasAmountOrReference ||
      hasFinanceSender ||
      hasCommerceSender ||
      hasAttachmentHint)
  ) {
    return {
      decision: "accept",
      classification:
        hasTransactionalSignal && !hasObligationSignal
          ? "transactional_finance"
          : "obligation_finance",
      stage: "heuristic",
      score,
      reasons,
    }
  }

  if (
    hasShippingSignal &&
    !hasTransactionalSignal &&
    !hasObligationSignal &&
    !hasCommerceLifecycleSignal &&
    !hasAmountOrReference &&
    !hasAttachmentHint
  ) {
    return {
      decision: "skip",
      classification: "non_finance",
      stage: "heuristic",
      score,
      reasons,
    }
  }

  if (
    !hasFinanceSender &&
    !hasCommerceSender &&
    !hasTransactionalSignal &&
    !hasObligationSignal &&
    !hasCommerceLifecycleSignal &&
    !hasAmountOrReference &&
    !hasAttachmentHint
  ) {
    return {
      decision: "skip",
      classification: "non_finance",
      stage: "heuristic",
      score,
      reasons,
    }
  }

  return null
}

export async function classifyFinanceRelevance(
  input: FinanceRelevanceInput,
): Promise<FinanceRelevanceDecision> {
  const heuristicDecision = buildHeuristicDecision(input)

  if (heuristicDecision) {
    return heuristicDecision
  }

  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You classify Gmail message metadata for a personal finance ingestion pipeline.",
    "Use only the provided metadata and classify strictly.",
    "transactional_finance: a completed money movement or purchase proof such as a debit, credit, receipt, invoice, refund, payment confirmation, order confirmation.",
    "obligation_finance: upcoming or ongoing money obligation such as EMI, subscription renewal, bill due, statement, standing instruction, mandate.",
    "marketing_finance: finance-branded marketing, offers, discounts, pre-approved loans, cashback promotions, card campaigns.",
    "non_finance: everything else including shipping-only and generic newsletters.",
    "If uncertain, prefer marketing_finance or non_finance over accepting.",
    "",
    `Sender: ${input.sender ?? "unknown"}`,
    `Subject: ${input.subject ?? "unknown"}`,
    `Snippet: ${input.snippet ?? "unknown"}`,
    `Labels: ${input.labelIds.join(", ") || "none"}`,
    `Timestamp: ${input.timestamp ?? "unknown"}`,
    `Attachment names: ${input.attachmentNames.join(", ") || "none"}`,
  ].join("\n")

  const { object } = await generateObject({
    model: gateway(aiModels.financeRelevanceClassifier),
    schema: borderlineResultSchema,
    prompt,
  })

  logger.info("Borderline finance relevance classified", {
    latencyMs: Date.now() - startedAt,
    model: aiModels.financeRelevanceClassifier,
    confidence: object.confidence,
    classification: object.classification,
    reasonCode: object.reasonCode,
  })

  return {
    decision:
      object.classification === "transactional_finance" ||
      object.classification === "obligation_finance"
        ? "accept"
        : "skip",
    classification: object.classification,
    stage: "model",
    score: 0,
    reasons: [object.reasonCode],
    modelResult: object,
  }
}

export async function checkAiGatewayHealth() {
  const gateway = getGatewayProvider()
  const metadata = await gateway.getAvailableModels()
  const availableIds = new Set(metadata.models.map((entry) => entry.id))
  const requiredModels = Object.values(aiModels)

  return {
    ok: requiredModels.every((model) => availableIds.has(model)),
    models: requiredModels,
  }
}

export { aiModels, aiPromptVersions } from "./config"
export * from "./extraction"
