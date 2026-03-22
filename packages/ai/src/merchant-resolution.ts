import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"
import {
  CATEGORY_COLOR_TOKEN_SCHEMA,
  CATEGORY_COLOR_TOKEN_VALUES,
  CATEGORY_ICON_NAME_SCHEMA,
  CATEGORY_ICON_NAME_VALUES,
  SYSTEM_CATEGORY_PRESENTATION,
} from "@workspace/config"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"
import { generateStructuredObject } from "./object-generation"

const logger = createLogger("ai.merchant-resolution")
const providerName = "ai-gateway"

export const merchantResolutionDecisionSchema = z.enum([
  "link_to_existing_merchant",
  "create_new_merchant",
  "update_existing_merchant",
  "merge_merchants",
  "link_to_existing_processor",
  "create_new_processor",
  "merge_processors",
  "needs_review",
  "ignore",
])

export const categorySlugSchema = z.enum([
  "income",
  "salary",
  "shopping",
  "food",
  "transport",
  "subscriptions",
  "bills",
  "debt",
  "transfers",
  "refunds",
  "gaming",
  "software",
  "digital_goods",
  "entertainment",
  "travel",
  "utilities",
  "uncategorized",
])

export const merchantResolutionResultSchema = z.object({
  decision: merchantResolutionDecisionSchema,
  confidence: z.number().min(0).max(1),
  canonicalMerchantName: z.string().max(160).nullable().optional(),
  canonicalProcessorName: z.string().max(160).nullable().optional(),
  targetMerchantId: z.string().uuid().nullable().optional(),
  targetProcessorId: z.string().uuid().nullable().optional(),
  displayMerchantName: z.string().max(200).nullable().optional(),
  reason: z.string().max(320),
  ignoredHints: z.array(z.string().max(160)).max(8).default([]),
  supportingObservationIds: z.array(z.string().uuid()).min(1).max(50),
  categorySlug: categorySlugSchema.nullable().optional(),
  categoryConfidence: z.number().min(0).max(1).nullable().optional(),
  categoryReason: z.string().max(240).nullable().optional(),
})

export const categoryResolutionResultSchema = z.object({
  decision: z.enum(["link_existing_category", "create_custom_category"]),
  existingCategorySlug: z.string().max(120).nullable().optional(),
  customCategoryName: z.string().max(120).nullable().optional(),
  iconName: CATEGORY_ICON_NAME_SCHEMA.nullable().optional(),
  colorToken: CATEGORY_COLOR_TOKEN_SCHEMA.nullable().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
})

export type MerchantResolutionResult = z.infer<
  typeof merchantResolutionResultSchema
>
export type CategoryResolutionResult = z.infer<
  typeof categoryResolutionResultSchema
>
export type CategoryResolutionCategorySummary = {
  slug: string
  name: string
  kind: string
  isSystem: boolean
  iconName: string | null
  colorToken: string | null
}

export type MerchantObservationSummary = {
  id: string
  observationSourceKind: string
  issuerHint: string | null
  merchantDescriptorRaw: string | null
  merchantNameHint: string | null
  processorNameHint: string | null
  senderAliasHint: string | null
  channelHint: string | null
  confidence: number
  evidenceSummary: string[]
  sender: string | null
  subject: string | null
  snippet: string | null
  bodyTextExcerpt: string | null
}

export type CandidateMerchantSummary = {
  id: string
  displayName: string
  normalizedName: string
  aliases: string[]
  linkedEventCount: number
}

export type CandidateProcessorSummary = {
  id: string
  displayName: string
  aliases: string[]
}

export type MerchantResolutionInput = {
  userId: string
  sourceReliability: {
    bankOriginCount: number
    merchantOriginCount: number
    processorOriginCount: number
    statementOriginCount: number
  }
  observations: MerchantObservationSummary[]
  candidateMerchants: CandidateMerchantSummary[]
  candidateProcessors: CandidateProcessorSummary[]
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

function normalizeStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number
) {
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
        entry
      )
    )

  return ids.length > 0 ? ids.slice(0, 50) : fallback
}

