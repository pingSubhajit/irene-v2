import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels } from "./config"

const logger = createLogger("ai.finance-relevance")

const borderlineResultSchema = z.object({
  isFinanceRelevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.enum([
    "transactional_finance",
    "likely_finance",
    "unclear_but_relevant",
    "promotional_non_finance",
    "shipping_non_finance",
    "other_non_finance",
  ]),
})

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
  stage: "heuristic" | "model"
  score: number
  reasons: string[]
  modelResult?: z.infer<typeof borderlineResultSchema>
}

const financeDomainHints = [
  "bank",
  "card",
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
  "utility",
  "electricity",
  "insurance",
  "amazonpay",
]

const financeLexemePattern =
  /\b(receipt|invoice|payment|paid|statement|transaction|credited|debited|refund|refunded|emi|subscription|bill|salary|payroll|installment|loan|card|bank|upi|utr)\b/gi
const financeAmountPattern =
  /(?:₹|rs\.?|inr|\$|usd)\s?\d|(?:txn|transaction|ref)\s*[:#-]?\s*[a-z0-9]{4,}|\b(?:upi|utr|vpa)\b|\b(?:ending|xx|xxxx)\s*\d{4}\b/i
const attachmentPattern = /\.(pdf|csv|xls|xlsx)$/i
const newsletterPattern =
  /\b(unsubscribe|newsletter|digest|sale|offer|discount|coupon|deal|promo|marketing)\b/i
const shippingPattern =
  /\b(shipped|out for delivery|arriving|dispatched|delivered|tracking)\b/i

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function buildHeuristicDecision(input: FinanceRelevanceInput) {
  const sender = input.sender?.toLowerCase() ?? ""
  const subject = input.subject ?? ""
  const snippet = input.snippet ?? ""
  const combinedText = `${subject}\n${snippet}`
  const loweredCombined = combinedText.toLowerCase()

  let score = 0
  const reasons: string[] = []

  if (financeDomainHints.some((hint) => sender.includes(hint))) {
    score += 4
    reasons.push("known_finance_sender")
  }

  const financeMatches = [...combinedText.matchAll(financeLexemePattern)].length
  if (financeMatches > 0) {
    score += Math.min(2, financeMatches * 2)
    reasons.push("finance_lexeme")
  }

  if (financeAmountPattern.test(combinedText)) {
    score += 2
    reasons.push("amount_or_reference_pattern")
  }

  if (input.attachmentNames.some((name) => attachmentPattern.test(name))) {
    score += 1
    reasons.push("invoice_attachment_hint")
  }

  if (newsletterPattern.test(loweredCombined)) {
    score -= 4
    reasons.push("newsletter_or_promo")
  }

  if (shippingPattern.test(loweredCombined)) {
    score -= 2
    reasons.push("shipping_only")
  }

  return {
    score,
    reasons,
  }
}

export async function classifyFinanceRelevance(
  input: FinanceRelevanceInput,
): Promise<FinanceRelevanceDecision> {
  const heuristic = buildHeuristicDecision(input)

  if (heuristic.score >= 4) {
    return {
      decision: "accept",
      stage: "heuristic",
      score: heuristic.score,
      reasons: heuristic.reasons,
    }
  }

  if (heuristic.score <= 0) {
    return {
      decision: "skip",
      stage: "heuristic",
      score: heuristic.score,
      reasons: heuristic.reasons,
    }
  }

  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You classify whether a Gmail message is finance-related for a personal finance ingestion pipeline.",
    "Use only the provided metadata. Do not infer facts outside the metadata.",
    "Finance-related means transactional money activity or money obligations: receipts, invoices, bank/card alerts, payroll, bills, subscriptions, EMIs, refunds, statements, payment confirmations.",
    "Non-finance includes newsletters, promotions, shipping updates without payment details, and generic marketing.",
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
    reasonCode: object.reasonCode,
  })

  return {
    decision: object.isFinanceRelevant ? "accept" : "skip",
    stage: "model",
    score: heuristic.score,
    reasons: heuristic.reasons,
    modelResult: object,
  }
}

export async function checkAiGatewayHealth() {
  const gateway = getGatewayProvider()
  const metadata = await gateway.getAvailableModels()

  return {
    ok: metadata.models.some(
      (entry) => entry.id === aiModels.financeRelevanceClassifier,
    ),
    model: aiModels.financeRelevanceClassifier,
  }
}