function coerceMerchantResolutionResult(
  raw: unknown,
  fallbackObservationIds: string[]
): MerchantResolutionResult | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const decision = merchantResolutionDecisionSchema.safeParse(record.decision)
  const categorySlug = categorySlugSchema.safeParse(record.categorySlug)

  return {
    decision: decision.success ? decision.data : "needs_review",
    confidence: clampProbability(record.confidence),
    canonicalMerchantName: normalizeString(record.canonicalMerchantName, 160),
    canonicalProcessorName: normalizeString(record.canonicalProcessorName, 160),
    targetMerchantId:
      typeof record.targetMerchantId === "string"
        ? record.targetMerchantId
        : null,
    targetProcessorId:
      typeof record.targetProcessorId === "string"
        ? record.targetProcessorId
        : null,
    displayMerchantName: normalizeString(record.displayMerchantName, 200),
    reason:
      normalizeString(record.reason, 320) ??
      "Recovered merchant resolution from schema-mismatch model output.",
    ignoredHints: normalizeStringArray(record.ignoredHints, 8, 160),
    supportingObservationIds: normalizeUuidArray(
      record.supportingObservationIds,
      fallbackObservationIds
    ),
    categorySlug: categorySlug.success ? categorySlug.data : null,
    categoryConfidence:
      record.categoryConfidence == null
        ? null
        : clampProbability(record.categoryConfidence),
    categoryReason: normalizeString(record.categoryReason, 240),
  }
}

export function coerceCategoryResolutionResult(
  raw: unknown
): CategoryResolutionResult | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const decision = normalizeString(record.decision, 64)
    ?.toLowerCase()
    .replace(/[\s-]+/g, "_")
  const confidence = clampProbability(record.confidence)
  const reason =
    normalizeString(record.reason, 240) ??
    "Recovered category resolution from schema-mismatch model output."

  if (decision === "create_custom_category") {
    const customCategoryName = normalizeString(record.customCategoryName, 120)
    const iconName = CATEGORY_ICON_NAME_SCHEMA.safeParse(record.iconName)
    const colorToken = CATEGORY_COLOR_TOKEN_SCHEMA.safeParse(record.colorToken)

    if (!customCategoryName || !iconName.success || !colorToken.success) {
      return null
    }

    return {
      decision: "create_custom_category",
      existingCategorySlug: null,
      customCategoryName,
      iconName: iconName.data,
      colorToken: colorToken.data,
      confidence,
      reason,
    }
  }

  const legacyCategorySlug = categorySlugSchema.safeParse(record.categorySlug)
  const existingCategorySlug =
    normalizeString(record.existingCategorySlug, 120) ??
    (legacyCategorySlug.success ? legacyCategorySlug.data : null)

  if (!existingCategorySlug) {
    return null
  }

  return {
    decision: "link_existing_category",
    existingCategorySlug,
    customCategoryName: null,
    iconName: null,
    colorToken: null,
    confidence,
    reason,
  }
}

export function buildCategoryResolutionPrompt(input: {
  merchantName: string | null
  processorName: string | null
  eventType: string
  description: string | null
  notes: string | null
  evidenceSnippets: string[]
  categories: CategoryResolutionCategorySummary[]
}) {
  const existingCategories = input.categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    kind: category.kind,
    isSystem: category.isSystem,
  }))

  const systemCategories = input.categories
    .filter((category) => category.isSystem)
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      kind: category.kind,
      presentation:
        category.slug in SYSTEM_CATEGORY_PRESENTATION
          ? SYSTEM_CATEGORY_PRESENTATION[
              category.slug as keyof typeof SYSTEM_CATEGORY_PRESENTATION
            ]
          : null,
    }))

  return [
    "You choose the best category for a canonical financial event.",
    "Prefer linking an existing category when it is a good semantic fit.",
    "Create a custom category only when no existing category fits cleanly.",
    "Do not infer category from issuer sender text alone.",
    "If you create a custom category, choose a short user-facing name, one generic iconName from the whitelist, and one colorToken from the whitelist.",
    "Never use brand or platform icons.",
    "When linking an existing category, set decision=link_existing_category and populate existingCategorySlug only.",
    "When creating a custom category, set decision=create_custom_category and populate customCategoryName, iconName, and colorToken.",
    "A custom category name should be concise, title-cased, and merchant-agnostic.",
    "Do not create duplicate custom categories when an existing slug already fits.",
    "",
    `Allowed iconName values: ${CATEGORY_ICON_NAME_VALUES.join(", ")}`,
    `Allowed colorToken values: ${CATEGORY_COLOR_TOKEN_VALUES.join(", ")}`,
    "",
    "Existing user categories:",
    JSON.stringify(existingCategories, null, 2),
    "",
    "System category presentation defaults:",
    JSON.stringify(systemCategories, null, 2),
    "",
    `Merchant: ${input.merchantName ?? "unknown"}`,
    `Processor: ${input.processorName ?? "unknown"}`,
    `Event type: ${input.eventType}`,
    `Description: ${input.description ?? "none"}`,
    `Notes: ${input.notes ?? "none"}`,
    `Evidence snippets: ${JSON.stringify(input.evidenceSnippets)}`,
  ].join("\n")
}

export async function resolveMerchantAndProcessorWithAi(
  input: MerchantResolutionInput
) {
  const gateway = getGatewayProvider()

  const prompt = [
    "You resolve canonical merchant and payment processor identity from structured transaction evidence.",
    "Separate issuer institution, payment processor, and merchant.",
    "Issuer sender/domain evidence is not merchant evidence.",
    "Processor prefixes like PAYPAL *, PAYU *, PYU *, RAZORPAY*, GOOGLE *, APPLE.COM/BILL, and AMAZON PAY are intermediary evidence, not final merchant truth.",
    "If the descriptor suggests both a processor and a merchant, prefer separate processor + merchant outputs.",
    "Use sender, subject, snippet, and normalized email body context to recover merchant meaning when parser hints are noisy.",
    "Ignore bank boilerplate, available balance text, available credit limit text, support instructions, footer links, promo text, and generic help CTAs when deciding the merchant.",
    "Canonical merchant names should use the core brand identifier only when the base brand is obvious.",
    "Strip country, market, and site/domain qualifiers from canonicalMerchantName and displayMerchantName when they are not essential to the brand: remove variants like India, UK, US, UAE, .in, .com, .co.uk, and similar suffixes.",
    "Examples: Amazon.in -> Amazon, Amazon India -> Amazon, Uber India -> Uber, Apple.com/Bill -> Apple.",
    "If evidence is insufficient, prefer needs_review or ignore over a wrong merchant.",
    "Also choose the best category slug for the user-visible event after merchant resolution.",
    "",
    `Source reliability summary: bank=${input.sourceReliability.bankOriginCount}, merchant=${input.sourceReliability.merchantOriginCount}, processor=${input.sourceReliability.processorOriginCount}, statement=${input.sourceReliability.statementOriginCount}`,
    "",
    "Observations:",
    JSON.stringify(input.observations, null, 2),
    "",
    "Existing candidate merchants:",
    JSON.stringify(input.candidateMerchants, null, 2),
    "",
    "Existing candidate processors:",
    JSON.stringify(input.candidateProcessors, null, 2),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeMerchantResolver),
    schema: merchantResolutionResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeMerchantResolver,
    promptVersion: aiPromptVersions.financeMerchantResolver,
    coerce: (raw) =>
      coerceMerchantResolutionResult(
        raw,
        input.observations.map((obs) => obs.id)
      ),
    fallback: () => ({
      decision: "needs_review" as const,
      confidence: 0.35,
      canonicalMerchantName: null,
      canonicalProcessorName: null,
      targetMerchantId: null,
      targetProcessorId: null,
      displayMerchantName: null,
      reason:
        "Model output could not be validated. Manual merchant review required.",
      ignoredHints: [],
      supportingObservationIds: input.observations.map(
        (observation) => observation.id
      ),
      categorySlug: null,
      categoryConfidence: null,
      categoryReason: null,
    }),
  })

  if (result.recovery.mode === "strict") {
    logger.info("Resolved merchant cluster", {
      decision: result.object.decision,
      confidence: result.object.confidence,
      ...result.metadata,
    })
  } else {
    logger.warn("Recovered merchant resolution from degraded model response", {
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

export async function resolveCategoryWithAi(input: {
  merchantName: string | null
  processorName: string | null
  eventType: string
  description: string | null
  notes: string | null
  evidenceSnippets: string[]
  categories: CategoryResolutionCategorySummary[]
}) {
  const gateway = getGatewayProvider()
  const prompt = buildCategoryResolutionPrompt(input)

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeCategoryResolver),
    schema: categoryResolutionResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeCategoryResolver,
    promptVersion: aiPromptVersions.financeCategoryResolver,
    coerce: coerceCategoryResolutionResult,
    fallback: () => ({
      decision: "link_existing_category" as const,
      existingCategorySlug: "uncategorized",
      customCategoryName: null,
      iconName: null,
      colorToken: null,
      confidence: 0.2,
      reason:
        "Model output could not be validated. Falling back to uncategorized.",
    }),
  })

  if (result.recovery.mode === "strict") {
    logger.info("Resolved merchant category", {
      decision: result.object.decision,
      existingCategorySlug: result.object.existingCategorySlug,
      customCategoryName: result.object.customCategoryName,
      confidence: result.object.confidence,
      ...result.metadata,
    })
  } else {
    logger.warn("Recovered category resolution from degraded model response", {
      decision: result.object.decision,
      existingCategorySlug: result.object.existingCategorySlug,
      customCategoryName: result.object.customCategoryName,
      confidence: result.object.confidence,
      recoveryMode: result.recovery.mode,
      errorMessage: result.recovery.errorMessage,
      finishReason: result.recovery.finishReason,
      rawResponseExcerpt: result.recovery.rawResponseExcerpt,
      ...result.metadata,
    })
  }

  return {
    category: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
